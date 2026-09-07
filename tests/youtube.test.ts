import { expect, it } from 'vitest';
import { youtubeFixture, youtubeCard } from '../e2e/youtube-fixture';
import { extractCard, extractWatch, videoId } from '../src/sites/youtube/extract';
import { captureSchema, noteContent } from '../src/domain/capture';
import { captureTags } from '../src/domain/tags';
import { isSiteRequestAllowed } from '../src/messaging/background';
it('captures complete title and plain channel metadata with one bound cover',()=>{
  document.body.innerHTML=youtubeCard();const item=extractCard(document.querySelector('yt-lockup-view-model')!)!;
  expect(noteContent(item)).toBe('Full video title\n\nhttps://www.youtube.com/watch?v=abcdefghijk');
  expect(item.images).toEqual([{url:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',alt:'Full video title'}]);
  expect(captureSchema.safeParse({...item,images:[{url:'https://i.ytimg.com/vi/lmnopqrstuv/hqdefault.jpg',alt:''}]}).success).toBe(false);
  expect(captureTags('youtube',{defaultTags:['YouTube'],addPlatformTag:true})).toEqual(['YouTube']);
});
it('uses watch metadata during ads and rejects stale navigation and unsupported URLs',()=>{
  document.documentElement.innerHTML=youtubeFixture(true);
  expect(extractWatch(document,'https://www.youtube.com/watch?v=abcdefghijk')?.title).toBe('Full video title');
  expect(extractWatch(document,'https://www.youtube.com/watch?v=lmnopqrstuv')).toBeNull();
  expect(videoId('https://evil.test/watch?v=abcdefghijk')).toBeNull();
  expect(videoId('/shorts/abcdefghijk')).toBeNull();
  expect(videoId('/watch?v=abcdefghijk&list=foo&t=23')).toBe('abcdefghijk');
});
it('authorizes only YouTube top-frame messages for YouTube captures',()=>{
  document.body.innerHTML=youtubeCard();const capture=extractCard(document.querySelector('yt-lockup-view-model')!)!;
  const sender={tab:{id:1},frameId:0,url:'https://www.youtube.com/'} as chrome.runtime.MessageSender;
  expect(isSiteRequestAllowed(sender,{type:'capture',capture})).toBe(true);
  expect(isSiteRequestAllowed({...sender,url:'https://x.com/'},{type:'capture',capture})).toBe(false);
  expect(isSiteRequestAllowed(sender,{type:'settings:get'})).toBe(false);
});
