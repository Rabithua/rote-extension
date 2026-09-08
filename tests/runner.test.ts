import { describe, expect, it, vi } from 'vitest';
import { SaveRunner, type RunnerDependencies } from '../src/tasks/runner';
import { ApiFailure, type RoteAttachment, type UploadManifest } from '../src/rote/client';
import type { SaveTask } from '../src/domain/task';
import { MissingHostPermission } from '../src/tasks/images';
import { capture } from './fixtures';
import { noteContent } from '../src/domain/capture';

const settings = {defaultArchived:false,addPlatformTag:false,defaultTags: [] as string[], defaultVisibility: 'private' as const,id:'account-a',apiUrl:'https://api.example.test',openKey:'11111111-1111-4111-8111-111111111111',theme:'system' as const,language:'en' as const};
function harness() {
  const tasks = new Map<string, SaveTask>();
  const blobs = new Map<string,Blob>();
  const attached: RoteAttachment[] = [];
  const noteId = crypto.randomUUID();
  const deps: RunnerDependencies = {
    settings: async () => settings,
    store: {
      get: async id => structuredClone(tasks.get(id)),
      put: async task => { tasks.set(task.id, structuredClone(task)); },
      list: async configId => structuredClone([...tasks.values()].filter(task=>task.configId===configId)),
      image: async (id,index) => blobs.get(`${id}:${index}`),
      putImage: async (id,index,blob) => { blobs.set(`${id}:${index}`,blob); },
      releaseImages: async task => { task.capture.images.forEach((_,index)=>blobs.delete(`${task.id}:${index}`)); },
    },
    client: () => client,
    download: vi.fn(async () => new Blob(['image'],{type:'image/png'})),
    upload: vi.fn(async () => {}), changed: vi.fn(),
  };
  const client = {
    createNote: vi.fn(async () => ({id:noteId,content:'text'})),
    getNote: vi.fn(async () => ({id:noteId,content:'text',attachments:attached})),
    findNotes: vi.fn(async () => [] as {id:string;content:string}[]),
    presign: vi.fn(async (): Promise<UploadManifest> => {
      const uuid = crypto.randomUUID();
      return {items:[{uuid, original:{key:`original/${uuid}.png`,putUrl:`https://storage.test/${uuid}.png`}}]};
    }),
    refresh: vi.fn(async (): Promise<UploadManifest> => { throw new Error('unused'); }),
    finalize: vi.fn(async (_id:string,manifest:UploadManifest) => {
      // Attachment database IDs differ from upload UUIDs in Rote.
      const item = manifest.items[0]!;
      const result = {id:crypto.randomUUID(),url:`https://storage.test/final/${item.uuid}.png`,details:{key:`final/${item.uuid}.png`}};
      attached.push(result); return [result];
    }),
  };
  return {deps,client,tasks,blobs,attached,runner:new SaveRunner(deps)};
}
function imageCapture() { const item=capture(); item.images=[1,2].map(i=>({url:`https://pbs.twimg.com/media/${i}.png`,alt:`image ${i}`})); return item; }
describe('durable save workflow', () => {
  it('deduplicates simultaneous saves across tabs', async () => {
    const h=harness();
    const tasks=await Promise.all([h.runner.enqueue(capture(),settings),h.runner.enqueue(capture(),settings)]);
    await Promise.all(tasks.map(task=>h.runner.start(task.id)));
    expect(h.client.createNote).toHaveBeenCalledTimes(1);
    expect(h.tasks.get(tasks[0]!.id)?.status).toBe('saved');
  });
  it('uploads all images in order and frees successful blobs', async () => {
    const h=harness(); const task=await h.runner.enqueue(imageCapture(),settings);
    await h.runner.start(task.id);
    expect(h.tasks.get(task.id)?.status).toBe('saved');
    expect(h.tasks.get(task.id)?.finalized).toEqual(h.attached.map(item=>item.id));
    expect(h.client.finalize).toHaveBeenCalledTimes(2);
    expect(h.blobs.size).toBe(0);
  });
  it('recovers a partially uploaded note without creating another note', async () => {
    const h=harness(); vi.mocked(h.deps.upload).mockRejectedValueOnce(new MissingHostPermission('https://storage.test'));
    const task=await h.runner.enqueue(imageCapture(),settings); await h.runner.start(task.id);
    expect(h.tasks.get(task.id)).toMatchObject({status:'failed',error:'host_permission',permissionOrigin:'https://storage.test'});
    await new SaveRunner(h.deps).start(task.id);
    expect(h.tasks.get(task.id)?.status).toBe('saved');
    expect(h.client.createNote).toHaveBeenCalledTimes(1);
  });
  it('does not replay a note creation after a lost response', async () => {
    const h=harness(); h.client.createNote.mockRejectedValueOnce(new ApiFailure(0,true));
    const task=await h.runner.enqueue(capture(),settings); await h.runner.start(task.id);
    expect(h.tasks.get(task.id)?.status).toBe('uncertain');
    await new SaveRunner(h.deps).recover(); await h.runner.start(task.id);
    expect(h.client.createNote).toHaveBeenCalledTimes(1);
  });
  it('treats a worker killed during creation as uncertain on startup', async () => {
    const h=harness(); const task=await h.runner.enqueue(capture(),settings);
    task.status='creating'; await h.deps.store.put(task);
    await new SaveRunner(h.deps).recover();
    expect(h.tasks.get(task.id)?.status).toBe('uncertain');
    expect(h.client.createNote).not.toHaveBeenCalled();
  });
  it('reconciles a lost finalize response by actual attachment keys', async () => {
    const h=harness(); const original=h.client.finalize.getMockImplementation()!;
    h.client.finalize.mockImplementationOnce(async (...args) => { await original(...args); throw new ApiFailure(0,true); });
    const task=await h.runner.enqueue(imageCapture(),settings); await h.runner.start(task.id);
    expect(h.tasks.get(task.id)?.status).toBe('failed');
    await new SaveRunner(h.deps).start(task.id);
    expect(h.tasks.get(task.id)?.status).toBe('saved');
    expect(h.attached).toHaveLength(2);
  });
  it('does not send old-account tasks using new credentials', async () => {
    const h=harness(); const task=await h.runner.enqueue(capture(),settings);
    h.deps.settings=async()=>({...settings,id:'account-b'});
    await h.runner.start(task.id);
    expect(h.client.createNote).not.toHaveBeenCalled();
  });
  it('allows explicit retry after a definitive permission failure', async () => {
    const h=harness(); h.client.createNote.mockRejectedValueOnce(new ApiFailure(403,false));
    const task=await h.runner.enqueue(capture(),settings); await h.runner.start(task.id);
    expect(h.tasks.get(task.id)?.status).toBe('failed');
    await h.runner.start(task.id); expect(h.tasks.get(task.id)?.status).toBe('saved');
  });
});

