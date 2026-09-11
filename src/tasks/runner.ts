import { noteContent, type CaptureItem } from '../domain/capture';
import { captureTags } from '../domain/tags';
import { activeStatuses, sourceKey, type ReconciliationResult, type SaveTask } from '../domain/task';
import { ApiFailure, type RoteClient } from '../rote/client';
import type { Settings } from '../settings/store';
import type { TaskStore } from './store';
import { MissingHostPermission, ImageFailure } from './images';
import { uploadImages } from './upload';

export type Client = Pick<RoteClient, 'createNote' | 'getNote' | 'findNotes' | 'presign' | 'refresh' | 'finalize'>;
export interface RunnerDependencies {
  store: TaskStore;
  settings: () => Promise<Settings | null>;
  client: (settings: Settings) => Client;
  download: (url: string) => Promise<Blob>;
  upload: (url: string, blob: Blob) => Promise<void>;
  changed: (task: SaveTask) => void;
}
const backoff = [30_000, 120_000, 600_000];
class Paused extends Error {}
class Cancelled extends Error {}
/** Only the background writes tasks. Network operations use a persisted creation identity. */
export class SaveRunner {
  private running = new Map<string, Promise<unknown>>();
  private enqueueTail: Promise<unknown> = Promise.resolve();
  constructor(private deps: RunnerDependencies) {}
  async find(capture: Pick<CaptureItem, 'site' | 'sourceId'>, settings: Settings) {
    const tasks = await this.deps.store.list(settings.id);
    return tasks.find(task => task.capture.site === capture.site && task.capture.sourceId === capture.sourceId &&
      (!task.replacementId || !tasks.some(candidate => candidate.id === task.replacementId)));
  }
  enqueue(capture: CaptureItem, settings: Settings, replacement?: { id: string; defaults: SaveTask['noteDefaults'] }): Promise<SaveTask> {
    const operation = this.enqueueTail.then(async () => {
      const current = await this.deps.settings();
      if (current?.id !== settings.id) throw new Error('not_allowed');
      const existing = replacement ? await this.deps.store.get(replacement.id) : await this.find(capture, settings);
      if (existing) return existing;
      const now = new Date().toISOString();
      const task: SaveTask = { id: replacement?.id ?? crypto.randomUUID(), sourceKey: sourceKey(capture), configId: settings.id,
        createId: crypto.randomUUID(), createProtocol: settings.noteCreateIdempotency, creation: 'pending', retryCount: 0,
        capture, noteDefaults: replacement?.defaults ?? { tags: captureTags(capture.site, settings, capture.sourceUrl), visibility: settings.defaultVisibility, archived: settings.defaultArchived },
        status: 'queued', createdAt: now, updatedAt: now, uploaded: [], batches: [], finalized: [] };
      await this.persist(task); return task;
    });
    this.enqueueTail = operation.catch(() => undefined); return operation;
  }
  private async persist(task: SaveTask) {
    const current = await this.deps.store.get(task.id);
    if ((current?.revision ?? 0) !== (task.revision ?? 0)) {
      if (!task.operationId || current?.operationId !== task.operationId) throw new Error('task_changed');
      // Cancellation can arrive while a network response is in flight. Preserve its intent.
      task.cancelRequested = current.cancelRequested; task.hiddenAt = current.hiddenAt;
      task.revision = current.revision;
    }
    const revision = task.revision ?? 0;
    const next = { ...task, revision: revision + 1, updatedAt: new Date().toISOString() };
    await this.deps.store.put(next, revision); Object.assign(task, next); this.deps.changed(task);
  }
  private lock<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (this.running.has(id)) return Promise.reject(new Error('task_busy'));
    const operation = action().finally(() => this.running.delete(id));
    this.running.set(id, operation); return operation;
  }
  start(id: string): Promise<void> {
    const existing = this.running.get(id);
    return existing ? existing.then(() => undefined) : this.lock(id, () => this.run(id));
  }
  private async owned(id: string) {
    const settings = await this.deps.settings(); const task = await this.deps.store.get(id);
    if (!settings || !task || task.configId !== settings.id) throw new Error('not_allowed');
    return { settings, task };
  }
  async rebind(previous: Settings | null, settings: Settings) {
    if (!previous || previous.apiUrl !== settings.apiUrl || !settings.ownerId ||
      !(previous.ownerId ? previous.ownerId === settings.ownerId : previous.openKey === settings.openKey) || previous.id === settings.id) return;
    await Promise.allSettled([...this.running.values()]);
    if ((await this.deps.settings())?.id !== settings.id) return;
    for (const task of await this.deps.store.list(previous.id)) {
      task.configId = settings.id; await this.persist(task);
    }
  }
  async recover() {
    const settings = await this.deps.settings(); if (!settings) return;
    for (const task of await this.deps.store.list(settings.id)) {
      if (this.running.has(task.id)) continue;
      if (task.replacementId && !await this.deps.store.get(task.replacementId)) {
        const replacement = await this.enqueue(task.capture, settings, { id: task.replacementId, defaults: task.noteDefaults ?? { tags: [], visibility: 'private' } });
        for (let i = 0; i < task.capture.images.length; i++) {
          const blob = await this.deps.store.image(task.id, i);
          if (blob) await this.deps.store.putImage(replacement.id, i, blob);
        }
        await this.start(replacement.id);
      }
      if (task.status === 'uncertain' && task.cancelRequested && task.createProtocol && (task.retryCount ?? 0) < 3 && (task.nextRetryAt ?? 0) <= Date.now()) {
        await this.lock(task.id, async () => {
          try { await this.checkResult(task.id); } catch (error) {
            if (!(error instanceof ApiFailure)) throw error;
            const current = await this.deps.store.get(task.id); if (!current) return;
            current.retryCount = (current.retryCount ?? 0) + 1;
            current.nextRetryAt = Date.now() + backoff[current.retryCount - 1]!; await this.persist(current);
          }
        });
      }
      if (task.hiddenAt && !task.compacted && task.status === 'saved' && Date.now() - task.hiddenAt >= 30_000) {
        await this.lock(task.id, async () => {
          await this.deps.store.releaseImages(task);
          task.capture = { ...task.capture, text: '', images: [] };
          task.noteDefaults = undefined; task.batches = []; task.uploaded = []; task.finalized = [];
          task.compacted = true; await this.persist(task);
        });
      }
      if (activeStatuses.includes(task.status) || task.status === 'waiting' && (task.nextRetryAt ?? 0) <= Date.now()) await this.start(task.id);
    }
  }
  reconcile(id: string) { return this.lock(id, () => this.checkResult(id)); }
  private async checkResult(id: string): Promise<ReconciliationResult> {
    const { settings, task } = await this.owned(id);
    if (task.status !== 'uncertain') throw new Error('task_changed');
    const client = this.deps.client(settings);
    let found: string | undefined = task.noteId;
    if (found) await client.getNote(found);
    else if (task.createProtocol === 1 && task.createId) {
      const note = await client.getNote(task.createId); found = note.id;
      if (found !== task.createId) throw new Error('identity_mismatch');
    } else {
      const archived = task.noteDefaults?.archived ?? false;
      const results = await Promise.all([client.findNotes(task.capture.sourceUrl, archived), client.findNotes(task.capture.sourceUrl, !archived)]);
      const notes = [...new Map(results.flat().map(note => [note.id, note])).values()];
      const exact = notes.filter(note => note.content === noteContent(task.capture));
      if (!notes.length) return 'not_found';
      if (!exact.length) return 'mismatch';
      if (exact.length > 1) return 'ambiguous';
      found = exact[0]!.id;
    }
    task.noteId = found; task.creation = 'confirmed'; task.status = task.cancelRequested ? 'cancelled' : 'uploading';
    delete task.error; await this.persist(task);
    if (!task.cancelRequested) await this.run(id);
    return 'matched';
  }
  retry(id: string): Promise<ReconciliationResult | undefined> {
    return this.lock(id, async () => {
      const { task } = await this.owned(id);
      if (task.status === 'uncertain' && (!task.createProtocol || task.error === 'identity_mismatch' || task.cancelRequested)) return this.checkResult(id);
      if (!['failed','uncertain','waiting','cancelled'].includes(task.status)) throw new Error('task_changed');
      delete task.cancelRequested; delete task.nextRetryAt; task.retryCount = 0;
      task.status = 'queued'; await this.persist(task); await this.run(id);
    });
  }
  recreate(id: string, confirmed: boolean): Promise<ReconciliationResult | undefined> {
    return this.lock(id, async () => {
      const { task, settings } = await this.owned(id);
      if (task.compacted) throw new Error('capture_removed');
      if (!['uncertain','saved','cancelled','failed'].includes(task.status)) throw new Error('task_changed');
      if (task.status === 'uncertain' && !task.replacementId) {
        let result: ReconciliationResult;
        try { result = await this.checkResult(id); } catch (error) {
          if (!(error instanceof ApiFailure)) throw error;
          result = 'unavailable';
        }
        if (result === 'matched' || !confirmed) return result;
      } else if (!confirmed) return 'not_found';
      // Persist the successor first so a restart or duplicate click reuses it.
      task.replacementId ??= crypto.randomUUID(); await this.persist(task);
      const next = await this.enqueue(task.capture, settings, { id: task.replacementId, defaults: task.noteDefaults ?? { tags: [], visibility: 'private' } });
      for (let i = 0; i < task.capture.images.length; i++) {
        const blob = await this.deps.store.image(task.id, i);
        if (blob) await this.deps.store.putImage(next.id, i, blob);
      }
      await this.start(next.id);
    });
  }
  async cancel(id: string) {
    const { task } = await this.owned(id);
    if (['saved','cancelled'].includes(task.status)) throw new Error('task_changed');
    task.cancelRequested = true; delete task.nextRetryAt;
    if (!this.running.has(id)) task.status = task.creation === 'sent' && !task.noteId ? 'uncertain' : 'cancelled';
    await this.persist(task);
  }
  remove(id: string) {
    return this.lock(id, async () => {
      const { task } = await this.owned(id);
      if (activeStatuses.includes(task.status) || task.status === 'waiting') throw new Error('task_busy');
      task.hiddenAt = Date.now(); await this.persist(task);
    });
  }
  restore(id: string) {
    return this.lock(id, async () => {
      const { task } = await this.owned(id);
      if (task.compacted || !task.hiddenAt || Date.now() - task.hiddenAt > 30_000) throw new Error('undo_expired');
      delete task.hiddenAt; await this.persist(task);
    });
  }
  private async run(id: string) {
    const { settings, task } = await this.owned(id);
    if (['saved','cancelled'].includes(task.status) || task.status === 'uncertain' && (!task.createProtocol || task.error === 'identity_mismatch')) return;
    if (task.status === 'waiting' && (task.nextRetryAt ?? 0) > Date.now()) return;
    task.sourceKey ??= sourceKey(task.capture);
    if (task.status === 'creating' && !task.noteId) task.creation = 'sent';
    task.creation ??= task.noteId ? 'confirmed' : ['creating','uncertain'].includes(task.status) ? 'sent' : 'pending';
    if (!task.createId && task.creation !== 'sent') { task.createId = crypto.randomUUID(); task.createProtocol = settings.noteCreateIdempotency; }
    if (!task.noteId && ['pending','rejected'].includes(task.creation)) task.createProtocol = settings.noteCreateIdempotency;
    task.operationId = crypto.randomUUID(); await this.persist(task);
    const client = this.deps.client(settings);
    let creatingRequestStarted = false;
    const checkpoint = async () => {
      const current = await this.deps.store.get(id);
      if (current?.cancelRequested) { task.cancelRequested = true; throw new Cancelled(); }
      const connection = await this.deps.settings();
      if (connection?.id !== settings.id || connection.openKey !== settings.openKey) throw new Paused();
    };
    try {
      if (task.creation === 'sent' && !task.noteId && (!task.createProtocol || settings.noteCreateIdempotency !== 1)) {
        task.status = 'uncertain'; task.error = 'create_uncertain'; await this.persist(task); return;
      }
      await checkpoint(); delete task.error; delete task.permissionOrigin; delete task.nextRetryAt;
      if (task.noteId) await client.getNote(task.noteId);
      if (!task.noteId) {
        if (task.createProtocol && settings.noteCreateIdempotency !== 1) {
          task.status = 'uncertain'; task.error = 'protocol_unavailable'; await this.persist(task); return;
        }
        task.status = 'creating'; task.creation = 'sent'; await this.persist(task);
        await checkpoint();
        const defaults = task.noteDefaults ?? { tags: [], visibility: 'private' as const };
        creatingRequestStarted = true;
        const note = task.createProtocol ? await client.createNote(task.capture, defaults, task.createId) : await client.createNote(task.capture, defaults);
        task.noteId = note.id; task.creation = 'confirmed';
        if (task.createProtocol && note.id !== task.createId) {
          task.status = 'uncertain'; task.error = 'identity_mismatch'; task.createProtocol = undefined; await this.persist(task); return;
        }
        task.status = 'uploading'; await this.persist(task);
      }
      await checkpoint();
      if (task.capture.images.length) await uploadImages(task, client, this.deps, value => this.persist(value), checkpoint);
      await checkpoint(); task.status = 'saved'; delete task.error; delete task.permissionOrigin; delete task.nextRetryAt;
      await this.persist(task); await this.deps.store.releaseImages(task);
    } catch (error) {
      if (error instanceof Paused) return;
      if (error instanceof DOMException && ['QuotaExceededError','UnknownError'].includes(error.name)) throw error;
      if (error instanceof Error && error.message === 'task_changed') throw error;
      if (error instanceof Cancelled || (await this.deps.store.get(id))?.cancelRequested) {
        task.cancelRequested = true; task.status = task.noteId || task.creation !== 'sent' ? 'cancelled' : 'uncertain';
        task.error = task.status === 'uncertain' ? 'cancel_unconfirmed' : undefined;
      } else {
        const unknownCreate = !task.noteId && task.creation === 'sent' && (creatingRequestStarted || task.status !== 'creating') && !(error instanceof ApiFailure && !error.uncertain);
        if (!task.noteId && !unknownCreate) task.creation = 'rejected';
        task.status = unknownCreate ? 'uncertain' : 'failed';
        task.error = error instanceof MissingHostPermission ? 'host_permission' : error instanceof ImageFailure ? error.stage : error instanceof ApiFailure ? (error.status === 404 && task.noteId ? 'note_missing' : `api_${error.status}`)
          : error instanceof Error && ['image_download','image_upload','image_size','image_type','invalid_upload','manifest_mismatch','upload_expired'].includes(error.message) ? error.message : 'save_failed';
        if (unknownCreate) task.error = 'create_uncertain';
        if (error instanceof MissingHostPermission) task.permissionOrigin = error.origin;
        const transient = error instanceof ApiFailure && (error.uncertain || error.status === 0 || error.status === 429 || error.status >= 500);
        const attempts = task.retryCount ?? 0;
        if (transient && (task.noteId || task.createProtocol || !unknownCreate) && attempts < backoff.length) {
          task.retryCount = attempts + 1; task.nextRetryAt = Date.now() + Math.max(backoff[attempts]!, error.retryAfter);
          task.status = 'waiting';
        }
      }
      await this.persist(task);
    }
  }
}
