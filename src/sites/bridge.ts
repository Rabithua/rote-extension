import type { CaptureItem } from '../domain/capture';
import type { TaskView } from '../domain/task';
import { send, type Request } from '../messaging/protocol';
import type { AdapterBridge } from './adapter';

/** Discard responses from a previous page/connection and older task revisions. */
export function createAdapterBridge(site: CaptureItem['site']): AdapterBridge & { reset(): void; accept(task: TaskView): boolean } {
  let generation = 0;
  const revisions = new Map<string, number>();
  const accept = (task: TaskView) => {
    const previous = revisions.get(task.id) ?? -1;
    if ((task.revision ?? 0) < previous) return false;
    revisions.set(task.id, task.revision ?? 0); return true;
  };
  const requestTask = async (request: Request) => {
    const current = generation;
    try {
      const { task } = await send(request);
      return current === generation && task && accept(task) ? task : undefined;
    } catch (error) { if (current === generation) throw error; return undefined; }
  };
  return {
    save: capture => requestTask({ type: 'capture', capture }),
    status: sourceId => requestTask({ type: 'status', site, sourceId }),
    openSettings: async () => { await send({ type: 'open-settings' }); },
    reset: () => { generation++; revisions.clear(); }, accept,
  };
}
