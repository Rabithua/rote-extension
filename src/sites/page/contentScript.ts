import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { TaskView } from '../../domain/task';
import { createAdapterBridge } from '../bridge';
import { PageAdapter, type PageDefinition } from './adapter';

export function installPageAdapter(ctx: ContentScriptContext, definition: PageDefinition) {
  const bridge = createAdapterBridge(definition.site);
  const adapter = new PageAdapter(bridge, definition);
  const listener = (message: { type?: string; task?: TaskView }, sender: chrome.runtime.MessageSender) => {
    if (sender.id === chrome.runtime.id && message.type === 'connection:changed') { bridge.reset(); adapter.dispose(); adapter.mount(); }
      if (sender.id === chrome.runtime.id && message.type === 'task:changed' && message.task) void bridge.refresh(message.task).then(task => { if (task) adapter.update(task); }).catch(() => undefined);
  };
  chrome.runtime.onMessage.addListener(listener); adapter.mount();
  ctx.onInvalidated(() => { bridge.reset(); adapter.dispose(); chrome.runtime.onMessage.removeListener(listener); });
  ctx.addEventListener(window, 'wxt:locationchange', () => { bridge.reset(); adapter.dispose(); adapter.mount(); });
}
