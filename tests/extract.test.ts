import { beforeEach, describe, expect, it } from 'vitest';
import { extractPost, canonicalPost } from '../src/sites/x/extract';
import { captureSchema } from '../src/domain/capture';
import { capture, postHtml } from './fixtures';

beforeEach(() => { document.body.innerHTML = ''; });
describe('X extraction', () => {
  it('keeps author, source, date, line breaks and emoji', () => {
    document.body.innerHTML = postHtml();
    expect(extractPost(document.querySelector('article')!)).toMatchObject({...capture(), capturedAt:expect.any(String)});
  });
  it('keeps selected post distinct from neighbours and quoted media', () => {
    document.body.innerHTML = postHtml('111') + postHtml('222', `<div role="link"><a href="/quoted/status/999"><time datetime="2020-01-01T00:00:00.000Z">2020</time></a><div data-testid="tweetText">Quoted content</div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/quote.jpg"></div></div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/one?format=jpg&name=small" alt="one"></div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/two?format=png&name=small" alt="two"></div>`);
    const result = extractPost(document.querySelectorAll('article')[1]!);
    expect(result.sourceId).toBe('222');
    expect(result.text).not.toContain('Quoted content');
    expect(result.quotedUrl).toBe('https://x.com/quoted/status/999');
    expect(result.images.map(image => image.alt)).toEqual(['one','two']);
    expect(result.images.every(image => image.url.includes('name=orig'))).toBe(true);
  });
  it('refuses collapsed content', () => {
    document.body.innerHTML = postHtml('123', '<button data-testid="tweet-text-show-more-link">Show more</button>');
    expect(() => extractPost(document.querySelector('article')!)).toThrow('incomplete');
  });
  it('ignores video posters and handles image-only posts', () => {
    document.body.innerHTML = postHtml('123', '<div data-testid="videoPlayer"><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/poster.jpg"></div></div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/photo.jpg" alt="photo"></div>', '');
    expect(extractPost(document.querySelector('article')!).images).toHaveLength(1);
  });
  it('does not accept arbitrary fetch targets or mismatched post identities', () => {
    const item = capture(); item.images = [{url:'https://private-server.test/secret',alt:''}];
    expect(captureSchema.safeParse(item).success).toBe(false);
    expect(captureSchema.safeParse({...capture(),sourceId:'999'}).success).toBe(false);
    expect(canonicalPost('https://evil.test/test/status/123')).toBeNull();
  });
  it('canonicalizes media permalinks without retaining query tracking', () => {
    expect(canonicalPost('/test/status/123/photo/1?s=20')).toEqual({id:'123',url:'https://x.com/test/status/123'});
  });
});
