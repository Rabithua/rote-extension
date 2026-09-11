import { defineContentScript } from 'wxt/utils/define-content-script';
import { GitHubAdapter } from '../src/sites/github/adapter';
import { createAdapterBridge } from '../src/sites/bridge';
import type { TaskView } from '../src/domain/task';

export default defineContentScript({
  matches: ['https://github.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const bridge = createAdapterBridge('github');
    const adapter = new GitHubAdapter(bridge);
    const listener = (message: { type?: string; task?: TaskView }, sender: chrome.runtime.MessageSender) => {
      if (sender.id === chrome.runtime.id && message.type === 'connection:changed') { bridge.reset(); adapter.dispose(); adapter.mount(); }
      if (sender.id === chrome.runtime.id && message.type === 'task:changed' && message.task) void bridge.refresh(message.task).then(task => { if (task) adapter.update(task); }).catch(() => undefined);
    };
    chrome.runtime.onMessage.addListener(listener);
    adapter.mount();
    ctx.onInvalidated(() => { bridge.reset(); adapter.dispose(); chrome.runtime.onMessage.removeListener(listener); });
    ctx.addEventListener(window, 'wxt:locationchange', () => { bridge.reset(); adapter.dispose(); adapter.mount(); });
  },
});
