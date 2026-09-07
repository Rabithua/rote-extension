import type { CaptureItem } from '../src/domain/capture';
export function capture(id = '123'): CaptureItem {
  return { site:'x', sourceId:id, sourceUrl:`https://x.com/test/status/${id}`, author:{name:'Test Author', handle:'@test'},
    publishedAt:'2026-09-07T01:00:00.000Z', text:'A useful thought.\nSecond line 🌱', images:[], complete:true, capturedAt:'2026-09-07T02:00:00.000Z' };
}
export function postHtml(id = '123', extra = '', text = 'A useful thought.<br>Second line <img alt="🌱" src="emoji.png">') {
  return `<article data-testid="tweet"><div data-testid="User-Name"><a role="link" href="/test"><span>Test Author</span></a><a role="link" href="/test">@test</a><a role="link" href="/test/status/${id}"><time datetime="2026-09-07T01:00:00.000Z">1h</time></a></div><div data-testid="tweetText">${text}</div>${extra}<div role="group"><button aria-label="Share post" aria-haspopup="menu">Share</button></div></article>`;
}
