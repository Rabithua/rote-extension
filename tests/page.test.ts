import { afterEach, expect, it, vi } from 'vitest';
import { arxivPaperId, bilibiliVideoId, hackerNewsItemId, blueskyPostId, extractHackerNews, extractArxiv, extractBilibili } from '../src/sites/page/extract';
import { remoteCapture } from '../src/sites/page/remote';
import { imageUrlAllowed } from '../src/domain/image-url';
import { captureSchema, noteContent } from '../src/domain/capture';
import { captureTags } from '../src/domain/tags';
import { webCapture } from '../src/web/capture';
import { isSiteRequestAllowed } from '../src/messaging/background';
import { PageAdapter } from '../src/sites/page/adapter';
afterEach(() => vi.unstubAllGlobals());
it('recognizes only detail routes', () => {
  expect(bilibiliVideoId('https://www.bilibili.com/video/BV1234567890/')).toBe('BV1234567890');
  expect(bilibiliVideoId('https://www.bilibili.com/video/BV1234567890/foo')).toBeNull();
  expect(hackerNewsItemId('https://news.ycombinator.com/item?id=123')).toBe('123');
  expect(arxivPaperId('https://arxiv.org/abs/2401.12345v2')).toBe('2401.12345v2');
  expect(blueskyPostId('https://bsky.app/profile/example.test/post/abc')).toBe('example.test/post/abc');
});
it('mounts with the actual page URL and avoids duplicate controls', () => {
  const sourceId = vi.fn(() => '123');
  const mountButton = vi.fn(() => { const button = document.createElement('button'); document.body.append(button); return {button,root:button}; });
  const adapter = new PageAdapter({status:async()=>undefined, save:async()=>undefined,openSettings:async()=>{}}, {site:'hackernews',sourceId,extract:()=>null,mountButton});
  adapter.mount(); expect(sourceId).toHaveBeenCalledWith(location.href); expect(mountButton).toHaveBeenCalledTimes(1); adapter.dispose();
});
it('keeps HN original link and main text, excludes metrics and comments', () => {
  document.body.innerHTML = '<tr class="athing"><td class="titleline"><a href="https://example.com/article">Title</a></td></tr><span class="subtext"><a class="hnuser">Author</a><span class="score">100 points</span></span><div class="toptext">Opening<p>Next paragraph</p></div><div class="comment">Do not capture</div>';
  // HTML parser does not retain a standalone tr outside a table.
  document.body.innerHTML = '<div class="athing"><div class="titleline"><a href="https://example.com/article">Title</a></div></div>' + document.body.innerHTML;
  const content = noteContent(extractHackerNews(document,'https://news.ycombinator.com/item?id=123')!);
  expect(content).toContain('https://example.com/article'); expect(content).toContain('Opening\n\nNext paragraph'); expect(content).not.toContain('100 points'); expect(content).not.toContain('Do not capture');
});
it('extracts arXiv abstract and version without downloading PDF',()=>{
  document.head.innerHTML='<meta name="citation_title" content="Paper"><meta name="citation_author" content="Author">';
  document.body.innerHTML='<blockquote class="abstract">Abstract: Full summary</blockquote>';
  const item=extractArxiv(document,'https://arxiv.org/abs/2401.12345v2')!;
  expect(noteContent(item)).toBe('Paper\n\nAuthor\n\nFull summary\n\nhttps://arxiv.org/abs/2401.12345v2'); expect(item.images).toEqual([]);
});
it('enforces CDN boundaries shared with the downloader',()=>{
  expect(imageUrlAllowed('https://i0.hdslb.com/bfs/archive/a.jpg','bilibili')).toBe(true);
  expect(imageUrlAllowed('https://cdn.bsky.app/img/feed_fullsize/plain/a.jpg','bluesky')).toBe(true);
  for(const u of ['https://evil.hdslb.com.evil.test/bfs/a.jpg','http://i0.hdslb.com/bfs/a.jpg','https://i0.hdslb.com:444/bfs/a.jpg','https://cdn.bsky.app/other/a.jpg']) expect(imageUrlAllowed(u)).toBe(false);
  expect(imageUrlAllowed('https://i0.hdslb.com/bfs/a.jpg','bluesky')).toBe(false);
});
it('normalizes Bilibili AV to BV and rejects stale DOM fallback',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:0,data:{bvid:'BV1234567890',aid:123,title:'Video',pic:'http://i0.hdslb.com/bfs/archive/a.jpg',owner:{name:'Creator'}}}))));
  const item=await remoteCapture({site:'bilibili',url:'https://www.bilibili.com/video/av123'});
  expect(item.sourceId).toBe('BV1234567890'); expect(item.text).toBe(''); expect(item.images).toHaveLength(1);
  document.head.innerHTML='<link rel="canonical" href="https://www.bilibili.com/video/BV9999999999">';
  expect(await extractBilibili(document,'https://www.bilibili.com/video/BV1234567890')).toBeNull();
});
it('gets full Bluesky record and all static images with stable DID identity',async()=>{
  const data={thread:{post:{uri:'at://did:plc:abc/app.bsky.feed.post/123',author:{did:'did:plc:abc',handle:'user.test',displayName:'User'},record:{$type:'app.bsky.feed.post',text:'Full\ntext',createdAt:'2026-09-07T00:00:00.000Z'},embed:{$type:'app.bsky.embed.images#view',images:[1,2].map(n=>({fullsize:`https://cdn.bsky.app/img/feed_fullsize/plain/${n}.jpg`,alt:`${n}`}))}}}};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(data))));
  const item=await remoteCapture({site:'bluesky',url:'https://bsky.app/profile/user.test/post/123'});
  expect(item.sourceId).toBe('did:plc:abc/post/123');expect(item.text).toBe('Full\ntext');expect(item.images).toHaveLength(2);expect(noteContent(item)).toBe('Full\ntext\n\nhttps://bsky.app/profile/did:plc:abc/post/123');
});
it('preserves exact selections and deduplicates per URL, kind and selection',async()=>{
  const url='https://example.com/a?q=1#section';const text='First\n\n  Second  ';
  const a=await webCapture(url,'Title',text);const b=await webCapture(url,'Different title',text);
  expect(a.sourceId).toBe(b.sourceId);expect(a.text).toBe(text);expect(noteContent(a)).toBe(`Title\n\n${text}\n\n${url}`);
  expect((await webCapture(url,'Title','Other')).sourceId).not.toBe(a.sourceId);
  expect((await webCapture(url,'Title')).sourceId).not.toBe(a.sourceId);
  expect(captureSchema.safeParse({...a,sourceUrl:'chrome://settings'}).success).toBe(false);
});
it('uses platform names or full hostnames and enforces tag limits',()=>{
  const settings={defaultTags:['GitHub'],addPlatformTag:true};
  expect(captureTags('web',settings,'https://github.com/a')).toEqual(['GitHub']);
  expect(captureTags('web',settings,'https://developer.mozilla.org/a')).toEqual(['GitHub','developer.mozilla.org']);
  expect(()=>captureTags('web',{...settings,defaultTags:[]},`https://${'a'.repeat(51)}.com`)).toThrow('tag_limit');
});
it('does not authorize generic capture messages or mismatched remote extraction',async()=>{
  const sender={tab:{id:1},frameId:0,url:'https://www.bilibili.com/video/av123'} as chrome.runtime.MessageSender;
  expect(isSiteRequestAllowed(sender,{type:'page:extract',site:'bilibili',url:sender.url!})).toBe(true);
  expect(isSiteRequestAllowed(sender,{type:'page:extract',site:'bluesky',url:sender.url!})).toBe(false);
  expect(isSiteRequestAllowed(sender,{type:'capture',capture:await webCapture('https://example.com','Title')})).toBe(false);
});
it('refuses arXiv missing its abstract rather than marking it complete',()=>{
  document.head.innerHTML='<meta name="citation_title" content="Paper"><meta name="citation_author" content="Author">'; document.body.innerHTML='';
  expect(extractArxiv(document,'https://arxiv.org/abs/2401.12345')).toBeNull();
});
