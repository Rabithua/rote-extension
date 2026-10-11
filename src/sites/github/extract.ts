import { githubCaptureSchema } from '../../domain/capture';

const descriptionSelector = '[class*="SidebarAbout-module__description"], .f4.my-3';
const aboutSelector = '[class*="SidebarSection-module__sidebarSection"], .BorderGrid-cell';
const resourceIcons = 'svg.octicon-pulse, svg.octicon-repo-forked, svg.octicon-star, svg.octicon-eye';

function repositoryDescription(doc: Document, repository: string, current: URL) {
  for (const section of doc.querySelectorAll(aboutSelector)) {
    const identities = new Set<string>();
    for (const link of section.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      // Website and formatted-description links are configurable by the repository.
      // Only GitHub's own resource/stat controls identify the rendered About body.
      if (!link.querySelector(resourceIcons)) continue;
      try {
        const target = new URL(link.getAttribute('href')!, current);
        const match = target.pathname.match(/^\/([^/]+\/[^/]+)\/(?:activity|forks|stargazers|watchers)\/?$/);
        if (target.origin === current.origin && match?.[1]) identities.add(match[1].toLowerCase());
      } catch { /* Ignore malformed links. */ }
    }
    // Repository-owned About links bind even an empty description to its body.
    // Mixed identities mean the sidebar is still being replaced during navigation.
    if (identities.size === 1 && identities.has(repository.toLowerCase())) {
      return section.querySelector<HTMLElement>(descriptionSelector)?.textContent?.trim() ?? '';
    }
  }
  // Legacy pages without an About sidebar can still represent an empty repository.
  // Never consume an unbound description or accept a new header above an old body.
  const metadata = doc.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_nwo"]')?.content;
  if (!doc.querySelector(`${aboutSelector}, ${descriptionSelector}, react-app[app-name="code-view"]`)
    && metadata?.toLowerCase() === repository.toLowerCase()) return '';
  return null;
}

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
  const description = repositoryDescription(doc, repository, current);
  if (description === null) return null;
  const result = githubCaptureSchema.safeParse({ site: 'github', repository, sourceId: repository.toLowerCase(),
    sourceUrl: `https://github.com/${repository}`, text: description, images: [], complete: true, capturedAt: new Date().toISOString() });
  return result.success ? result.data : null;
}
