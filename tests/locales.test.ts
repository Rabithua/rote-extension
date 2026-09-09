import { describe, expect, it, vi, afterEach } from 'vitest';
import { en, zh, languageFor } from '../src/locales/messages';
import english from '../public/_locales/en/messages.json';
import chinese from '../public/_locales/zh_CN/messages.json';
import descriptions from '../assets/store/0.4.8/copy/short-descriptions.json';

afterEach(() => vi.restoreAllMocks());
describe('language selection', () => {
  it('honors the explicit setting ahead of the page language', () => {
    expect(languageFor('en', 'zh-CN')).toBe('en');
    expect(languageFor('zh', 'en-US')).toBe('zh');
  });
  it('recognizes Chinese locale variants and falls back for unsupported languages', () => {
    for (const locale of ['zh', 'zh-CN', 'ZH-tw', 'zh_CN', ' zh-Hans ']) expect(languageFor('system', locale)).toBe('zh');
    for (const locale of ['en-US', 'ja', 'zhwrong']) expect(languageFor('system', locale)).toBe('en');
  });
  it('uses the browser language when the page has no language attribute', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN');
    expect(languageFor('system', '')).toBe('zh');
    expect(languageFor('system', '  ')).toBe('zh');
  });
});
it('keeps translated messages and interpolation fields complete', () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    expect(zh[key].trim(), key).not.toBe('');
    expect(zh[key].match(/\{\w+\}/g) ?? [], key).toEqual(en[key].match(/\{\w+\}/g) ?? []);
  }
});
it('keeps store summaries and package summaries in sync within the store limit', () => {
  expect(english.extensionDescription.message).toBe(descriptions.en);
  expect(chinese.extensionDescription.message).toBe(descriptions['zh-CN']);
  for (const description of Object.values(descriptions)) expect(description.length).toBeLessThanOrEqual(132);
});
