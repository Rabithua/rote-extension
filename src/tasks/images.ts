import { imageUrlAllowed } from '../domain/image-url';
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export class MissingHostPermission extends Error {
  constructor(public origin: string) { super('host_permission'); }
}
export async function downloadImage(url: string): Promise<Blob> {
  if (!imageUrlAllowed(url)) throw new Error('image_download');
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error('image_download');
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
    credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error('image_upload');
}
