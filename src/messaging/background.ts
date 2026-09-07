import { z } from 'zod';
import { captureSchema } from '../domain/capture';
import { taskView, type SaveTask } from '../domain/task';
import { ApiFailure, RoteClient } from '../rote/client';
import { originPattern, protectStorage, readSettings, settingsSchema, writeSettings } from '../settings/store';
import { taskStore } from '../tasks/store';
import { SaveRunner } from '../tasks/runner';
import { downloadImage, uploadImage } from '../tasks/images';
import type { Reply, ResponseData } from './protocol';

const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('capture'), capture: captureSchema }),
  z.object({ type: z.literal('status'), site: z.enum(['x','github']), sourceId: z.string().min(1).max(200) }),
  z.object({ type: z.literal('open-settings') }),
  z.object({ type: z.literal('settings:get') }),
  z.object({ type: z.literal('settings:save'), settings: settingsSchema }),
  z.object({ type: z.literal('tasks:list') }),
  z.object({ type: z.literal('tasks:retry'), id: z.string().max(200) }),
  z.object({ type: z.literal('tasks:reconcile'), id: z.string().max(200) }),
]);
export function isTrustedPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && [chrome.runtime.getURL('options.html'), chrome.runtime.getURL('popup.html')].some(url => sender.url?.split('?')[0] === url);
}
function changed(task: SaveTask) {
  void chrome.runtime.sendMessage({ type: 'task:changed', task: taskView(task) }).catch(() => undefined);
  // Never include credentials or signed upload URLs in content-script notifications.
  void chrome.tabs.query({ url: task.capture.site === 'x' ? 'https://x.com/*' : 'https://github.com/*' }).then(tabs => Promise.all(tabs.map(tab => tab.id === undefined ? undefined
    : chrome.tabs.sendMessage(tab.id, { type: 'task:changed', task: taskView(task) }).catch(() => undefined))));
}
export function installBackground() {
  chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });
  const runner = new SaveRunner({ store: taskStore, settings: readSettings, client: settings => new RoteClient(settings),
    download: downloadImage, upload: uploadImage, changed });
  const ready = protectStorage();
  const start = (id: string) => { void runner.start(id).catch(() => chrome.action.setBadgeText({ text: '!' })); };
  async function handle(raw: unknown, sender: chrome.runtime.MessageSender): Promise<ResponseData> {
    await ready;
    if (sender.id !== chrome.runtime.id) throw new Error('not_allowed');
    const request = requestSchema.parse(raw);
    const trusted = isTrustedPage(sender);
    if (!trusted && !isSiteRequestAllowed(sender, request)) throw new Error('not_allowed');
    const settings = await readSettings();
    if (request.type === 'open-settings') { await chrome.runtime.openOptionsPage(); return {}; }
    if (request.type === 'settings:get') return { settings };
    if (request.type === 'settings:save') {
      if (!await chrome.permissions.contains({ origins: [originPattern(request.settings.apiUrl)] })) throw new Error('host_permission');
      const permissions = await new RoteClient(request.settings).permissions();
      if (!['SENDROTE','UPLOADATTACHMENT','GETROTE'].every(permission => permissions.includes(permission))) throw new Error('missing_permissions');
      return { settings: await writeSettings(request.settings), permissions };
    }
    if (!settings) {
      if (request.type === 'status') return {};
      throw new Error('not_configured');
    }
    if (request.type === 'capture') {
      const task = await runner.enqueue(request.capture, settings);
      if (task.status === 'queued') start(task.id);
      return { task: taskView(task) };
    }
    if (request.type === 'status') {
      const task = await taskStore.get(`${settings.id}:${request.site}:${request.sourceId}`);
      return { task: task ? taskView(task) : undefined };
    }
    if (request.type === 'tasks:list') return { tasks: (await taskStore.list(settings.id)).map(taskView) };
    const task = await taskStore.get(request.id);
    if (!task || task.configId !== settings.id) throw new Error('not_allowed');
    if (request.type === 'tasks:reconcile') { await runner.reconcile(task.id); return {}; }
    if (task.status === 'failed') start(task.id);
    return {};
  }
  chrome.runtime.onMessage.addListener((raw: unknown, sender, reply: (value: Reply) => void) => {
    if (!raw || typeof raw !== 'object' || !('type' in raw) || raw.type === 'task:changed') return false;
    void handle(raw, sender).then(data => reply({ ok: true, data }), error => reply({ ok: false, error:
      error instanceof ApiFailure ? `api_${error.status}` : error instanceof z.ZodError ? 'invalid_input'
        : error instanceof Error && ['not_allowed','host_permission','missing_permissions','not_configured','invalid_address','tag_limit'].includes(error.message) ? error.message : 'save_failed' }));
    return true;
  });
  const recover = () => { void ready.then(() => runner.recover()).catch(() => chrome.action.setBadgeText({ text: '!' })); };
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'resume-captures') recover(); });
  chrome.runtime.onStartup.addListener(recover);
  chrome.runtime.onInstalled.addListener(() => { void chrome.alarms.create('resume-captures', { periodInMinutes: 1 }); });
  void chrome.alarms.create('resume-captures', { periodInMinutes: 1 });
  recover();
}

export function isSiteRequestAllowed(sender: chrome.runtime.MessageSender, request: z.infer<typeof requestSchema>): boolean {
  if (!sender.tab || sender.frameId !== 0 || !sender.url) return false;
  const origin = new URL(sender.url).origin;
  const site = origin === 'https://x.com' ? 'x' : origin === 'https://github.com' ? 'github' : undefined;
  if (!site) return false;
  return request.type === 'open-settings' || (request.type === 'capture' && request.capture.site === site)
    || (request.type === 'status' && request.site === site);
}
