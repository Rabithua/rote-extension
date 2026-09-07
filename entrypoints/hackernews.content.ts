import { defineContentScript } from 'wxt/utils/define-content-script';
import { installPageAdapter } from '../src/sites/page/contentScript';
import { hackerNewsDefinition } from '../src/sites/page/definitions';

export default defineContentScript({
  matches: ['https://news.ycombinator.com/item*'], runAt: 'document_idle',
  main: ctx => installPageAdapter(ctx, hackerNewsDefinition),
});
