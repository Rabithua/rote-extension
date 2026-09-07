import { defineContentScript } from 'wxt/utils/define-content-script';
import { installPageAdapter } from '../src/sites/page/contentScript';
import { blueskyDefinition, bindBlueskyMenu } from '../src/sites/page/definitions';

export default defineContentScript({
  matches: ['https://bsky.app/*'], runAt: 'document_idle',
  main: ctx => {
    for (const event of ['pointerdown', 'keydown', 'click']) ctx.addEventListener(document, event, bindBlueskyMenu, { capture: true });
    installPageAdapter(ctx, blueskyDefinition);
  },
});
