import { githubCaptureSchema } from '../../domain/capture';

export function extractRepository(doc: Document = document, url = location.href) {
  const current = new URL(url);
  const repository = doc.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_nwo"]')?.content;
  const isPublic = doc.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_public"]')?.content === 'true';
  if (!repository || !isPublic || current.origin !== 'https://github.com'
    || current.pathname.replace(/\/$/, '').toLowerCase() !== `/${repository.toLowerCase()}`) return null;
  const description = doc.querySelector<HTMLElement>('[class*="SidebarAbout-module__description"], .f4.my-3')?.textContent?.trim() ?? '';
  const result = githubCaptureSchema.safeParse({ site: 'github', repository, sourceId: repository.toLowerCase(),
    sourceUrl: `https://github.com/${repository}`, text: description, images: [], complete: true, capturedAt: new Date().toISOString() });
  return result.success ? result.data : null;
}
