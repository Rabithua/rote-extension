import { z } from 'zod';
import { imageUrlAllowed } from './image-url';

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

const pageCaptureFields = {
  sourceId: z.string().min(1).max(300),
  sourceUrl: z.string().url(),
  title: z.string().trim().min(1).max(1000),
  byline: z.string().trim().max(1000),
  text: z.string().trim().max(100_000),
  images: z.array(z.object({ url: z.string().url(), alt: z.string().max(5000) })).max(9),
  complete: z.literal(true),
  capturedAt: z.string().datetime(),
};

export const bilibiliCaptureSchema = z.object({ site: z.literal('bilibili'), ...pageCaptureFields }).superRefine((item, ctx) => {
  if (!item.byline || !/^BV[0-9A-Za-z]{10}$/.test(item.sourceId) || item.images.length !== 1 || !item.images.every(i => imageUrlAllowed(i.url, 'bilibili'))
    || item.sourceUrl !== `https://www.bilibili.com/video/${item.sourceId}`)
    ctx.addIssue({ code: 'custom', message: 'source_mismatch' });
});
export const hackerNewsCaptureSchema = z.object({ site: z.literal('hackernews'), ...pageCaptureFields }).superRefine((item, ctx) => {
  if (!/^\d+$/.test(item.sourceId)
    || item.sourceUrl !== `https://news.ycombinator.com/item?id=${item.sourceId}`
    || item.images.length)
    ctx.addIssue({ code: 'custom', message: 'source_mismatch' });
});
export const arxivCaptureSchema = z.object({ site: z.literal('arxiv'), ...pageCaptureFields }).superRefine((item, ctx) => {
  if (!/^(?:[A-Za-z.-]+\/\d+|\d{4}\.\d{4,5})(?:v\d+)?$/.test(item.sourceId)
    || item.sourceUrl !== `https://arxiv.org/abs/${item.sourceId}`
    || item.images.length)
    ctx.addIssue({ code: 'custom', message: 'source_mismatch' });
});
export const blueskyCaptureSchema = z.object({ site: z.literal('bluesky'), ...pageCaptureFields }).superRefine((item, ctx) => {
  if (!/^did:[^/]+\/post\/[A-Za-z0-9]+$/.test(item.sourceId) || !item.images.every(i => imageUrlAllowed(i.url, 'bluesky'))
    || item.sourceUrl !== `https://bsky.app/profile/${item.sourceId}`)
    ctx.addIssue({ code: 'custom', message: 'source_mismatch' });
});

export const webCaptureSchema = z.object({
  site: z.literal('web'), kind: z.enum(['bookmark', 'selection']), sourceId: z.string().regex(/^[a-f0-9]{64}$/),
  sourceUrl: z.string().url().refine(value => { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }),
  title: z.string().min(1).max(10000), text: z.string().max(950_000),
  images: z.array(z.never()).max(0), complete: z.literal(true), capturedAt: z.string().datetime(),
}).refine(item => item.kind === 'bookmark' ? item.text === '' : !!item.text.trim());

export const captureSchema = z.discriminatedUnion('site', [
  xCaptureSchema, githubCaptureSchema, youtubeCaptureSchema, bilibiliCaptureSchema,
  hackerNewsCaptureSchema, arxivCaptureSchema, blueskyCaptureSchema, webCaptureSchema,
]);
export type CaptureItem = z.infer<typeof captureSchema>;
export function noteContent(item: CaptureItem): string {
  if (item.site === 'bluesky') return [item.text, item.sourceUrl].filter(Boolean).join('\n\n');
  if (item.site === 'web') return item.kind === 'selection' ? [item.title, item.text, item.sourceUrl].join('\n\n') : [item.title, item.sourceUrl].join('\n\n');
  if (item.site === 'youtube') return [item.title, item.sourceUrl].join('\n\n');
  if (item.site === 'github') return [item.repository, item.text.trim(), item.sourceUrl].filter(Boolean).join('\n\n');
  if (item.site !== 'x') return [item.title, item.text, item.sourceUrl].filter(Boolean).join('\n\n');
  return [item.text.trim(), item.sourceUrl,
    item.quotedUrl].filter(Boolean).join('\n\n');
}
