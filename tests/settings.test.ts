import { describe, expect, it } from 'vitest';
import { normalizeApiUrl, settingsSchema, parseDefaultTags } from '../src/settings/store';
describe('connection settings', () => {
  it('maps the official frontend to its verified API', () => {
    expect(normalizeApiUrl('https://rote.ink/')).toBe('https://api.rote.ink');
  });
  it('preserves custom API prefixes', () => {
    expect(normalizeApiUrl('https://example.test/rote/')).toBe('https://example.test/rote');
  });
  it('rejects credentials, fragments, insecure public HTTP and invalid OpenKeys', () => {
    for (const url of ['https://user:password@example.test','http://example.test','https://example.test/#secret']) expect(()=>normalizeApiUrl(url)).toThrow();
    expect(normalizeApiUrl('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
    expect(settingsSchema.safeParse({apiUrl:'https://rote.ink',openKey:'bad',theme:'system',language:'system'}).success).toBe(false);
  });
});

it('migrates existing settings to private with no tags and normalizes tag input', () => {
  const old = {apiUrl:'https://rote.ink',openKey:'11111111-1111-4111-8111-111111111111',theme:'system',language:'system'};
  expect(settingsSchema.parse(old)).toMatchObject({defaultTags:[],defaultVisibility:'private'});
  expect(parseDefaultTags(' #X, 阅读，X, , #research notes ')).toEqual(['X','阅读','research notes']);
  expect(settingsSchema.safeParse({...old,defaultTags:['a'.repeat(51)]}).success).toBe(false);
  expect(settingsSchema.safeParse({...old,defaultTags:Array.from({length:21},(_,i)=>String(i))}).success).toBe(false);
  expect(settingsSchema.safeParse({...old,defaultVisibility:'unknown'}).success).toBe(false);
});
