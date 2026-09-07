export function imageUrlAllowed(value: string, site?: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    const kind = u.hostname === 'pbs.twimg.com' && u.pathname.startsWith('/media/') ? 'x'
      : u.hostname === 'i.ytimg.com' && /^\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/.test(u.pathname) ? 'youtube'
      : /(^|\.)hdslb\.com$/.test(u.hostname) && u.pathname.startsWith('/bfs/') ? 'bilibili'
      : u.hostname === 'cdn.bsky.app' && /^\/img\/feed_(?:fullsize|thumbnail)\/plain\//.test(u.pathname) ? 'bluesky' : undefined;
    return !!kind && (!site || kind === site);
  } catch { return false; }
}
