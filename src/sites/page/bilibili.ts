import styles from './bilibili.css?inline';
import type { MountedPageButton } from './adapter';

const shareSelector = '.video-toolbar-left .video-share, .video-toolbar-left-main .video-share';

/** Never add children to Bilibili's Vue tree, even after its SSR marker disappears. */
export function mountBilibiliButton(button: HTMLButtonElement): MountedPageButton | null {
  const share = document.querySelector<HTMLElement>(shareSelector);
  if (!share || share.closest('[data-server-rendered]')) return null;
  const anchor = share.closest<HTMLElement>('.toolbar-left-item-wrap') ?? share;
  const toolbar = share.closest<HTMLElement>('.video-toolbar, .video-toolbar-container') ?? anchor.parentElement!;
  const root = document.createElement('div'); root.dataset.roteBilibiliHost = '';
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = styles;
  button.dataset.rotePage = 'bilibili';
  const icon = button.querySelector('svg')!;
  icon.setAttribute('width', '22'); icon.setAttribute('height', '22');
  shadow.append(style, button);
  // Outside body as well: body transforms and CSS zoom must not move the portal.
  document.documentElement.append(root);
  let frame: number | undefined;
  let disposed = false;

  const isValid = () => share.isConnected && document.querySelector(shareSelector) === share;
  const refresh = () => {
    if (disposed) return;
    root.style.visibility = 'hidden';
    if (!isValid() || document.fullscreenElement || share.closest('[data-server-rendered]') || !share.checkVisibility({ checkVisibilityCSS: true })) return;
    const rect = share.getBoundingClientRect();
    const bounds = anchor.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.top < 0 || rect.bottom > window.innerHeight) return;
    const native = getComputedStyle(share);
    const scale = share.offsetHeight ? rect.height / share.offsetHeight : 1;
    button.style.font = native.font;
    button.style.padding = native.padding;
    button.style.zoom = String(scale);
    button.style.setProperty('--rote-bili-text', native.color);
    for (const name of ['--text2', '--brand_blue']) {
      const value = native.getPropertyValue(name);
      if (value) button.style.setProperty(name, value); else button.style.removeProperty(name);
    }
    const svg = share.querySelector('svg');
    const size = svg?.getBoundingClientRect();
    const fallbackSize = Math.min(22, share.clientHeight - parseFloat(native.paddingTop) - parseFloat(native.paddingBottom));
    icon.style.width = `${size?.width ? size.width / scale : fallbackSize}px`;
    icon.style.height = `${size?.height ? size.height / scale : fallbackSize}px`;
    const gap = (parseFloat(getComputedStyle(anchor).marginRight) || 0) * scale;
    const left = bounds.right + gap;
    const own = button.getBoundingClientRect();
    const top = rect.top + (rect.height - own.height) / 2;
    root.style.left = `${left}px`; root.style.top = `${top}px`;
    const right = left + own.width;
    const bottom = top + own.height;
    const toolbarBounds = toolbar.getBoundingClientRect();
    if (left < 0 || right > Math.min(window.innerWidth, toolbarBounds.right) || top < 0 || bottom > window.innerHeight) return;
    for (const element of toolbar.querySelectorAll<HTMLElement>('*')) {
      if (element.contains(anchor) || anchor.contains(element)) continue;
      const occupied = element.getBoundingClientRect();
      if (occupied.width && occupied.height && occupied.left < right && occupied.right > left && occupied.top < bottom && occupied.bottom > top
        && element.checkVisibility({ checkVisibilityCSS: true })) return;
    }
    // Only use genuinely empty toolbar space; never cover native actions or menus.
    for (const y of [top + 1, (top + bottom) / 2, bottom - 1]) {
      for (const x of [left + 1, (left + right) / 2, right - 1]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === toolbar || (toolbar.contains(hit) && hit.contains(anchor)))) return;
      }
    }
    root.style.visibility = 'visible';
  };
  const schedule = () => {
    if (disposed || frame !== undefined) return;
    frame = requestAnimationFrame(() => { frame = undefined; refresh(); });
  };
  const resize = new ResizeObserver(schedule);
  for (const element of new Set([anchor, share, toolbar, document.body, button])) resize.observe(element);
  const appearance = new MutationObserver(schedule);
  for (let element: HTMLElement | null = share; element; element = element.parentElement) {
    appearance.observe(element, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] });
  }
  // Keep the visual Share -> Rote order for keyboard users without changing host DOM.
  const tab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || button.disabled || root.style.visibility !== 'visible') return;
    const fromButton = event.composedPath().includes(button);
    const fromShare = event.target instanceof Node && anchor.contains(event.target);
    if (!fromButton && !fromShare && !event.shiftKey) return;
    const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'))
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.checkVisibility({ checkVisibilityCSS: true }) && element.getClientRects().length);
    const after = controls.find(element => !anchor.contains(element) && !!(anchor.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    let target: HTMLElement | undefined;
    if (fromButton) target = event.shiftKey
      ? controls.filter(element => anchor.contains(element) || !!(element.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1)
      : after;
    else if ((fromShare && !event.shiftKey) || (event.target === after && event.shiftKey)) target = button;
    if (target) { event.preventDefault(); target.focus(); }
  };
  document.addEventListener('keydown', tab, true);
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('fullscreenchange', schedule);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  refresh();
  return { button, root, isValid, refresh: schedule, dispose() {
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    resize.disconnect(); appearance.disconnect();
    document.removeEventListener('keydown', tab, true);
    document.removeEventListener('scroll', schedule, true);
    document.removeEventListener('fullscreenchange', schedule);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
  } };
}
