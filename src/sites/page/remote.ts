import { z } from 'zod';
import { bilibiliCaptureSchema, blueskyCaptureSchema } from '../../domain/capture';

const requestSchema = z.object({ site: z.enum(['bilibili', 'bluesky']), url: z.string().url() });
export async function remoteCapture(raw: unknown) {
  const { site, url } = requestSchema.parse(raw);
  const source = new URL(url);
  let endpoint: URL;
  if (site === 'bilibili') {
    const id = source.origin === 'https://www.bilibili.com' && source.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10}|av\d+)\/?$/)?.[1];
    if (!id) throw new Error('unsupported');
    endpoint = new URL('https://api.bilibili.com/x/web-interface/view');
    endpoint.searchParams.set(id.startsWith('av') ? 'aid' : 'bvid', id.replace(/^av/, ''));
    const response = await fetch(endpoint, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
    const payload = z.object({ code: z.literal(0), data: z.object({ bvid: z.string(), aid: z.number().optional(), title: z.string(), pic: z.string(), owner: z.object({ name: z.string() }) }) }).parse(await response.json());
    const d = payload.data;
    if (id.startsWith('BV') ? d.bvid !== id : d.aid !== Number(id.slice(2))) throw new Error('unsupported');
    return bilibiliCaptureSchema.parse({ site, sourceId: d.bvid, sourceUrl: `https://www.bilibili.com/video/${d.bvid}`, title: d.title, byline: d.owner.name, text: '', images: [{ url: d.pic.replace(/^http:/, 'https:'), alt: d.title }], complete: true, capturedAt: new Date().toISOString() });
  }
  const match = source.origin === 'https://bsky.app' && source.pathname.match(/^\/profile\/([^/]+)\/post\/([A-Za-z0-9]+)$/);
  if (!match) throw new Error('unsupported');
  endpoint = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread');
  endpoint.searchParams.set('uri', `at://${match[1]}/app.bsky.feed.post/${match[2]}`);
  endpoint.searchParams.set('depth', '0'); endpoint.searchParams.set('parentHeight', '0');
  const response = await fetch(endpoint, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
  const image = z.object({ fullsize: z.string(), alt: z.string() });
  const embed = z.object({ $type: z.string(), images: z.array(image).optional(), media: z.object({ images: z.array(image).optional() }).optional(), record: z.unknown().optional() });
  const d = z.object({ thread: z.object({ post: z.object({ uri: z.string(), author: z.object({ did: z.string(), handle: z.string(), displayName: z.string().optional() }), record: z.object({ $type: z.literal('app.bsky.feed.post'), text: z.string(), createdAt: z.string().datetime() }), embed: embed.optional() }) }) }).parse(await response.json()).thread.post;
  const recordId = d.uri.split('/').at(-1);
  if (recordId !== match[2]) throw new Error('unsupported');
  const quote = z.object({ uri: z.string() }).safeParse((d.embed?.record as { record?: unknown })?.record ?? d.embed?.record);
  const quoted = quote.success ? quote.data.uri.match(/^at:\/\/([^/]+)\/app.bsky.feed.post\/([^/]+)$/) : null;
  const images = d.embed?.images ?? d.embed?.media?.images ?? [];
  return blueskyCaptureSchema.parse({ site, sourceId: `${d.author.did}/post/${recordId}`, sourceUrl: `https://bsky.app/profile/${d.author.did}/post/${recordId}`, title: d.author.displayName || d.author.handle, byline: `@${d.author.handle}\n${d.record.createdAt}`, text: [d.record.text, quoted ? `https://bsky.app/profile/${quoted[1]}/post/${quoted[2]}` : ''].filter(Boolean).join('\n\n'), images: images.map(i => ({ url: i.fullsize, alt: i.alt })), complete: true, capturedAt: new Date().toISOString() });
}
