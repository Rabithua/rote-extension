import { describe, expect, it } from 'vitest';
import { normalizeApiUrl, settingsSchema } from '../src/settings/store';
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
