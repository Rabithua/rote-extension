import type { CaptureItem } from './capture';
import type { Settings } from '../settings/store';

const platformTags: Record<CaptureItem['site'], string> = {
  x: 'X', github: 'GitHub', youtube: 'YouTube', bilibili: 'Bilibili',
  hackernews: 'Hacker News', arxiv: 'arXiv', bluesky: 'Bluesky', web: 'Web',
};
export function captureTags(site: CaptureItem['site'], settings: Pick<Settings, 'defaultTags' | 'addPlatformTag'>, sourceUrl?: string): string[] {
  const hosts: Record<string, string> = { 'x.com': 'X', 'github.com': 'GitHub', 'www.youtube.com': 'YouTube', 'www.bilibili.com': 'Bilibili', 'news.ycombinator.com': 'Hacker News', 'arxiv.org': 'arXiv', 'bsky.app': 'Bluesky' };
  const hostname = sourceUrl ? new URL(sourceUrl).hostname.toLowerCase() : '';
  const platform = site === 'web' ? (hosts[hostname] ?? hostname) : platformTags[site];
  const tags = [...new Set([...settings.defaultTags, ...(settings.addPlatformTag ? [platform] : [])])];
  if (tags.length > 20 || tags.some(tag => !tag || tag.length > 50)) throw new Error('tag_limit');
  return tags;
}
