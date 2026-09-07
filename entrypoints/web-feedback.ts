import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { CaptureToast } from '../src/sites/toast';
import { languageFor, translate } from '../src/locales/messages';
import type { TaskView } from '../src/domain/task';

export default defineUnlistedScript(() => {
  const scope = globalThis as typeof globalThis & { __roteFeedback?: boolean };
  if (scope.__roteFeedback) return;
  scope.__roteFeedback = true;
  let token = ''; let currentUrl = ''; let language = languageFor();
  const toast = new CaptureToast(key => translate(language, key), async () => {
    await chrome.runtime.sendMessage({ type: 'web:settings', token });
  });
  chrome.runtime.onMessage.addListener((message: { type?: string; token?: string; url?: string; language?: string; key?: string; task?: TaskView }, sender) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'web:begin') {
      token = message.token ?? ''; currentUrl = message.url ?? ''; language = languageFor(message.language);
      toast.reset(); toast.show('saving');
    } else if (message.type === 'web:feedback' && message.token === token && location.href === currentUrl) {
      if (message.task) toast.showTask(message.task);
      else if (message.key) toast.show(message.key, true);
    }
  });
  addEventListener('popstate', () => toast.hide());
  (window as Window & { navigation?: EventTarget }).navigation?.addEventListener('navigate', () => toast.hide());
});
