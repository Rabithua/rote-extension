import { taskView, type SaveTask } from '../domain/task';
import { readSettings, protectStorage } from '../settings/store';
import { languageFor, translate } from '../locales/messages';
import type { SaveRunner } from '../tasks/runner';
import { webCapture } from './capture';

type Target = { tabId: number; documentId: string; token: string; url: string };
const prefix = 'web-target:';
async function feedback(target: Target, data: object) {
  try { await chrome.tabs.sendMessage(target.tabId, { type: 'web:feedback', token: target.token, ...data }, { documentId: target.documentId }); }
  catch { await chrome.action.setBadgeText({ text: '!', tabId: target.tabId }).catch(() => undefined); }
}
export async function webChanged(task: SaveTask) {
  const key = prefix + task.id;
  const target = (await chrome.storage.session.get(key))[key] as Target | undefined;
  if (target) await feedback(target, { task: taskView(task) });
}
export function installWebCapture(runner: SaveRunner, start: (id: string) => void, connectionReady: () => Promise<unknown> = async () => {}) {
  const createMenus = async () => {
    const settings = await readSettings(); const language = languageFor(settings?.language);
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: 'rote-page', title: translate(language, 'savePage'), contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'rote-selection', title: translate(language, 'saveSelection'), contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  };
  let setupTail = Promise.resolve();
  const setup = () => { setupTail = setupTail.then(createMenus).catch(() => undefined); return setupTail; };
  chrome.tabs.onRemoved.addListener(tabId => {
    void chrome.storage.session.get(null).then(entries => chrome.storage.session.remove(Object.entries(entries as Record<string, Target>).filter(([key,t]) => key.startsWith(prefix) && t.tabId === tabId).map(([key]) => key)));
  });
  chrome.runtime.onInstalled.addListener(() => { void setup(); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) void setup(); });
  void setup();
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'web:settings') return false;
    void chrome.storage.session.get(null).then(async entries => {
      const allowed = sender.id === chrome.runtime.id && Object.entries(entries as Record<string, Target>).some(([key, t]) => key.startsWith(prefix) && t.token === message.token && t.tabId === sender.tab?.id && t.documentId === sender.documentId && t.url === sender.url);
      if (allowed) await chrome.runtime.openOptionsPage();
      reply({ ok: !!allowed });
    }); return true;
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => { void capture(info, tab).catch(() => { void chrome.action.setBadgeText({ text: '!', tabId: tab?.id }).catch(() => undefined); }); });
  async function capture(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
    if (!['rote-page','rote-selection'].includes(String(info.menuItemId)) || tab?.id === undefined || (info.frameId ?? 0) !== 0 || !info.pageUrl || !/^https?:\/\//.test(info.pageUrl)) return;
    await protectStorage();
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: () => ({ url: location.href, title: document.title, type: document.contentType, selection: getSelection()?.toString() ?? '' }) });
    const result = results[0]; const page = result?.result;
    if (!page || page.url !== info.pageUrl || !['text/html','application/xhtml+xml'].includes(page.type) || !result.documentId) return;
    const target: Target = { tabId: tab.id, documentId: result.documentId, token: crypto.randomUUID(), url: page.url };
    await connectionReady();
    const settings = await readSettings();
    const previous = await chrome.storage.session.get(null);
    await chrome.storage.session.remove(Object.entries(previous as Record<string, Target>).filter(([key,t]) => key.startsWith(prefix) && t.tabId === tab.id).map(([key]) => key));
    await chrome.storage.session.set({ [prefix + target.token]: target });
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, documentIds: [target.documentId] }, files: ['web-feedback.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'web:begin', ...target, language: settings?.language }, { documentId: target.documentId });
    } catch { await chrome.action.setBadgeText({ text: '…', tabId: tab.id }).catch(() => undefined); }
    if (!settings) { await feedback(target, { key: 'not_configured' }); await chrome.runtime.openOptionsPage(); return; }
    try {
      const selection = info.menuItemId === 'rote-selection' ? (page.selection || info.selectionText || '') : undefined;
      const item = await webCapture(page.url, page.title, selection);
      const task = await runner.enqueue(item, settings);
      await chrome.storage.session.set({ [prefix + task.id]: target });
      await feedback(target, { task: taskView(task) });
      if (['failed','waiting','cancelled','uncertain'].includes(task.status)) void runner.retry(task.id).catch(() => undefined);
      else if (task.status === 'queued') start(task.id);
    } catch (error) { await feedback(target, { key: error instanceof Error && error.message === 'tag_limit' ? 'tag_limit' : 'save_failed' }); }
  }
}
