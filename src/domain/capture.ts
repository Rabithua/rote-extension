import { z } from 'zod';

export const xCaptureSchema = z.object({
  site: z.literal('x'),
  sourceId: z.string().regex(/^\d+$/),
  sourceUrl: z.string().url().refine(value => /^https:\/\/x\.com\/[^/]+\/status\/\d+$/.test(value)),
  author: z.object({ name: z.string().min(1).max(300), handle: z.string().regex(/^@[A-Za-z0-9_]+$/) }),
  publishedAt: z.string().datetime(),
  text: z.string().max(950_000),
  images: z.array(z.object({
    url: z.string().url().refine(value => {
      const url = new URL(value);
      return url.origin === 'https://pbs.twimg.com' && url.pathname.startsWith('/media/');
    }),
    alt: z.string().max(5000),
  })).max(9),
  quotedUrl: z.string().url().optional(),
  complete: z.literal(true),
  capturedAt: z.string().datetime(),
}).superRefine((item, ctx) => {
  if (!item.sourceUrl.endsWith(`/status/${item.sourceId}`)) ctx.addIssue({ code: 'custom', message: 'source_mismatch' });
  if (!item.text.trim() && !item.images.length) ctx.addIssue({ code: 'custom', message: 'empty_capture' });
  if (item.quotedUrl && !/^https:\/\/x\.com\/[^/]+\/status\/\d+$/.test(item.quotedUrl)) ctx.addIssue({ code: 'custom', message: 'invalid_quote' });
});
export const githubCaptureSchema = z.object({
  site: z.literal('github'),
  sourceId: z.string(),
  sourceUrl: z.string().url(),
  repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/),
  text: z.string().max(10000),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).max(0),
  complete: z.literal(true),
  capturedAt: z.string().datetime(),
}).superRefine((item, ctx) => {
  if (item.sourceId !== item.repository.toLowerCase() || item.sourceUrl !== `https://github.com/${item.repository}`)
    ctx.addIssue({ code: 'custom', message: 'source_mismatch' });
});
export const youtubeCaptureSchema = z.object({
  site: z.literal('youtube'),
  sourceId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  sourceUrl: z.string().url(),
  title: z.string().trim().min(1).max(1000),
  channel: z.string().trim().min(1).max(300),
  text: z.literal(''),
  images: z.array(z.object({ url: z.string().url(), alt: z.string().max(1000) })).length(1),
  complete: z.literal(true),
  capturedAt: z.string().datetime(),
}).superRefine((item, ctx) => {
  if (item.sourceUrl !== `https://www.youtube.com/watch?v=${item.sourceId}`
    || item.images[0]?.url !== `https://i.ytimg.com/vi/${item.sourceId}/hqdefault.jpg`)
    ctx.addIssue({ code: 'custom', message: 'source_mismatch' });
});
export const captureSchema = z.discriminatedUnion('site', [xCaptureSchema, githubCaptureSchema, youtubeCaptureSchema]);
export type CaptureItem = z.infer<typeof captureSchema>;
export function noteContent(item: CaptureItem): string {
  if (item.site === 'youtube') return [item.title, item.channel, item.sourceUrl].join('\n\n');
  if (item.site === 'github') return [item.repository, item.text.trim(), item.sourceUrl].filter(Boolean).join('\n\n');
  return [item.text.trim(), `${item.author.name} (${item.author.handle})`, item.publishedAt, item.sourceUrl,
    item.quotedUrl].filter(Boolean).join('\n\n');
}
