import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureToast } from '../src/sites/toast';

beforeEach(()=>{
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false})));
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();document.body.replaceChildren();});

it('keeps the toast mounted for exit then removes it and ignores late task updates',()=>{
  const toast=new CaptureToast(key=>key,async()=>{});
  toast.show('saving');toast.hide();toast.hide();toast.show('saved');
  expect(document.querySelector('[data-rote-toast]')?.hasAttribute('data-closing')).toBe(true);
  vi.advanceTimersByTime(200);
  expect(document.querySelector('[data-rote-toast]')).toBeNull();
});
it('cancels an interrupted exit when a new capture starts',()=>{
  const toast=new CaptureToast(key=>key,async()=>{});
  toast.show('saving');const host=document.querySelector('[data-rote-toast]');
  toast.hide();vi.advanceTimersByTime(100);toast.reset();toast.show('saving');
  vi.advanceTimersByTime(200);
  expect(document.querySelector('[data-rote-toast]')).toBe(host);
  expect(host?.hasAttribute('data-closing')).toBe(false);
  toast.show('saved');vi.advanceTimersByTime(6000);
  expect(host?.hasAttribute('data-closing')).toBe(true);
  vi.advanceTimersByTime(200);expect(host?.isConnected).toBe(false);
});
it('removes immediately when reduced motion is requested',()=>{
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));
  const toast=new CaptureToast(key=>key,async()=>{});
  toast.show('saving');toast.hide();
  expect(document.querySelector('[data-rote-toast]')).toBeNull();
});

it('updates in place, preserves recovery errors and dismisses success after six seconds',()=>{
  vi.useFakeTimers();const toast=new CaptureToast(key=>key,async()=>{});
  toast.show('saving');const host=document.querySelector('[data-rote-toast]')!;
  expect(host.shadowRoot!.querySelector('[role=status]')!.textContent).toContain('saving');
  toast.show('api_403',true);expect(document.querySelector('[data-rote-toast]')).toBe(host);
  expect(host.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.hidden).toBe(false);
  vi.advanceTimersByTime(10000);expect(host.isConnected).toBe(true);
  toast.show('saved');expect(host.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.hidden).toBe(true);
  vi.advanceTimersByTime(5999);expect(host.isConnected).toBe(true);
  vi.advanceTimersByTime(1);expect(host.hasAttribute('data-closing')).toBe(true);
  vi.advanceTimersByTime(200);expect(host.isConnected).toBe(false);
});
it('does not resurrect a manually dismissed toast until the next capture',()=>{
  const toast=new CaptureToast(key=>key,async()=>{});toast.show('saving');
  document.querySelector('[data-rote-toast]')!.shadowRoot!.querySelector<HTMLButtonElement>('.close')!.click();
  toast.show('saved');vi.advanceTimersByTime(200);expect(document.querySelector('[data-rote-toast]')).toBeNull();
  toast.reset();toast.show('saving');expect(document.querySelector('[data-rote-toast]')).not.toBeNull();toast.hide();
});
it('opens recovery and removes the toast without injecting global styles',async()=>{
  const open=vi.fn(async()=>{});const toast=new CaptureToast(key=>key,open);toast.show('not_configured',true);
  expect(document.querySelector('style')).toBeNull();
  document.querySelector('[data-rote-toast]')!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();
  await Promise.resolve();vi.advanceTimersByTime(200);expect(open).toHaveBeenCalledOnce();expect(document.querySelector('[data-rote-toast]')).toBeNull();
});
