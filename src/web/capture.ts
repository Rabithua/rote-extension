import { webCaptureSchema } from '../domain/capture';
export async function webCapture(url: string, title: string, selection?: string) {
  const u = new URL(url);
  const kind = selection === undefined ? 'bookmark' : 'selection';
  const text = selection ?? '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([u.href, kind, text])));
  const sourceId = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return webCaptureSchema.parse({ site: 'web', kind, sourceId, sourceUrl: u.href, title: title || u.hostname, text, images: [], complete: true, capturedAt: new Date().toISOString() });
}
