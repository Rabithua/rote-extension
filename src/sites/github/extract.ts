import { githubCaptureSchema } from '../../domain/capture';

export function extractRepository(doc: Document = document, url = location.href) {
  const current = new URL(url);
  if (current.origin !== 'https://github.com') return null;
  const metadataRepository = doc.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_nwo"]')?.content;
  const title = doc.querySelector<HTMLAnchorElement>('[data-testid="repo-name-link"], [itemprop="name"] a');
  let titleUrl: URL | null = null;
  try { if (title) titleUrl = new URL(title.getAttribute('href') ?? '', current); } catch { return null; }
  // The rendered header is current during SPA navigation; head metadata can lag behind it.
  const repository = titleUrl ? titleUrl.pathname.replace(/^\/|\/$/g, '') : metadataRepository;
  if (!repository || (titleUrl && titleUrl.origin !== current.origin)
    || current.pathname.replace(/\/$/, '').toLowerCase() !== `/${repository.toLowerCase()}`) return null;

  const header = (title?.closest('[itemprop="name"]') ?? title?.closest('strong') ?? title)?.parentElement;
  const labels = (header ?? doc.querySelector('#repository-container-header'))
    ?.querySelectorAll<HTMLElement>('[data-testid="repo-visibility-label"], [data-component="Label"], .Label') ?? [];
  const visibility = Array.from(labels, label => label.textContent?.trim().toLowerCase() ?? '');
  const metadataVisibility = metadataRepository?.toLowerCase() === repository.toLowerCase()
    ? doc.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_public"]')?.content : undefined;
  // Never infer public access from the URL or a Public word elsewhere in the README.
  if (metadataVisibility === 'false' || visibility.some(label => /^(private|internal)\b/.test(label))) return null;
  if (metadataVisibility !== 'true' && !visibility.some(label => /^public\b/.test(label))) return null;
  const description = doc.querySelector<HTMLElement>('[class*="SidebarAbout-module__description"], .f4.my-3')?.textContent?.trim() ?? '';
  const result = githubCaptureSchema.safeParse({ site: 'github', repository, sourceId: repository.toLowerCase(),
    sourceUrl: `https://github.com/${repository}`, text: description, images: [], complete: true, capturedAt: new Date().toISOString() });
  return result.success ? result.data : null;
}
