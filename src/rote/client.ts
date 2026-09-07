import { z } from 'zod';
import type { CaptureItem } from '../domain/capture';
import { noteContent } from '../domain/capture';

const attachmentSchema = z.object({ id: z.string().uuid(), url: z.string(), details: z.object({ key: z.string().optional() }).nullable().optional() });
export type RoteAttachment = z.infer<typeof attachmentSchema>;
const noteSchema = z.object({ id: z.string().uuid(), content: z.string(), attachments: z.array(attachmentSchema).optional() });
const manifestSchema = z.object({
  reservationId: z.string().optional(), expiresAt: z.string().optional(),
  items: z.array(z.object({ uuid: z.string().uuid(), expiresAt: z.string().optional(), original: z.object({
    key: z.string(), putUrl: z.string().url(), contentType: z.string().optional(),
  }) })),
});
export type UploadManifest = z.infer<typeof manifestSchema>;
export type RoteNote = z.infer<typeof noteSchema>;
export class ApiFailure extends Error {
  constructor(public status: number, public uncertain = false) { super(`api_${status}`); }
}
export class RoteClient {
  constructor(private config: { apiUrl: string; openKey: string }, private request = fetch) {}
  private async call(path: string, method: 'GET' | 'POST', body?: object): Promise<unknown> {
    const url = new URL(`${this.config.apiUrl}/v2/api/openkey${path}`);
    if (method === 'GET') url.searchParams.set('openkey', this.config.openKey);
    let response: Response;
    try {
      const request = this.request;
      response = await request(url, { method, credentials: 'omit', redirect: 'error',
        signal: AbortSignal.timeout(25_000),
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, openkey: this.config.openKey }) } : {}) });
    } catch { throw new ApiFailure(0, method === 'POST'); }
    if (!response.ok) throw new ApiFailure(response.status, method === 'POST' && response.status >= 500);
    try {
      return z.object({ data: z.unknown() }).parse(await response.json()).data;
    } catch { throw new ApiFailure(response.status, method === 'POST'); }
  }
  async permissions() {
    return z.object({ permissions: z.array(z.string()) }).parse(await this.call('/permissions', 'GET')).permissions;
  }
  async createNote(capture: CaptureItem): Promise<RoteNote> {
    const data = await this.call('/notes', 'POST', { content: noteContent(capture), title: '', state: 'private', tags: [], editor: 'normal', pin: false });
    const parsed = noteSchema.safeParse(data);
    if (!parsed.success) throw new ApiFailure(201, true);
    return parsed.data;
  }
  async getNote(id: string): Promise<RoteNote> { return noteSchema.parse(await this.call(`/notes/${encodeURIComponent(id)}`, 'GET')); }
  async findNotes(sourceUrl: string): Promise<RoteNote[]> {
    return z.array(noteSchema).parse(await this.call(`/notes/search?keyword=${encodeURIComponent(sourceUrl)}&limit=100`, 'GET'));
  }
  async presign(blobs: Blob[]): Promise<UploadManifest> {
    return manifestSchema.parse(await this.call('/attachments/presign', 'POST', { files: blobs.map((blob, index) => ({
      filename: `x-${index + 1}.${blob.type.split('/')[1]}`, contentType: blob.type, size: blob.size, mediaKind: 'image',
    })) }));
  }
  async refresh(id: string): Promise<UploadManifest> {
    return manifestSchema.parse(await this.call(`/attachments/reservations/${encodeURIComponent(id)}/refresh`, 'POST', {}));
  }
  async finalize(noteId: string, manifest: UploadManifest, blobs: Blob[]) {
    return z.array(attachmentSchema).parse(await this.call('/attachments/finalize', 'POST', {
      noteId, attachments: manifest.items.map((item, index) => ({ uuid: item.uuid, originalKey: item.original.key,
        size: blobs[index]!.size, mimetype: blobs[index]!.type, mediaKind: 'image' })),
    }));
  }
}

export function matchesUpload(attachment: RoteAttachment, manifest: UploadManifest): boolean {
  const item = manifest.items[0];
  if (!item) return false;
  const key = attachment.details?.key ?? new URL(attachment.url).pathname;
  const filename = key.split('/').at(-1) ?? '';
  return filename === item.uuid || filename.startsWith(`${item.uuid}.`);
}
