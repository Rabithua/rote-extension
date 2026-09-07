/** Resolve visible repository actions rather than relying on a single GitHub layout class. */
export function repositoryActions(repository: string): { container: HTMLElement; template: HTMLElement } | null {
  const visible = (element: HTMLElement) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const controls = Array.from(document.querySelectorAll<HTMLElement>('button, a.btn, summary'))
    .filter(element => !element.closest('[data-rote-github]') && visible(element));
  const star = controls.find(element => {
    const action = element.closest('form')?.getAttribute('action') ?? '';
    return action.toLowerCase().split('?')[0] === `/${repository.toLowerCase()}/star`
      || action.toLowerCase().split('?')[0] === `/${repository.toLowerCase()}/unstar`
      || !!element.querySelector('.octicon-star, .octicon-star-fill')
      || /^(Star|Starred|Unstar)(\s|$)/i.test(element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '');
  });
  // Older headers use a list. Ignore hidden duplicates used by responsive layouts.
  const legacy = Array.from(document.querySelectorAll<HTMLElement>('.pagehead-actions')).find(visible);
  if (legacy) {
    const template = controls.find(element => legacy.contains(element));
    if (template) return { container: legacy, template };
  }
  if (!star) return null;
  let container = star.parentElement;
  while (container && container !== document.body && container !== document.documentElement) {
    const peers = controls.filter(element => container!.contains(element));
    const hasFork = peers.some(element => !!element.querySelector('.octicon-repo-forked')
      || /^Fork(\s|$)/i.test(element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''));
    if (hasFork && !container.querySelector('main, [data-testid="readme"], #readme')) return { container, template: star };
    container = container.parentElement;
  }
  return null;
}
