import type { CaptureItem } from '../domain/capture';
import type { TaskView } from '../domain/task';
import type { Settings, SettingsInput } from '../settings/store';

export type Request =
  | { type: 'capture'; capture: CaptureItem }
  | { type: 'status'; sourceId: string }
  | { type: 'open-settings' }
  | { type: 'settings:get' }
  | { type: 'settings:save'; settings: SettingsInput }
  | { type: 'tasks:list' }
  | { type: 'tasks:retry'; id: string }
  | { type: 'tasks:reconcile'; id: string };
export interface ResponseData { task?: TaskView; tasks?: TaskView[]; settings?: Settings | null; permissions?: string[] }
export type Reply = { ok: true; data: ResponseData } | { ok: false; error: string };
export async function send(request: Request): Promise<ResponseData> {
  const reply = await chrome.runtime.sendMessage(request) as Reply;
  if (!reply?.ok) throw new Error(reply?.error ?? 'save_failed');
  return reply.data;
}
