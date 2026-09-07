import { beforeEach, describe, expect, it } from 'vitest';
import { extractRepository } from '../src/sites/github/extract';
import { captureSchema, noteContent } from '../src/domain/capture';
import { captureTags } from '../src/domain/tags';
import { isSiteRequestAllowed } from '../src/messaging/background';

const url = 'https://github.com/Owner/Repo';
describe('GitHub capture', () => {
  beforeEach(() => { document.head.innerHTML = '<meta name="octolytics-dimension-repository_nwo" content="Owner/Repo"><meta name="octolytics-dimension-repository_public" content="true">'; document.body.innerHTML = '<p class="SidebarAbout-module__description__test">Useful project 🌱</p>'; });
  it('formats only repository, description and source URL', () => {
    const item = extractRepository(document,url)!;
    expect(item.sourceId).toBe('owner/repo');
    expect(noteContent(item)).toBe('Owner/Repo\n\nUseful project 🌱\n\n'+url);
    expect(item.images).toEqual([]);
    document.body.innerHTML = '';
    expect(noteContent(extractRepository(document,url)!)).toBe('Owner/Repo\n\n'+url);
  });
  it('excludes private, unknown and non-home pages, including stale navigation metadata', () => {
    for (const path of ['/issues','/pull/1','/tree/main','/blob/main/README.md']) expect(extractRepository(document,url+path)).toBeNull();
    expect(extractRepository(document,'https://github.com/other/repo')).toBeNull();
    document.querySelector('meta[name$="_public"]')!.setAttribute('content','false');
    expect(extractRepository(document,url)).toBeNull();
    document.querySelector('meta[name$="_public"]')!.remove();
    expect(extractRepository(document,url)).toBeNull();
  });
  it('validates canonical identity and merges platform tags', () => {
    const item = extractRepository(document,url)!;
    expect(captureSchema.safeParse({...item,sourceUrl:'https://evil.test/Owner/Repo'}).success).toBe(false);
    expect(captureSchema.safeParse({...item,sourceId:'another/repo'}).success).toBe(false);
    expect(captureTags('github',{defaultTags:['收藏','GitHub'],addPlatformTag:true})).toEqual(['收藏','GitHub']);
  });
  it('rejects cross-platform messages and settings access from content scripts', () => {
    const capture = extractRepository(document,url)!;
    const sender = {tab:{id:1},frameId:0,url} as chrome.runtime.MessageSender;
    expect(isSiteRequestAllowed(sender,{type:'capture',capture})).toBe(true);
    expect(isSiteRequestAllowed({...sender,url:'https://x.com/home'},{type:'capture',capture})).toBe(false);
    expect(isSiteRequestAllowed(sender,{type:'settings:get'})).toBe(false);
    expect(isSiteRequestAllowed({...sender,frameId:1},{type:'capture',capture})).toBe(false);
    expect(isSiteRequestAllowed({...sender,url:'https://github.com.evil.test'},{type:'capture',capture})).toBe(false);
    expect(isSiteRequestAllowed(sender,{type:'status',site:'x',sourceId:'123'})).toBe(false);
  });
});
