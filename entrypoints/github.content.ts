import { defineContentScript } from 'wxt/utils/define-content-script';
import { GitHubAdapter } from '../src/sites/github/adapter';
import { send } from '../src/messaging/protocol';
import type { TaskView } from '../src/domain/task';

export default defineContentScript({
  matches: ['https://github.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const adapter = new GitHubAdapter({
      save: async capture => (await send({ type: 'capture', capture })).task,
      status: async sourceId => (await send({ type: 'status', site: 'github', sourceId })).task,
      openSettings: async () => { await send({ type: 'open-settings' }); },
    });
    const listener = (message: { type?: string; task?: TaskView }, sender: chrome.runtime.MessageSender) => {
      if (sender.id === chrome.runtime.id && message.type === 'task:changed' && message.task) adapter.update(message.task);
    };
    chrome.runtime.onMessage.addListener(listener);
    adapter.mount();
    ctx.onInvalidated(() => { adapter.dispose(); chrome.runtime.onMessage.removeListener(listener); });
    ctx.addEventListener(window, 'wxt:locationchange', () => { adapter.dispose(); adapter.mount(); });
  },
});
