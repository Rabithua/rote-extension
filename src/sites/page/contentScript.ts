import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { TaskView } from '../../domain/task';
import { send } from '../../messaging/protocol';
import { PageAdapter, type PageDefinition } from './adapter';

export function installPageAdapter(ctx: ContentScriptContext, definition: PageDefinition) {
  const adapter = new PageAdapter({
    save: async capture => (await send({ type: 'capture', capture })).task,
    status: async sourceId => (await send({ type: 'status', site: definition.site, sourceId })).task,
    openSettings: async () => { await send({ type: 'open-settings' }); },
  }, definition);
  const listener = (message: { type?: string; task?: TaskView }, sender: chrome.runtime.MessageSender) => {
    if (sender.id === chrome.runtime.id && message.type === 'task:changed' && message.task) adapter.update(message.task);
  };
  chrome.runtime.onMessage.addListener(listener); adapter.mount();
  ctx.onInvalidated(() => { adapter.dispose(); chrome.runtime.onMessage.removeListener(listener); });
  ctx.addEventListener(window, 'wxt:locationchange', () => { adapter.dispose(); adapter.mount(); });
}
