import { youtubeCaptureSchema } from '../../domain/capture';

export const CARD_SELECTOR = 'yt-lockup-view-model, ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer';
export function videoId(value: string): string | null {
  try {
    const url = new URL(value, 'https://www.youtube.com');
    if (url.origin !== 'https://www.youtube.com' || url.pathname !== '/watch') return null;
    const id = url.searchParams.get('v'); return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
function capture(id: string, title: string, channel: string) {
  const parsed = youtubeCaptureSchema.safeParse({ site:'youtube', sourceId:id, sourceUrl:`https://www.youtube.com/watch?v=${id}`,
    title, channel, text:'', images:[{url:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,alt:title}], complete:true, capturedAt:new Date().toISOString() });
  return parsed.success ? parsed.data : null;
}
export function extractCard(card: Element) {
  if (card.closest('ytd-ad-slot-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer')) return null;
  const title = card.querySelector<HTMLAnchorElement>('a#video-title, a#video-title-link, .yt-lockup-metadata-view-model__title a, a.yt-lockup-metadata-view-model__title, a.ytLockupMetadataViewModelTitle');
  const id = title?.getAttribute('href') ? videoId(title.getAttribute('href')!) : null;
  const channel = card.querySelector<HTMLElement>('#channel-name a, a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"], .ytContentMetadataViewModelMetadataRow:first-child [role="text"], .yt-content-metadata-view-model__metadata-row:first-child');
  return id && title ? capture(id, title.getAttribute('title')?.trim() || title.closest('h3')?.getAttribute('title')?.trim() || title.textContent?.trim() || '', channel?.textContent?.trim() ?? '') : null;
}
export function extractWatch(doc = document, url = location.href) {
  const id = videoId(url); const watch = doc.querySelector('ytd-watch-flexy');
  // The player may be showing an advertisement. Only bind to the watch page's video ID and metadata.
  if (!id || watch?.getAttribute('video-id') !== id) return null;
  const metadata = watch.querySelector('ytd-watch-metadata');
  const title = metadata?.querySelector('h1 yt-formatted-string, h1');
  const channel = metadata?.querySelector('#owner #channel-name a, ytd-video-owner-renderer #channel-name a');
  return capture(id, title?.textContent?.trim() ?? '', channel?.textContent?.trim() ?? '');
}
