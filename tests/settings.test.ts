import { describe, expect, it, vi } from 'vitest';
import { normalizeApiUrl, settingsSchema, parseDefaultTags, writeSettings, configIdentity } from '../src/settings/store';
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
  expect(settingsSchema.parse(old)).toMatchObject({defaultTags:[],defaultVisibility:'private',defaultArchived:false});
  expect(parseDefaultTags(' #X, 阅读，X, , #research notes ')).toEqual(['X','阅读','research notes']);
  expect(settingsSchema.safeParse({...old,defaultTags:['a'.repeat(51)]}).success).toBe(false);
  expect(settingsSchema.safeParse({...old,defaultTags:Array.from({length:21},(_,i)=>String(i))}).success).toBe(false);
  expect(settingsSchema.safeParse({...old,defaultVisibility:'unknown'}).success).toBe(false);
});

it('persists the migration journal before replacing a legacy connection and retains it across rotation', async () => {
  const input=settingsSchema.parse({apiUrl:'https://api.example.test',openKey:crypto.randomUUID(),theme:'system',language:'en'});
  const legacyId=await configIdentity(input.apiUrl,input.openKey);let state:unknown={...input,id:legacyId};
  vi.stubGlobal('chrome',{storage:{local:{get:async()=>({settings:state}),setAccessLevel:async()=>{},set:async(value:{settings:unknown})=>{state=value.settings;}}}});
  try {
    const ownerId=crypto.randomUUID();const migrated=await writeSettings(input,{ownerId,noteCreateIdempotency:1});
    expect(migrated.id).not.toBe(legacyId);expect(migrated.migrationFrom).toEqual([legacyId]);
    const rotated=await writeSettings({...input,openKey:crypto.randomUUID()},{ownerId,noteCreateIdempotency:1});
    expect(rotated.id).toBe(migrated.id);expect(rotated.migrationFrom).toContain(legacyId);expect(rotated.credentialId).not.toBe(migrated.credentialId);
    const downgraded=await writeSettings(rotated,{});expect(downgraded.id).toBe(rotated.id);expect(downgraded.migrationFrom).toContain(legacyId);
  } finally {vi.unstubAllGlobals();}
});
