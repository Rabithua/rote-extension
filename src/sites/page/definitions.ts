import { send } from '../../messaging/protocol';
import { roteIcon } from '../x/appearance';
import type { PageDefinition } from './adapter';
import {
  arxivPaperId,
  bilibiliVideoId,
  blueskyPostId,
  extractArxiv,
  extractBilibili,
  extractHackerNews,
  hackerNewsItemId,
} from './extract';

function button(label: string) {
  const element = document.createElement('button');
  element.type = 'button'; element.setAttribute('aria-label', label); element.title = label;
  const text = document.createElement('span'); text.dataset.roteLabel = ''; text.textContent = label;
  element.append(roteIcon(), text);
  return element;
}

export const bilibiliDefinition: PageDefinition = {
  site: 'bilibili', sourceId: bilibiliVideoId, extract: async () => { const url = location.href; try { return (await send({ type: 'page:extract', site: 'bilibili', url })).capture as Awaited<ReturnType<typeof extractBilibili>>; } catch { return location.href === url ? extractBilibili() : null; } },
  mountButton(label) {
    const share = document.querySelector<HTMLElement>('.video-toolbar-left .video-share, .video-toolbar-left-main .video-share');
    // Vue must hydrate the original server-rendered tree before we add siblings.
    // Early insertion makes Bilibili rebuild its app and mount the header twice.
    if (!share || share.closest('[data-server-rendered]')) return null;
    const element = button(label); element.dataset.rotePage = 'bilibili';
    element.style.cssText = 'display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;font:inherit;white-space:nowrap;padding:8px 10px';
    element.querySelector('svg')!.setAttribute('width', '22'); element.querySelector('svg')!.setAttribute('height', '22');
    const native = getComputedStyle(share); element.style.font = native.font; element.style.setProperty('--rote-bili-text', native.color); element.style.padding = native.padding;
    const anchor = share.closest('.toolbar-left-item-wrap') ?? share;
    const size = share.querySelector('svg')?.getBoundingClientRect();
    if (size?.width) { element.querySelector('svg')!.setAttribute('width', String(size.width)); element.querySelector('svg')!.setAttribute('height', String(size.height)); element.querySelector('svg')!.style.width = `${size.width}px`; element.querySelector('svg')!.style.height = `${size.height}px`; }
    element.style.marginLeft = getComputedStyle(anchor).marginRight;
    anchor.insertAdjacentElement('afterend', element); return { button: element, root: element };
  },
};

export const hackerNewsDefinition: PageDefinition = {
  site: 'hackernews', sourceId: hackerNewsItemId, extract: () => extractHackerNews(),
  mountButton(label) {
    const target = document.querySelector<HTMLElement>('.subtext .subline, .subtext');
    if (!target) return null;
    const root = document.createElement('span'); root.dataset.rotePage = 'hackernews'; root.append(' | ');
    const element = button(label); element.style.cssText = 'display:inline;border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer';
    element.querySelector('svg')!.remove();
    element.onmouseenter = () => { element.style.textDecoration = 'underline'; }; element.onmouseleave = () => { element.style.textDecoration = ''; };
    root.append(element); target.append(root); return { button: element, root };
  },
};

export const arxivDefinition: PageDefinition = {
  site: 'arxiv', sourceId: arxivPaperId, extract: () => extractArxiv(),
  mountButton(label) {
    const target = document.querySelector<HTMLElement>('.full-text ul');
    if (!target) return null;
    const root = document.createElement('div'); root.dataset.rotePage = 'arxiv'; root.style.marginTop = '8px';
    const element = button(label); element.className = 'abs-button';
    const native = target.querySelector('a'); const style = native ? getComputedStyle(native) : getComputedStyle(target);
    element.style.cssText = `display:inline-flex;align-items:center;gap:5px;cursor:pointer;border:0;background:transparent;padding:0;font:${style.font};color:${style.color}`;
    element.onmouseenter = () => { element.style.textDecoration = 'underline'; }; element.onmouseleave = () => { element.style.textDecoration = ''; };
    element.querySelector('svg')!.setAttribute('width', '14'); element.querySelector('svg')!.setAttribute('height', '14');
    root.append(element); target.insertAdjacentElement('afterend', root); return { button: element, root };
  },
};

