import { expect, it } from 'vitest';
import { taskStore } from '../src/tasks/store';
import type { SaveTask } from '../src/domain/task';
import { capture } from './fixtures';

it('removes only the selected record and all its cached images', async () => {
  const captured = capture(); captured.images = [{url:'https://pbs.twimg.com/media/1.png',alt:''},{url:'https://pbs.twimg.com/media/2.png',alt:''}];
  const task: SaveTask = { id:'remove-test', configId:'remove-account', capture:captured, status:'uncertain', createdAt:'2026-09-11', updatedAt:'2026-09-11', uploaded:[], batches:[], finalized:[] };
  const other = {...task, id:'keep-test'};
  await taskStore.put(task); await taskStore.put(other);
  for (let i=0;i<task.capture.images.length;i++) await taskStore.putImage(task.id, i, new Blob(['pending']));
  await taskStore.putImage(other.id, 0, new Blob(['keep']));
  await taskStore.remove(task);
  expect(await taskStore.get(task.id)).toBeUndefined();
  for (let i=0;i<task.capture.images.length;i++) expect(await taskStore.image(task.id, i)).toBeUndefined();
  expect(await taskStore.get(other.id)).toEqual(other);
  expect(await taskStore.image(other.id, 0)).toBeDefined();
});
