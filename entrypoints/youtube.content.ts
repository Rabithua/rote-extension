import { defineContentScript } from 'wxt/utils/define-content-script';
import { YouTubeAdapter } from '../src/sites/youtube/adapter';
import { send } from '../src/messaging/protocol';
import type { TaskView } from '../src/domain/task';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const adapter = new YouTubeAdapter({
      save: async capture => (await send({ type: 'capture', capture })).task,
      status: async sourceId => (await send({ type: 'status', site: 'youtube', sourceId })).task,
      openSettings: async () => { await send({ type: 'open-settings' }); },
    });
    const listener = (message: { type?: string; task?: TaskView }, sender: chrome.runtime.MessageSender) => {
      if (sender.id === chrome.runtime.id && message.type === 'task:changed' && message.task) adapter.update(message.task);
    };
    chrome.runtime.onMessage.addListener(listener);
    adapter.mount();
    ctx.onInvalidated(() => { adapter.dispose(); chrome.runtime.onMessage.removeListener(listener); });
    // YouTube's navigate-start/finish events gate metadata hydration inside the adapter.
  },
});
