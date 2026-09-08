import { noteContent, type CaptureItem } from '../domain/capture';
import { captureTags } from '../domain/tags';
import { activeStatuses, type SaveTask } from '../domain/task';
import { ApiFailure, matchesUpload, type RoteClient } from '../rote/client';
import type { Settings } from '../settings/store';
import type { TaskStore } from './store';
import { MissingHostPermission } from './images';

type Client = Pick<RoteClient, 'createNote' | 'getNote' | 'findNotes' | 'presign' | 'refresh' | 'finalize'>;
export interface RunnerDependencies {
  store: TaskStore;
  settings: () => Promise<Settings | null>;
  client: (settings: Settings) => Client;
  download: (url: string) => Promise<Blob>;
  upload: (url: string, blob: Blob) => Promise<void>;
  changed: (task: SaveTask) => void;
}
/** All task writes are owned by the background process. No page can write the queue. */
export class SaveRunner {
  private running = new Map<string, Promise<void>>();
  private enqueueTail: Promise<unknown> = Promise.resolve();
  constructor(private deps: RunnerDependencies) {}
  enqueue(capture: CaptureItem, settings: Settings): Promise<SaveTask> {
    const operation = this.enqueueTail.then(async () => {
      const id = `${settings.id}:${capture.site}:${capture.sourceId}`;
      const existing = await this.deps.store.get(id);
      if (existing) return existing;
      const now = new Date().toISOString();
      const task: SaveTask = { id, configId: settings.id, capture, noteDefaults: { tags: captureTags(capture.site, settings, capture.sourceUrl), visibility: settings.defaultVisibility, archived: settings.defaultArchived }, status: 'queued', createdAt: now, updatedAt: now, uploaded: [], batches: [], finalized: [] };
      await this.persist(task);
      return task;
    });
    this.enqueueTail = operation.catch(() => undefined);
    return operation;
  }
  private async persist(task: SaveTask) {
    task.updatedAt = new Date().toISOString();
    await this.deps.store.put(task);
    this.deps.changed(task);
  }
  start(id: string): Promise<void> {
    const existing = this.running.get(id);
    if (existing) return existing;
    const operation = this.run(id).finally(() => { this.running.delete(id); });
    this.running.set(id, operation);
    return operation;
  }
  async recover() {
    const settings = await this.deps.settings();
    if (!settings) return;
    const tasks = await this.deps.store.list(settings.id);
    for (const task of tasks) {
      if (this.running.has(task.id)) continue;
      if (task.status === 'creating') {
        task.status = 'uncertain'; task.error = 'create_uncertain'; await this.persist(task);
      } else if (activeStatuses.includes(task.status)) await this.start(task.id);
    }
  }
  async reconcile(id: string) {
    if (this.running.has(id)) return;
    const settings = await this.deps.settings();
    const task = await this.deps.store.get(id);
    if (!settings || !task || task.configId !== settings.id || task.status !== 'uncertain') return;
    const client = this.deps.client(settings);
    const notes = await client.findNotes(task.capture.sourceUrl, task.noteDefaults?.archived ?? false);
    const exact = notes.filter(note => note.content === noteContent(task.capture));
    if (exact.length !== 1) return;
    task.noteId = exact[0]!.id;
    task.status = 'uploading'; delete task.error;
    await this.persist(task);
    await this.start(id);
  }
  private async run(id: string) {
    const settings = await this.deps.settings();
    const task = await this.deps.store.get(id);
    if (!task || !settings || task.configId !== settings.id || ['saved','uncertain'].includes(task.status)) return;
    const client = this.deps.client(settings);
    try {
      if (task.status === 'creating' && !task.noteId) {
        task.status = 'uncertain'; task.error = 'create_uncertain'; await this.persist(task); return;
      }
      delete task.error; delete task.permissionOrigin;
      if (!task.noteId) {
        task.status = 'creating'; await this.persist(task);
        const note = await client.createNote(task.capture, task.noteDefaults ?? { tags: [], visibility: 'private' });
        task.noteId = note.id;
        task.status = 'uploading'; await this.persist(task);
      }
      if (task.capture.images.length) await this.images(task, client);
      task.status = 'saved'; delete task.error; delete task.permissionOrigin;
      await this.persist(task);
      await this.deps.store.releaseImages(task);
    } catch (error) {
      // A POST may have committed even if its response was lost. Never replay note creation.
      if (!task.noteId && (task.status === 'creating') && !(error instanceof ApiFailure && !error.uncertain)) {
        task.status = 'uncertain'; task.error = 'create_uncertain';
      } else {
        task.status = 'failed';
        task.error = error instanceof MissingHostPermission ? 'host_permission'
          : error instanceof ApiFailure ? `api_${error.status}`
          : error instanceof Error && ['image_download','image_upload','image_size','image_type','invalid_upload','manifest_mismatch','upload_expired'].includes(error.message) ? error.message
          : 'save_failed';
        if (error instanceof MissingHostPermission) task.permissionOrigin = error.origin;
      }
      await this.persist(task);
    }
  }
  private async images(task: SaveTask, client: Client) {
    // Finalize each image in its own transaction. The OpenKey endpoint has no sort
    // permission: sequential creation preserves Rote's (sortIndex, createdAt) ordering.
    for (let index = 0; index < task.capture.images.length; index++) {
      let batch = task.batches[index];
      if (batch) {
        const note = await client.getNote(task.noteId!);
        const attachment = note.attachments?.find(item => matchesUpload(item, batch!));
        if (attachment) {
          task.finalized[index] = attachment.id;
          await this.persist(task);
          continue;
        }
      }
      task.status = 'uploading'; await this.persist(task);
      let blob = await this.deps.store.image(task.id, index);
      if (!blob) {
        blob = await this.deps.download(task.capture.images[index]!.url);
        await this.deps.store.putImage(task.id, index, blob);
      }
      if (!batch) {
        batch = await client.presign([blob]);
        if (batch.items.length !== 1) throw new Error('manifest_mismatch');
        task.batches[index] = batch;
        await this.persist(task);
      }
      let item = batch.items[0]!;
      if (!task.uploaded.includes(item.uuid)) {
        const expires = batch.expiresAt ?? item.expiresAt;
        if (expires && Date.parse(expires) < Date.now() + 30_000) {
          if (!batch.reservationId) throw new Error('upload_expired');
          const refreshed = await client.refresh(batch.reservationId);
          if (refreshed.items.length !== 1 || refreshed.items[0]?.uuid !== item.uuid) throw new Error('manifest_mismatch');
          batch = refreshed; task.batches[index] = batch;
          await this.persist(task); item = batch.items[0]!;
        }
        await this.deps.upload(item.original.putUrl, blob);
        task.uploaded.push(item.uuid); await this.persist(task);
      }
      task.status = 'finalizing'; await this.persist(task);
      const attached = await client.finalize(task.noteId!, batch, [blob]);
      if (attached.length !== 1 || !matchesUpload(attached[0]!, batch)) throw new Error('manifest_mismatch');
      task.finalized[index] = attached[0]!.id;
      await this.persist(task);
    }
    const note = await client.getNote(task.noteId!);
    const capturedIds = new Set(task.finalized);
    const actualOrder = note.attachments?.filter(item => capturedIds.has(item.id)).map(item => item.id) ?? [];
    if (JSON.stringify(actualOrder) !== JSON.stringify(task.finalized)) throw new Error('manifest_mismatch');
  }
}
