import { defineContentScript } from 'wxt/utils/define-content-script';
import { installPageAdapter } from '../src/sites/page/contentScript';
import { arxivDefinition } from '../src/sites/page/definitions';

export default defineContentScript({
  matches: ['https://arxiv.org/abs/*'], runAt: 'document_idle',
  main: ctx => installPageAdapter(ctx, arxivDefinition),
});
