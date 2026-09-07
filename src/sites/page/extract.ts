import {
  arxivCaptureSchema,
  bilibiliCaptureSchema,
  hackerNewsCaptureSchema,
  type CaptureItem,
} from '../../domain/capture';

type PageCapture = Exclude<CaptureItem, { site: 'x' | 'github' | 'youtube' | 'web' }>;

function urlOf(value: string): URL | null {
  try { return new URL(value); } catch { return null; }
}

function text(element: Element | null | undefined): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function meta(doc: Document, selector: string): string {
  return doc.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? '';
}

function image(url: string, allowedHost: (host: string) => boolean, alt: string) {
  const parsed = urlOf(url);
  return parsed?.protocol === 'https:' && allowedHost(parsed.hostname) ? [{ url: parsed.toString(), alt }] : [];
}

function finish<T extends PageCapture>(schema: { safeParse(value: unknown): { success: boolean; data?: T } }, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data! : null;
}

export function bilibiliVideoId(value: string): string | null {
  const url = urlOf(value);
  if (!url || url.origin !== 'https://www.bilibili.com') return null;
  return url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av\d+)\/?$/)?.[1] ?? null;
}

export async function extractBilibili(
  doc: Document = document,
  pageUrl: string = location.href,
  request: typeof fetch = fetch,
): Promise<Extract<PageCapture, { site: 'bilibili' }> | null> {
  const id = bilibiliVideoId(pageUrl);
  if (!id) return null;
  void request;
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  if (bilibiliVideoId(canonical ?? '') !== id || !id.startsWith('BV')) return null;
  const title = text(doc.querySelector('h1.video-title'));
  const author = text(doc.querySelector('.up-name'));
  const cover = meta(doc, 'meta[property="og:image"]');
  if (!title || !author) return null;
  return finish(bilibiliCaptureSchema, {
    site: 'bilibili', sourceId: id, sourceUrl: `https://www.bilibili.com/video/${id}`,
    title, byline: author, text: '', images: image(cover, host => /(^|\.)hdslb\.com$/i.test(host), title),
    complete: true, capturedAt: new Date().toISOString(),
  });
}

export function hackerNewsItemId(value: string): string | null {
  const url = urlOf(value);
  const id = url?.origin === 'https://news.ycombinator.com' && url.pathname === '/item'
    ? url.searchParams.get('id') : null;
  return id && /^\d+$/.test(id) ? id : null;
}

export function extractHackerNews(
  doc: Document = document,
  pageUrl: string = location.href,
): Extract<PageCapture, { site: 'hackernews' }> | null {
  const id = hackerNewsItemId(pageUrl);
  if (!id) return null;
  const title = text(doc.querySelector('.athing .titleline > a'));
  const author = text(doc.querySelector('.subtext .hnuser'));
  const link = doc.querySelector<HTMLAnchorElement>('.athing .titleline > a')?.href;
  const body = doc.querySelector('.toptext');
  const bodyText = body ? Array.from(body.childNodes).map(n => n.nodeName === 'P' ? '\n\n' + text(n as Element) : n.textContent ?? '').join('').trim() : '';
  return finish(hackerNewsCaptureSchema, {
    site: 'hackernews', sourceId: id, sourceUrl: `https://news.ycombinator.com/item?id=${id}`,
    title, byline: author, text: [link && /^https?:/.test(link) && !link.startsWith('https://news.ycombinator.com/item?') ? link : '', bodyText].filter(Boolean).join('\n\n'), images: [],
    complete: true, capturedAt: new Date().toISOString(),
  });
}

export function arxivPaperId(value: string): string | null {
  const url = urlOf(value);
  if (!url || url.origin !== 'https://arxiv.org') return null;
  return url.pathname.match(/^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/i)?.[1] ?? null;
}

export function extractArxiv(
  doc: Document = document,
  pageUrl: string = location.href,
): Extract<PageCapture, { site: 'arxiv' }> | null {
  const id = arxivPaperId(pageUrl);
  if (!id) return null;
  const title = meta(doc, 'meta[name="citation_title"]') || text(doc.querySelector('h1.title')).replace(/^Title:\s*/i, '');
  const authors = Array.from(doc.querySelectorAll<HTMLMetaElement>('meta[name="citation_author"]'))
    .map(item => item.content.trim()).filter(Boolean);
  const byline = authors.length ? authors.join(', ') : text(doc.querySelector('.authors')).replace(/^Authors?:\s*/i, '');
  const summary = text(doc.querySelector('blockquote.abstract')).replace(/^Abstract:\s*/i, '');
  if (!title || !byline || !summary) return null;
  return finish(arxivCaptureSchema, {
    site: 'arxiv', sourceId: id, sourceUrl: `https://arxiv.org/abs/${id}`,
    title, byline, text: summary, images: [], complete: true, capturedAt: new Date().toISOString(),
  });
}

export function blueskyPostId(value: string): string | null {
  const url = urlOf(value);
  if (!url || url.origin !== 'https://bsky.app') return null;
  const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([A-Za-z0-9]+)$/);
  return match ? `${match[1]}/post/${match[2]}` : null;
}