let menuSource: string | null = null;
function isDetailTrigger(trigger: Element): boolean {
  const post = trigger.closest('[data-testid^="postThreadItem-by-"]');
  const id = blueskyPostId(location.href);
  return !!(id && post && Array.from(post.querySelectorAll<HTMLAnchorElement>('a[href]')).some(a => {
    const url = new URL(a.href); url.pathname = url.pathname.replace(/\/(?:liked-by|reposted-by|quotes)$/, '');
    return blueskyPostId(url.href) === id;
  }));
}
function currentBlueskyMenu(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]')).find(menu => {
    if (!menu.getBoundingClientRect().height) return false;
    const labelledBy = menu.getAttribute('aria-labelledby');
    const trigger = labelledBy ? document.getElementById(labelledBy) : null;
    // Native Radix ownership takes precedence over event history, including after reload.
    if (trigger) return trigger.matches('[data-testid="postDropdownBtn"]') && isDetailTrigger(trigger);
    return menuSource === blueskyPostId(location.href);
  });
}
// Radix opens on pointerdown or keydown; click may arrive after its only DOM mutation.
export function bindBlueskyMenu(event: Event) {
  if (event instanceof KeyboardEvent && !['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest('[data-testid="postDropdownBtn"]');
  if (!trigger) return;
  menuSource = isDetailTrigger(trigger) ? blueskyPostId(location.href) : null;
  document.dispatchEvent(new Event('rote:page-refresh'));
}
export const blueskyDefinition: PageDefinition = {
  site: 'bluesky', sourceId: blueskyPostId,
  extract: async () => (await send({ type: 'page:extract', site: 'bluesky', url: location.href })).capture as Extract<import('../../domain/capture').CaptureItem, {site:'bluesky'}>,
  closeMenu() {
    document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    menuSource = null;
  },
  isMountedValid: () => !!currentBlueskyMenu(),
  mountButton(label) {
    const menu = currentBlueskyMenu();
    const native = menu?.querySelector<HTMLElement>('[role="menuitem"]');
    if (!menu || !native) return null;
    const element = button(label); element.dataset.rotePage = 'bluesky'; element.setAttribute('role', 'menuitem');
    const style = getComputedStyle(native);
    const textStyle = getComputedStyle(native.querySelector('[dir]') ?? native);
    element.className = native.className;
    element.style.cssText = `display:flex;flex-direction:row;align-items:center;width:100%;box-sizing:border-box;gap:16px;border:0;cursor:pointer;text-align:start;font:${textStyle.font};color:${textStyle.color};background:${style.backgroundColor};padding:${style.padding};height:${style.height};border-radius:${style.borderRadius}`;
    element.style.fontFamily = textStyle.fontFamily; element.style.fontSize = textStyle.fontSize; element.style.fontWeight = textStyle.fontWeight; element.style.lineHeight = textStyle.lineHeight; element.style.letterSpacing = textStyle.letterSpacing;
    const icon = element.querySelector('svg')!; icon.setAttribute('width','20'); icon.setAttribute('height','20');
    const labelNode = element.querySelector<HTMLElement>('[data-rote-label]')!; labelNode.style.flex = '1'; element.prepend(labelNode);
    element.onmouseenter = () => { if (!element.disabled) element.style.background = 'color-mix(in srgb, currentColor 8%, transparent)'; };
    element.onmouseleave = () => { element.style.background = style.backgroundColor; };
    element.onfocus = () => { element.style.outline = '2px solid currentColor'; element.style.outlineOffset = '-2px'; };
    element.onblur = () => { element.style.outline = ''; };
    native.parentElement!.append(element);
    menu.addEventListener('keydown', event => {
      if (!['ArrowDown','ArrowUp','End','Home'].includes(event.key)) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(i => i.getAttribute('aria-disabled') !== 'true');
      if (!items.length) return;
      event.preventDefault(); event.stopPropagation();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'End' ? items.length - 1 : event.key === 'Home' ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }, true);
    return {button:element, root:element};
  },
};
