import { afterEach, expect, it, vi } from 'vitest';
import { createAdapterBridge } from '../src/sites/bridge';
import type { TaskView } from '../src/domain/task';
import { capture } from './fixtures';
const task: TaskView={id:'task',revision:2,site:'x',sourceId:'123',sourceUrl:'https://x.com/test/status/123',author:'test',excerpt:'',status:'saved',updatedAt:'2026-09-11',imageCount:0,uploadedCount:0};
afterEach(()=>vi.unstubAllGlobals());
it('discards delayed responses after the page or account changes',async()=>{
  let finish!:(value:unknown)=>void;
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(()=>new Promise(resolve=>{finish=resolve;}))}});
  const bridge=createAdapterBridge('x');const pending=bridge.save(capture());bridge.reset();finish({ok:true,data:{task}});
  expect(await pending).toBeUndefined();
});
it('rejects old revisions that arrive after the completion broadcast',()=>{
  const bridge=createAdapterBridge('x');expect(bridge.accept(task)).toBe(true);
  expect(bridge.accept({...task,revision:1,status:'creating'})).toBe(false);
});
it('uses the current account result for delayed unsolicited events after reset',async()=>{
  const current={...task,id:'new-account-task',status:'queued' as const};
  const request=vi.fn().mockResolvedValue({ok:true,data:{task:current}});
  vi.stubGlobal('chrome',{runtime:{sendMessage:request}});
  const bridge=createAdapterBridge('x');bridge.reset();
  expect(await bridge.refresh(task)).toEqual(current);
  expect(request).toHaveBeenCalledWith({type:'status',site:'x',sourceId:task.sourceId});
});
