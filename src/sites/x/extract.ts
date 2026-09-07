import { captureSchema, type CaptureItem } from '../../domain/capture';

const QUOTE = '[data-testid="quoteTweet"], div[role="link"], [data-testid="card.wrapper"]';
export function ownElements<T extends Element>(article: Element, selector: string): T[] {
  return Array.from(article.querySelectorAll<T>(selector)).filter(element => {
    if (element.closest('[data-testid="tweet"]') !== article) return false;
    let parent = element.parentElement;
    while (parent && parent !== article) {
      if (parent.matches(QUOTE)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
}
export function canonicalPost(value: string): { id: string; url: string } | null {
  try {
    const url = new URL(value, 'https://x.com');
    if (!['x.com','twitter.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)(?:\/.*)?$/);
    return match ? { id: match[2]!, url: `https://x.com/${match[1]}/status/${match[2]}` } : null;
  } catch { return null; }
}
function readText(element: Element): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('img[alt]').forEach(image => image.replaceWith(image.getAttribute('alt') ?? ''));
  copy.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return copy.textContent?.trim() ?? '';
}
export function extractPost(article: Element): CaptureItem {
  const textElements = ownElements<HTMLElement>(article, '[data-testid="tweetText"]');
  const more = ownElements<HTMLElement>(article, '[data-testid="tweet-text-show-more-link"], button, a').some(element =>
    element.matches('[data-testid="tweet-text-show-more-link"]') || /^(Show more|显示更多|顯示更多)$/.test(element.textContent?.trim() ?? ''));
  if (more) throw new Error('incomplete');
  const timestamp = ownElements<HTMLTimeElement>(article, 'time[datetime]')[0];
  const identity = timestamp?.closest('a')?.getAttribute('href');
  const source = identity ? canonicalPost(identity) : null;
  const author = ownElements<HTMLElement>(article, '[data-testid="User-Name"]')[0];
  const links = author ? Array.from(author.querySelectorAll<HTMLAnchorElement>('a[href]')) : [];
  const handle = links.map(link => link.textContent?.trim()).find(text => /^@[A-Za-z0-9_]+$/.test(text ?? ''));
  const name = links.find(link => link.textContent?.trim() && !link.textContent.trim().startsWith('@') && !link.querySelector('time'))?.textContent?.trim();
  if (!source || !timestamp?.dateTime || !name || !handle) throw new Error('unsupported');
  const images = ownElements<HTMLImageElement>(article, '[data-testid="tweetPhoto"] img').flatMap(image => {
    // Video/GIF posters and quoted media are not static attachments of this post.
    if (image.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"]')) return [];
    try {
      const url = new URL(image.currentSrc || image.src);
      if (url.origin !== 'https://pbs.twimg.com' || !url.pathname.startsWith('/media/')) return [];
      url.searchParams.set('name', 'orig');
      return [{ url: url.href, alt: image.alt }];
    } catch { return []; }
  });
  const quotedUrl = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="quoteTweet"], div[role="link"]'))
    .flatMap(quote => Array.from(quote.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')))
    .map(link => canonicalPost(link.getAttribute('href') ?? '')?.url).find(url => url && url !== source.url);
  const text = textElements.map(readText).filter(Boolean).join('\n\n');
  if (!text && !images.length) throw new Error('empty_capture');
  const result = captureSchema.safeParse({ site: 'x', sourceId: source.id, sourceUrl: source.url,
    author: { name, handle }, publishedAt: new Date(timestamp.dateTime).toISOString(), text,
    images: images.filter((image,index) => images.findIndex(other => other.url === image.url) === index),
    quotedUrl, complete: true, capturedAt: new Date().toISOString() });
  if (!result.success) throw new Error('unsupported');
  return result.data;
}
