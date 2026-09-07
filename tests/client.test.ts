import { describe, expect, it, vi } from 'vitest';
import { ApiFailure, RoteClient } from '../src/rote/client';
import { capture } from './fixtures';
const key = '11111111-1111-4111-8111-111111111111';
const config = {apiUrl:'https://api.example.test',openKey:key};
describe('Rote API contract', () => {
  it('creates a private note with the key in JSON, never in the POST URL', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{id:crypto.randomUUID(),content:'saved'}})));
    await new RoteClient(config,request).createNote(capture());
    const [url,options] = request.mock.calls[0]!;
    expect(String(url)).toBe('https://api.example.test/v2/api/openkey/notes');
    expect(JSON.parse(options!.body as string)).toMatchObject({state:'private',tags:[],openkey:key});
    expect(options!.redirect).toBe('error');
  });
  it('marks a lost or malformed create response as uncertain', async () => {
    for (const result of [() => Promise.reject(new Error('network')), () => Promise.resolve(new Response('{}'))]) {
      const request = vi.fn<typeof fetch>().mockImplementation(result);
      await expect(new RoteClient(config,request).createNote(capture())).rejects.toMatchObject({uncertain:true});
    }
  });
  it('keeps errors free of response bodies, keys and signed URLs', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(key,{status:403}));
    await expect(new RoteClient(config,request).permissions()).rejects.toEqual(new ApiFailure(403,false));
  });
  it('uses canonical permission and search endpoints', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:[]})));
    await new RoteClient(config,request).findNotes('https://x.com/test/status/123');
    const url = new URL(String(request.mock.calls[0]![0]));
    expect(url.pathname).toBe('/v2/api/openkey/notes/search');
    expect(url.searchParams.get('keyword')).toBe('https://x.com/test/status/123');
    expect(url.searchParams.get('openkey')).toBe(key);
  });
});

it('sends explicitly selected public visibility and tags', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({data:{id:crypto.randomUUID(),content:'saved'}})));
  await new RoteClient(config,request).createNote(capture(),{tags:['X','阅读'],visibility:'public'});
  expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toMatchObject({state:'public',tags:['X','阅读']});
});
