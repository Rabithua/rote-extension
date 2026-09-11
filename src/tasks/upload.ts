import type { SaveTask } from '../domain/task';
import { matchesUpload } from '../rote/client';
import type { RunnerDependencies, Client } from './runner';

export async function uploadImages(task: SaveTask, client: Client, deps: RunnerDependencies, persist: (task: SaveTask) => Promise<void>, checkpoint: () => Promise<void>) {
    // Finalize each image in its own transaction. The OpenKey endpoint has no sort
    // permission: sequential creation preserves Rote's (sortIndex, createdAt) ordering.
    for (let index = 0; index < task.capture.images.length; index++) {
      await checkpoint();
      let batch = task.batches[index];
      if (batch) {
        const note = await client.getNote(task.noteId!);
        const attachment = note.attachments?.find(item => matchesUpload(item, batch!));
        if (attachment) {
          task.finalized[index] = attachment.id;
          await persist(task);
          continue;
        }
      }
      task.status = 'uploading'; await persist(task);
      let blob = await deps.store.image(task.id, index);
      if (!blob) {
        blob = await deps.download(task.capture.images[index]!.url);
        await deps.store.putImage(task.id, index, blob);
      }
      if (!batch) {
        await checkpoint();
        batch = await client.presign([blob]);
        if (batch.items.length !== 1) throw new Error('manifest_mismatch');
        task.batches[index] = batch;
        await persist(task);
      }
      let item = batch.items[0]!;
      if (!task.uploaded.includes(item.uuid)) {
        const expires = batch.expiresAt ?? item.expiresAt;
        if (expires && Date.parse(expires) < Date.now() + 30_000) {
          if (!batch.reservationId) throw new Error('upload_expired');
          await checkpoint();
          const refreshed = await client.refresh(batch.reservationId);
          if (refreshed.items.length !== 1 || refreshed.items[0]?.uuid !== item.uuid) throw new Error('manifest_mismatch');
          batch = refreshed; task.batches[index] = batch;
          await persist(task); item = batch.items[0]!;
        }
        await checkpoint();
        await deps.upload(item.original.putUrl, blob);
        task.uploaded.push(item.uuid); await persist(task);
      }
      task.status = 'finalizing'; await persist(task);
      await checkpoint();
      const attached = await client.finalize(task.noteId!, batch, [blob]);
      if (attached.length !== 1 || !matchesUpload(attached[0]!, batch)) throw new Error('manifest_mismatch');
      task.finalized[index] = attached[0]!.id;
      await persist(task);
    }
    const note = await client.getNote(task.noteId!);
    const capturedIds = new Set(task.finalized);
    const actualOrder = note.attachments?.filter(item => capturedIds.has(item.id)).map(item => item.id) ?? [];
    if (JSON.stringify(actualOrder) !== JSON.stringify(task.finalized)) throw new Error('manifest_mismatch');
}
