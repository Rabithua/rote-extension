import { afterEach, expect, it, vi } from 'vitest';
import { CaptureToast } from '../src/sites/toast';

afterEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
it('updates in place, preserves recovery errors and dismisses success after six seconds',()=>{
  vi.useFakeTimers();const toast=new CaptureToast(key=>key,async()=>{});
  toast.show('saving');const host=document.querySelector('[data-rote-toast]')!;
  expect(host.shadowRoot!.querySelector('[role=status]')!.textContent).toContain('saving');
  toast.show('api_403',true);expect(document.querySelector('[data-rote-toast]')).toBe(host);
  expect(host.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.hidden).toBe(false);
  vi.advanceTimersByTime(10000);expect(host.isConnected).toBe(true);
  toast.show('saved');expect(host.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.hidden).toBe(true);
  vi.advanceTimersByTime(5999);expect(host.isConnected).toBe(true);
  vi.advanceTimersByTime(1);expect(host.isConnected).toBe(false);
});
it('does not resurrect a manually dismissed toast until the next capture',()=>{
  const toast=new CaptureToast(key=>key,async()=>{});toast.show('saving');
  document.querySelector('[data-rote-toast]')!.shadowRoot!.querySelector<HTMLButtonElement>('.close')!.click();
  toast.show('saved');expect(document.querySelector('[data-rote-toast]')).toBeNull();
  toast.reset();toast.show('saving');expect(document.querySelector('[data-rote-toast]')).not.toBeNull();toast.hide();
});
it('opens recovery and removes the toast without injecting global styles',async()=>{
  const open=vi.fn(async()=>{});const toast=new CaptureToast(key=>key,open);toast.show('not_configured',true);
  expect(document.querySelector('style')).toBeNull();
  document.querySelector('[data-rote-toast]')!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();
  await Promise.resolve();expect(open).toHaveBeenCalledOnce();expect(document.querySelector('[data-rote-toast]')).toBeNull();
});
