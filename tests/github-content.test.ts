import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import githubContent from '../entrypoints/github.content';
import type { TaskView } from '../src/domain/task';
import type { Reply, Request } from '../src/messaging/protocol';
import { githubHeaderFixture } from '../e2e/github-fixture';

const task: TaskView = { id:'github-task', revision:2, site:'github', sourceId:'owner/repo',
  sourceUrl:'https://github.com/Owner/Repo', author:'Owner/Repo', excerpt:'', status:'saved',
  updatedAt:'2026-10-11', imageCount:0, uploadedCount:0 };
const cleanup: (() => void)[] = [];
function render(repository = 'Owner/Repo') {
  const doc = new DOMParser().parseFromString(githubHeaderFixture(repository,'Public',false),'text/html');
  document.head.innerHTML = doc.head.innerHTML; document.body.innerHTML = doc.body.innerHTML;
  vi.stubGlobal('location', new URL(`https://github.com/${repository}`));
}
async function mount(sendMessage: (request: Request) => Promise<Reply>) {
  vi.stubGlobal('chrome', { runtime: { id:'extension', sendMessage,
    onMessage:{addListener:vi.fn(),removeListener:vi.fn()} } });
  await githubContent.main({
    onInvalidated: (callback: () => void) => { cleanup.push(callback); },
    addEventListener: (target: EventTarget, type: string, listener: EventListener) => {
      target.addEventListener(type,listener); cleanup.push(() => target.removeEventListener(type,listener));
    },
  } as unknown as ContentScriptContext);
  return document.querySelector<HTMLButtonElement>('[data-rote-github] button')!;
}
beforeEach(() => {
  render();
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0),0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.stubGlobal('matchMedia', () => ({matches:true}));
});
afterEach(() => {
  cleanup.splice(0).reverse().forEach(callback => callback());
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '';
});

it.each(['saved','rejected'] as const)('settles a %s capture after a delayed location notification without a task broadcast', async outcome => {
  let finish!: (reply: Reply) => void;
  const sendMessage = vi.fn((request: Request): Promise<Reply> => request.type === 'capture'
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve({ok:true,data:outcome === 'saved' ? {task} : {}}));
  const button = await mount(sendMessage);
  await vi.waitFor(() => expect(button.textContent).toBe(outcome === 'saved' ? 'View note' : 'Save to Rote'));
  button.focus(); button.click(); expect(button.disabled).toBe(true);
  window.dispatchEvent(new Event('wxt:locationchange'));
  expect(document.querySelector('[data-rote-github] button')).toBe(button);
  expect(document.activeElement).toBe(button);
  finish(outcome === 'saved' ? {ok:true,data:{task}} : {ok:false,error:'not_configured'});
  await vi.waitFor(() => {
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(outcome === 'saved' ? 'View note' : 'Save to Rote');
  });
  expect(sendMessage.mock.calls.filter(([request]) => request.type === 'status')).toHaveLength(1);
});

it('does not apply a previous repository response after navigation', async () => {
  let finish!: (reply: Reply) => void;
  const button = await mount(request => request.type === 'capture'
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ok:true,data:{}}));
  button.click(); render('Next/Project'); window.dispatchEvent(new Event('wxt:locationchange'));
  const next = document.querySelector<HTMLButtonElement>('[data-rote-github] button')!;
  expect(next).not.toBe(button);
  finish({ok:true,data:{task}});
  await new Promise(resolve => setTimeout(resolve,0));
  expect(next.textContent).toBe('Save to Rote'); expect(next.disabled).toBe(false);
});
