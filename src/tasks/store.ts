import { openDB, type DBSchema } from 'idb';
import type { SaveTask } from '../domain/task';

interface TaskDatabase extends DBSchema {
  tasks: { key: string; value: SaveTask; indexes: { configId: string } };
  images: { key: string; value: Blob };
}
const database = () => openDB<TaskDatabase>('rote-capture', 2, { upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore('tasks', { keyPath: 'id' }).createIndex('configId', 'configId');
    db.createObjectStore('images');
  }
} });
export const taskStore = {
  async get(id: string) { return (await database()).get('tasks', id); },
  async put(task: SaveTask, expectedRevision?: number) {
    const tx = (await database()).transaction('tasks', 'readwrite');
    const previous = await tx.store.get(task.id);
    if (expectedRevision !== undefined && (previous?.revision ?? 0) !== expectedRevision) {
      await tx.done;
      throw new Error('task_changed');
    }
    await tx.store.put(task); await tx.done;
  },
  async list(configId: string) { return (await (await database()).getAllFromIndex('tasks', 'configId', configId)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); },
  async image(id: string, index: number) { return (await database()).get('images', `${id}:${index}`); },
  async putImage(id: string, index: number, blob: Blob) { await (await database()).put('images', blob, `${id}:${index}`); },
  async remove(task: SaveTask) {
    const tx = (await database()).transaction(['tasks', 'images'], 'readwrite');
    await tx.objectStore('tasks').delete(task.id);
    for (let i = 0; i < task.capture.images.length; i++) await tx.objectStore('images').delete(`${task.id}:${i}`);
    await tx.done;
  },
  async releaseImages(task: SaveTask) {
    const tx = (await database()).transaction('images','readwrite');
    for (let i=0; i<task.capture.images.length; i++) await tx.store.delete(`${task.id}:${i}`);
    await tx.done;
  },
};
export type TaskStore = typeof taskStore;
