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
  const noteId: string = crypto.randomUUID();
  const deps: RunnerDependencies = {
    settings: async () => settings,
    store: {
      get: async id => structuredClone(tasks.get(id)),
      put: async task => { tasks.set(task.id, structuredClone(task)); },
      list: async configId => structuredClone([...tasks.values()].filter(task=>task.configId===configId)),
      image: async (id,index) => blobs.get(`${id}:${index}`),
      putImage: async (id,index,blob) => { blobs.set(`${id}:${index}`,blob); },
      remove: async task => { tasks.delete(task.id); task.capture.images.forEach((_, index) => blobs.delete(`${task.id}:${index}`)); },
      releaseImages: async task => { task.capture.images.forEach((_,index)=>blobs.delete(`${task.id}:${index}`)); },
    },
    client: () => client,
    download: vi.fn(async () => new Blob(['image'],{type:'image/png'})),
    upload: vi.fn(async () => {}), changed: vi.fn(),
  };
  const client = {
    createNote: vi.fn(async (_capture?: unknown, _defaults?: unknown, _identity?: string) => ({id:noteId,content:'text'})),
    getNote: vi.fn(async () => ({id:noteId,content:'text',attachments:attached})),
    findNotes: vi.fn(async (_sourceUrl: string, _archived = false) => [] as {id:string;content:string}[]),
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
    expect(h.tasks.get(task.id)?.status).toBe('waiting');
    await new SaveRunner(h.deps).retry(task.id);
    expect(h.tasks.get(task.id)?.status).toBe('saved');
    expect(h.attached).toHaveLength(2);
  });
  it('does not send old-account tasks using new credentials', async () => {
    const h=harness(); const task=await h.runner.enqueue(capture(),settings);
    h.deps.settings=async()=>({...settings,id:'account-b'});
    await expect(h.runner.start(task.id)).rejects.toThrow('not_allowed');
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
  expect(a.sourceKey).toBe('github:owner/repo');
  expect(x.sourceKey).toBe('x:123'); expect(a.id).not.toBe(x.id);
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

it('reports missing, edited and ambiguous results without recreating a note', async () => {
  const h = harness();
  h.client.createNote.mockRejectedValueOnce(new ApiFailure(0, true));
  const task = await h.runner.enqueue(capture(), settings); await h.runner.start(task.id);
  expect(await h.runner.reconcile(task.id)).toBe('not_found');
  h.client.findNotes.mockResolvedValue([{id:'edited', content:'changed text'}]);
  expect(await h.runner.reconcile(task.id)).toBe('mismatch');
  h.client.findNotes.mockResolvedValue([{id:'a', content:noteContent(task.capture)}, {id:'b', content:noteContent(task.capture)}]);
  expect(await h.runner.reconcile(task.id)).toBe('ambiguous');
  expect(h.tasks.get(task.id)?.status).toBe('uncertain');
  expect(h.client.createNote).toHaveBeenCalledTimes(1);
});

it('locks reconciliation against duplicate checks and deletion, then releases the lock on failure', async () => {
  const h = harness();
  h.client.createNote.mockRejectedValueOnce(new ApiFailure(0, true));
  const task = await h.runner.enqueue(imageCapture(), settings); await h.runner.start(task.id);
  let rejectSearch!: (error: Error) => void;
  h.client.findNotes.mockReturnValue(new Promise((_, reject) => { rejectSearch = reject; }));
  const checking = h.runner.reconcile(task.id);
  await expect(h.runner.reconcile(task.id)).rejects.toThrow('task_busy');
  await expect(h.runner.remove(task.id)).rejects.toThrow('task_busy');
  rejectSearch(new ApiFailure(403)); await expect(checking).rejects.toThrow('api_403');
  await h.deps.store.putImage(task.id, 0, new Blob(['pending image']));
  await h.runner.remove(task.id);
  expect(h.tasks.get(task.id)?.hiddenAt).toBeDefined();
  expect(await h.deps.store.image(task.id, 0)).toBeDefined();
  await h.runner.restore(task.id);
  expect(h.tasks.get(task.id)?.hiddenAt).toBeUndefined();
});

it('finds a note moved to the archive and counts the same note only once', async () => {
  const h = harness();
  h.client.createNote.mockRejectedValueOnce(new ApiFailure(0, true));
  const task = await h.runner.enqueue({...capture(), images:[]}, settings); await h.runner.start(task.id);
  h.client.findNotes.mockImplementation(async (_, archived) => archived ? [{id:'archived-note', content:noteContent(task.capture)}] : []);
  expect(await h.runner.reconcile(task.id)).toBe('matched');
  expect(h.tasks.get(task.id)).toMatchObject({status:'saved', noteId:'archived-note'});
  expect(h.client.createNote).toHaveBeenCalledTimes(1);
});

it('refuses removal of queued captures and records belonging to another account', async () => {
  const h = harness(); const task = await h.runner.enqueue(capture(), settings);
  await expect(h.runner.remove(task.id)).rejects.toThrow('task_busy');
  h.deps.settings = async () => ({...settings, id:'other-account'});
  await expect(h.runner.remove(task.id)).rejects.toThrow('not_allowed');
  expect(h.tasks.has(task.id)).toBe(true);
});

function idempotentHarness() {
  const h = harness();
  const connection = {...settings, ownerId: crypto.randomUUID(), noteCreateIdempotency: 1 as const};
  h.deps.settings = async () => connection;
  const notes = new Map<string, string>();
  h.client.createNote.mockImplementation(async (_, __, identity) => {
    if (!identity) throw new Error('missing identity');
    notes.set(identity, 'text'); return {id: identity, content:'text'};
  });
  return {...h, connection, notes};
}

it('persists the create identity before sending, then recovers a committed lost response once', async () => {
  const h = idempotentHarness(); const create = h.client.createNote.getMockImplementation()!;
  const task = await h.runner.enqueue(capture(), h.connection);
  h.client.createNote.mockImplementationOnce(async (...args) => {
    expect(h.tasks.get(task.id)).toMatchObject({createId:args[2], creation:'sent'});
    await create(...args); throw new ApiFailure(0, true);
  });
  await h.runner.start(task.id);
  expect(h.tasks.get(task.id)).toMatchObject({status:'waiting',retryCount:1});
  const saved = h.tasks.get(task.id)!; saved.nextRetryAt = 0;
  await new SaveRunner(h.deps).recover();
  expect(h.tasks.get(task.id)).toMatchObject({status:'saved', noteId:task.createId});
  expect(h.notes.size).toBe(1);
  expect(h.client.createNote.mock.calls.map(call => call[2])).toEqual([task.createId, task.createId]);
});

it('recovers an interrupted idempotent creation without allocating another identity', async () => {
  const h = idempotentHarness(); const task = await h.runner.enqueue(capture(), h.connection);
  task.creation='sent'; task.status='creating'; await h.deps.store.put(task);
  await new SaveRunner(h.deps).recover();
  expect(h.tasks.get(task.id)).toMatchObject({status:'saved',noteId:task.createId});
});

it('never starts a request if the creation checkpoint cannot be stored', async () => {
  const h = idempotentHarness(); const task = await h.runner.enqueue(capture(), h.connection);
  h.deps.store.put = async () => { throw new DOMException('quota', 'QuotaExceededError'); };
  await expect(h.runner.start(task.id)).rejects.toThrow();
  expect(h.client.createNote).not.toHaveBeenCalled();
});

it('keeps a valid returned ID even when the server ignores the advertised identity', async () => {
  const h = idempotentHarness(); const returned = crypto.randomUUID();
  h.client.createNote.mockResolvedValue({id:returned,content:'text'});
  const task = await h.runner.enqueue(capture(), h.connection); await h.runner.start(task.id);
  expect(h.tasks.get(task.id)).toMatchObject({status:'uncertain',noteId:returned,error:'identity_mismatch'});
  await h.runner.retry(task.id);
  expect(h.client.getNote).toHaveBeenCalledWith(returned);
  expect(h.client.createNote).toHaveBeenCalledTimes(1);
});

it('limits automatic retries to three and respects Retry-After across restart', async () => {
  const h = idempotentHarness(); const task = await h.runner.enqueue(capture(), h.connection);
  h.client.createNote.mockRejectedValue(new ApiFailure(503,true,900_000));
  await h.runner.start(task.id);
  expect(h.tasks.get(task.id)!.nextRetryAt! - Date.now()).toBeGreaterThan(899_000);
  for (let i=0;i<3;i++) { h.tasks.get(task.id)!.nextRetryAt=0; await new SaveRunner(h.deps).recover(); }
  expect(h.tasks.get(task.id)).toMatchObject({status:'uncertain',retryCount:3});
  await h.runner.recover(); expect(h.client.createNote).toHaveBeenCalledTimes(4);
});

it.each([400,401,403,409,413])('does not automatically retry a definitive %s rejection', async status => {
  const h = idempotentHarness(); h.client.createNote.mockRejectedValue(new ApiFailure(status));
  const task = await h.runner.enqueue(capture(), h.connection); await h.runner.start(task.id); await h.runner.recover();
  expect(h.tasks.get(task.id)).toMatchObject({status:'failed',creation:'rejected'});
  expect(h.client.createNote).toHaveBeenCalledTimes(1);
});

it('does not treat an empty legacy search as permission to recreate', async () => {
  const h = harness(); h.client.createNote.mockRejectedValueOnce(new ApiFailure(0,true));
  const task = await h.runner.enqueue(capture(),settings); await h.runner.start(task.id);
  expect(await h.runner.retry(task.id)).toBe('not_found');
  expect(await h.runner.recreate(task.id,false)).toBe('not_found');
  expect(h.client.createNote).toHaveBeenCalledTimes(1);
  await h.runner.recreate(task.id,true); await h.runner.recreate(task.id,true);
  expect(h.client.createNote).toHaveBeenCalledTimes(2);
  expect(h.tasks.size).toBe(2);
});

it('retains hidden creation identity and deduplicates future capture after cleanup', async () => {
  const h = idempotentHarness(); const task = await h.runner.enqueue(capture(), h.connection); await h.runner.start(task.id);
  await h.runner.remove(task.id); h.tasks.get(task.id)!.hiddenAt=Date.now()-31_000;
  await h.runner.recover(); expect(h.tasks.get(task.id)?.compacted).toBe(true);
  expect((await h.runner.enqueue(capture(), h.connection)).id).toBe(task.id);
  expect(h.client.createNote).toHaveBeenCalledTimes(1);
  await expect(h.runner.restore(task.id)).rejects.toThrow('undo_expired');
});

it('cancels an in-flight create without losing its returned note ID or uploading images', async () => {
  const h = idempotentHarness(); let finish!: () => void;
  const task = await h.runner.enqueue(imageCapture(),h.connection);
  h.client.createNote.mockImplementation(async () => { await new Promise<void>(resolve => { finish=resolve; }); return {id:task.createId!,content:'text'}; });
  const running=h.runner.start(task.id); await vi.waitFor(()=>expect(finish).toBeDefined());
  await h.runner.cancel(task.id); finish(); await running;
  expect(h.tasks.get(task.id)).toMatchObject({status:'cancelled',noteId:task.createId,cancelRequested:true});
  expect(h.client.presign).not.toHaveBeenCalled();
});

it('pauses uploads after an account switch and resumes with the original account', async () => {
  const h = idempotentHarness(); const task=await h.runner.enqueue(imageCapture(),h.connection);
  h.client.createNote.mockImplementation(async()=>{h.deps.settings=async()=>({...h.connection,id:'different'});return {id:task.createId!,content:'text'};});
  await h.runner.start(task.id); expect(h.client.presign).not.toHaveBeenCalled();
  expect(h.tasks.get(task.id)?.noteId).toBe(task.createId);
  h.deps.settings=async()=>h.connection; await h.runner.recover();
  expect(h.tasks.get(task.id)?.status).toBe('saved'); expect(h.client.createNote).toHaveBeenCalledTimes(1);
});

it('rebinds only verified same-owner tasks when credentials rotate', async () => {
  const h=idempotentHarness();const task=await h.runner.enqueue(capture(),h.connection);
  const next={...h.connection,id:'new',openKey:crypto.randomUUID()};h.deps.settings=async()=>next;
  await h.runner.rebind({...h.connection,ownerId:crypto.randomUUID()},next);
  expect(h.tasks.get(task.id)?.configId).toBe(h.connection.id);
  await h.runner.rebind(h.connection,next);expect(h.tasks.get(task.id)?.configId).toBe('new');
});

it('stops replay when a server withdraws its advertised capability', async () => {
  const h=idempotentHarness();const task=await h.runner.enqueue(capture(),h.connection);
  task.creation='sent';task.status='creating';await h.deps.store.put(task);
  h.deps.settings=async()=>({...h.connection,noteCreateIdempotency:undefined});
  await h.runner.recover();expect(h.client.createNote).not.toHaveBeenCalled();expect(h.tasks.get(task.id)?.status).toBe('uncertain');
});

it('refreshes an expired image reservation without changing its upload identity', async () => {
  const h=harness();const task=await h.runner.enqueue(imageCapture(),settings);
  const uuid=crypto.randomUUID();
  const batch={reservationId:'reservation',expiresAt:'2000-01-01',items:[{uuid,original:{key:`original/${uuid}.png`,putUrl:`https://storage.test/${uuid}.png`}}]};
  h.client.presign.mockResolvedValueOnce(batch);
  h.client.refresh.mockResolvedValueOnce({...batch,expiresAt:'2099-01-01'});
  await h.runner.start(task.id);
  expect(h.client.refresh).toHaveBeenCalledWith('reservation');expect(h.tasks.get(task.id)?.status).toBe('saved');expect(h.attached).toHaveLength(2);
});

it('finishes a confirmed replacement after a crash before its queue record was written', async () => {
  const h=idempotentHarness();const task=await h.runner.enqueue(capture(),h.connection);await h.runner.start(task.id);
  const current=h.tasks.get(task.id)!;current.replacementId=crypto.randomUUID();
  expect((await h.runner.find(task.capture,h.connection))?.id).toBe(task.id);
  await h.runner.recover();const replacement=h.tasks.get(current.replacementId)!;
  expect(replacement.status).toBe('saved');expect(h.notes.size).toBe(2);
  await h.runner.recover();expect(h.notes.size).toBe(2);
});

it('never recreates an already deleted remote note during image recovery', async () => {
  const h=idempotentHarness();const task=await h.runner.enqueue(imageCapture(),h.connection);
  const current=h.tasks.get(task.id)!;current.noteId=task.createId;current.creation='confirmed';current.status='uploading';
  h.client.getNote.mockRejectedValue(new ApiFailure(404));await h.runner.recover();
  expect(h.tasks.get(task.id)).toMatchObject({status:'failed',error:'note_missing'});
  expect(h.client.createNote).not.toHaveBeenCalled();expect(h.client.presign).not.toHaveBeenCalled();
});

it('automatically retries an unreadable 201 response only when idempotency is verified', async () => {
  const h=idempotentHarness();h.client.createNote.mockRejectedValueOnce(new ApiFailure(201,true));
  const task=await h.runner.enqueue(capture(),h.connection);await h.runner.start(task.id);
  expect(h.tasks.get(task.id)).toMatchObject({status:'waiting',retryCount:1});
  await h.runner.retry(task.id);expect(h.tasks.get(task.id)).toMatchObject({status:'saved',noteId:task.createId});
});
