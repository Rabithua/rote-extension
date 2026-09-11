import { ApiFailure } from '../rote/client';
import { imageUrlAllowed } from '../domain/image-url';
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export class ImageFailure extends ApiFailure {
  constructor(status: number, public stage: 'image_download' | 'image_upload', retryAfter = 0) { super(status, false, retryAfter); }
}
export class MissingHostPermission extends Error {
  constructor(public origin: string) { super('host_permission'); }
}
export async function downloadImage(url: string): Promise<Blob> {
  if (!imageUrlAllowed(url)) throw new Error('image_download');
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(25_000) }).catch(() => { throw new ImageFailure(0, 'image_download'); });
  if (!response.ok) throw new ImageFailure(response.status, 'image_download', retryAfter(response));
  const type = response.headers.get('content-type')?.split(';')[0] ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('image_type');
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new Error('image_size');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('image_download');
  const parts: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error('image_size');
      parts.push(value.slice().buffer);
    }
  } catch (error) { await reader.cancel(); throw error; }
  if (!size) throw new Error('image_download');
  return new Blob(parts, { type });
}
export async function uploadImage(url: string, blob: Blob) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) throw new Error('invalid_upload');
  if (!await chrome.permissions.contains({ origins: [`${parsed.origin}/*`] })) throw new MissingHostPermission(parsed.origin);
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob,
    credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(25_000) }).catch(() => { throw new ImageFailure(0, 'image_upload'); });
  if (!response.ok) throw new ImageFailure(response.status, 'image_upload', retryAfter(response));
}

function retryAfter(response: Response) { const value = response.headers.get('Retry-After'); if (!value) return 0; return Math.max(0, Number.isFinite(Number(value)) ? Number(value) * 1000 : (Date.parse(value) - Date.now()) || 0); }
