import { beforeEach, describe, expect, it } from 'vitest';
import { extractRepository } from '../src/sites/github/extract';
import { captureSchema, noteContent } from '../src/domain/capture';
import { captureTags } from '../src/domain/tags';
import { isSiteRequestAllowed } from '../src/messaging/background';

const url = 'https://github.com/Owner/Repo';
function repositoryHeader(repository = 'Owner/Repo', visibility = 'Public') {
  return `<div><div itemprop="name"><strong><a data-testid="repo-name-link" href="/${repository}">${repository.split('/')[1]}</a></strong></div><span data-testid="repo-visibility-label" data-component="Label">${visibility}</span></div>`;
}
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
  it('uses the current repository header when the public metadata is missing', () => {
    document.querySelector('meta[name$="_public"]')!.remove();
    document.body.insertAdjacentHTML('afterbegin', repositoryHeader());
    expect(extractRepository(document,url)?.repository).toBe('Owner/Repo');
    expect(extractRepository(document,url)?.text).toBe('Useful project 🌱');
    document.head.innerHTML = '';
    expect(extractRepository(document,url)?.sourceId).toBe('owner/repo');
  });
  it('recognizes semantic header labels without generated classes or test IDs', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = repositoryHeader().replace(/ data-testid="[^"]+"/g, '');
    expect(extractRepository(document,url)?.repository).toBe('Owner/Repo');
  });
  it('uses adjacent labels when only the repository title test ID remains', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<div><strong><a data-testid="repo-name-link" href="/Owner/Repo">Repo</a></strong><span data-component="Label">Public</span></div>';
    expect(extractRepository(document,url)?.repository).toBe('Owner/Repo');
    document.querySelector('a')!.setAttribute('href','https://[');
    expect(extractRepository(document,url)).toBeNull();
  });
  it.each(['Public', 'Public archive', 'Public template'])('supports the legacy %s header label', visibility => {
    document.querySelector('meta[name$="_public"]')!.remove();
    document.body.innerHTML = `<div id="repository-container-header"><h1><strong itemprop="name"><a href="/Owner/Repo">Repo</a></strong><span class="Label Label--secondary">${visibility}</span></h1></div>`;
    expect(extractRepository(document,url)?.repository).toBe('Owner/Repo');
  });
  it.each(['Private', 'Private archive', 'Internal'])('excludes a %s header even with stale public metadata', visibility => {
    document.body.innerHTML = repositoryHeader('Owner/Repo', visibility);
    expect(extractRepository(document,url)).toBeNull();
  });
  it('rejects conflicting private metadata and unknown visibility', () => {
    document.body.innerHTML = repositoryHeader();
    document.querySelector('meta[name$="_public"]')!.setAttribute('content','false');
    expect(extractRepository(document,url)).toBeNull();
    document.head.innerHTML = '';
    document.querySelector('[data-testid="repo-visibility-label"]')!.textContent = 'Unknown';
    expect(extractRepository(document,url)).toBeNull();
  });
  it('binds visibility to the current repository during navigation', () => {
    document.querySelector('meta[name$="_public"]')!.setAttribute('content','false');
    document.body.innerHTML = repositoryHeader('Next/Project');
    expect(extractRepository(document,'https://github.com/Next/Project')?.sourceId).toBe('next/project');
    expect(extractRepository(document,url)).toBeNull();
    document.querySelector('meta[name$="_nwo"]')!.setAttribute('content','Next/Project');
    document.querySelector('meta[name$="_public"]')!.setAttribute('content','true');
    document.body.innerHTML = repositoryHeader();
    expect(extractRepository(document,'https://github.com/Next/Project')).toBeNull();
  });
  it('does not infer public access from repository links or README labels', () => {
    document.querySelector('meta[name$="_public"]')!.remove();
    document.body.innerHTML = '<main id="readme"><a href="/Owner/Repo">Owner/Repo</a><span class="Label">Public</span></main>';
    expect(extractRepository(document,url)).toBeNull();
    document.body.innerHTML = repositoryHeader().replace('href="/Owner/Repo"', 'href="https://example.com/Owner/Repo"');
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
    expect(isSiteRequestAllowed(sender,{type:'tasks:remove',id:'account:github:owner/repo'})).toBe(false);
    expect(isSiteRequestAllowed(sender,{type:'tasks:reconcile',id:'account:github:owner/repo'})).toBe(false);
    expect(isSiteRequestAllowed({...sender,frameId:1},{type:'capture',capture})).toBe(false);
    expect(isSiteRequestAllowed({...sender,url:'https://github.com.evil.test'},{type:'capture',capture})).toBe(false);
    expect(isSiteRequestAllowed(sender,{type:'status',site:'x',sourceId:'123'})).toBe(false);
  });
});