it('keeps capture-time defaults after settings change and uses private for legacy tasks', async () => {
  const h=harness();
  const task=await h.runner.enqueue(capture(),{...settings,defaultTags:['阅读'],addPlatformTag:true,defaultVisibility:'public',defaultArchived:true});
  h.deps.settings=async()=>({...settings,defaultTags:['changed']});
  await h.runner.start(task.id);
  expect(h.client.createNote).toHaveBeenCalledWith(task.capture,{tags:['阅读','X'],visibility:'public',archived:true});
  const legacy=await h.runner.enqueue(capture('456'),settings);
  delete legacy.noteDefaults; await h.deps.store.put(legacy);
  h.deps.settings=async()=>({...settings,defaultTags:['public'],defaultVisibility:'public'});
  await h.runner.start(legacy.id);
  expect(h.client.createNote).toHaveBeenLastCalledWith(legacy.capture,{tags:[],visibility:'private'});
});

it('keeps platform task identities separate and deduplicates GitHub captures', async () => {
  const { runner, tasks } = harness();
  const github = { site:'github' as const, repository:'Owner/Repo', sourceId:'owner/repo', sourceUrl:'https://github.com/Owner/Repo', text:'Description', images:[], complete:true as const, capturedAt:new Date().toISOString() };
  const x = await runner.enqueue(capture(), settings);
  const a = await runner.enqueue(github, settings);
  const b = await runner.enqueue(github, settings);
  expect(a.id).toBe('account-a:github:owner/repo');
  expect(x.id).toBe('account-a:x:123');
  expect(a.id).toBe(b.id);expect(tasks.size).toBe(2);
});

it('reconciles an archived creation using capture-time defaults after settings change', async () => {
  const h=harness();
  h.client.createNote.mockRejectedValueOnce(new ApiFailure(0,true));
  const task=await h.runner.enqueue(capture(),{...settings,defaultArchived:true});
  await h.runner.start(task.id);
  expect(h.tasks.get(task.id)?.status).toBe('uncertain');
  h.deps.settings=async()=>({...settings,defaultArchived:false});
  const noteId=crypto.randomUUID();
  h.client.findNotes.mockResolvedValueOnce([{id:noteId,content:noteContent(task.capture)}]);
  await new SaveRunner(h.deps).reconcile(task.id);
  expect(h.client.findNotes).toHaveBeenCalledWith(task.capture.sourceUrl,true);
  expect(h.tasks.get(task.id)).toMatchObject({status:'saved',noteId});
  expect(h.client.createNote).toHaveBeenCalledTimes(1);
});
