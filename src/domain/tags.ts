import type { CaptureItem } from './capture';
import type { Settings } from '../settings/store';

const platformTags: Record<CaptureItem['site'], string> = { x: 'X' };
export function captureTags(site: CaptureItem['site'], settings: Pick<Settings, 'defaultTags' | 'addPlatformTag'>): string[] {
  const tags = [...new Set([...settings.defaultTags, ...(settings.addPlatformTag ? [platformTags[site]] : [])])];
  if (tags.length > 20) throw new Error('tag_limit');
  return tags;
}
