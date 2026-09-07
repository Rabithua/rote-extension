import type { CaptureItem } from '../../domain/capture';
import type { TaskView } from '../../domain/task';
import { languageFor, translate, type Language } from '../../locales/messages';
import type { AdapterBridge, SiteAdapter } from '../adapter';
import { applyMenuAppearance, menuBackground, roteIcon } from './appearance';
import { canonicalPost, extractPost, ownElements } from './extract';

interface Target { article: HTMLElement; trigger: HTMLElement; sourceId?: string; menusBefore: Set<Element> }
export class XAdapter implements SiteAdapter {
  readonly site = 'x';
  private observer?: MutationObserver;
  private target?: Target;
  private menu?: HTMLElement;
  private row?: HTMLElement;
  private toast?: HTMLElement;
  private toastText?: HTMLElement;
  private toastAction?: HTMLButtonElement;
  private timer?: ReturnType<typeof setTimeout>;
  private frame?: number;
  private watchedSource?: string;
  private language: Language = languageFor('system', document.documentElement.lang || navigator.language);
  constructor(private bridge: AdapterBridge) {}
  private t(key: string) { return translate(this.language, key); }
  mount() {
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('popstate', this.clearTarget);
    this.observer = new MutationObserver(records => {
      if (!this.target) return;
      if (this.menu && !this.menu.isConnected) { this.clearTarget(); return; }
      if (!records.some(record => record.addedNodes.length)) return;
      if (this.frame !== undefined) return;
      this.frame = requestAnimationFrame(() => { this.frame = undefined; this.mountMenu(); });
    });
  }
  private clearTarget = () => {
    this.observer?.disconnect();
    this.menu?.removeEventListener('keydown', this.menuKeys, true);
    this.row?.remove(); this.row = undefined; this.menu = undefined; this.target = undefined;
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.clearTarget();
    else if (event.target instanceof Node && this.menu?.contains(event.target)) this.menuKeys(event);
  };
  private onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLElement>('button, [role="button"]');
    const article = trigger?.closest<HTMLElement>('[data-testid="tweet"]');
    const label = trigger?.getAttribute('aria-label') ?? '';
    if (trigger && article && (trigger.dataset.testid === 'share' || /^(Share|Share post|分享|分享帖子)$/i.test(label))) {
      this.clearTarget();
      this.language = languageFor('system', document.documentElement.lang || navigator.language);
      const time = ownElements<HTMLTimeElement>(article,'time[datetime]')[0];
      const href = time?.closest('a')?.getAttribute('href');
      this.target = { trigger, article, sourceId: href ? canonicalPost(href)?.id : undefined,
        menusBefore: new Set(document.querySelectorAll('[role="menu"]')) };
      // Observe only while a share target is active, and prefer X's overlay root.
      this.observer?.observe(document.querySelector('#layers') ?? document.body, { childList: true, subtree: true });
      return;
    }
    if (this.menu && !this.menu.contains(event.target)) this.clearTarget();
  };
  private mountMenu() {
    const target = this.target;
    if (!target || this.row || !target.article.isConnected || !target.sourceId) return;
    const menus = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]'));
    const menu = menus.find(element => !target.menusBefore.has(element) && element.getClientRects().length > 0);
    if (!menu) return;
    const nativeItems = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(element => !element.dataset.roteCapture);
    const template = nativeItems[0];
    if (!template) return;
    const row = document.createElement('div');
    row.dataset.roteCapture = target.sourceId; row.setAttribute('role','menuitem'); row.tabIndex = -1;
    const label = document.createElement('span'); label.textContent = this.t('save');
    row.append(roteIcon(), label); applyMenuAppearance(row, template);
    // The row belongs to the existing menu's list, not an independent overlay.
    nativeItems.at(-1)!.insertAdjacentElement('afterend', row);
    this.row = row; this.menu = menu;
    const save = (event: Event) => {
      event.preventDefault(); event.stopPropagation();
      if (row.getAttribute('aria-disabled') === 'true') return;
      let capture: CaptureItem;
      try {
        capture = extractPost(target.article);
        if (capture.sourceId !== target.sourceId) throw new Error('unsupported');
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : 'unsupported', template);
        this.closeMenu(target.trigger); return;
      }
      row.setAttribute('aria-disabled','true');
      this.watchedSource = capture.sourceId;
      this.showToast('saving', template);
      this.closeMenu(target.trigger);
      void this.bridge.save(capture).then(task => { if (task) this.update(task); }, error => {
        const key = error instanceof Error ? error.message : 'save_failed';
        this.showToast(key, undefined, key === 'not_configured');
      });
    };
    row.addEventListener('click', save);
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') save(event); });
    // X's React focus registry does not include an injected node. Own navigation for this menu
    // while mounted so the new row is reachable with arrows, Home/End and Tab.
    menu.addEventListener('keydown', this.menuKeys, true);
    void this.bridge.status(target.sourceId).then(task => {
      if (this.row === row && task) this.updateRow(task);
    }).catch(() => undefined);
  }
  private menuKeys = (event: KeyboardEvent) => {
    if (!this.menu || !['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)) return;
    const items = Array.from(this.menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(item => item.getAttribute('aria-disabled') !== 'true');
    if (!items.length) return;
    const index = items.findIndex(item => item === document.activeElement || item.contains(document.activeElement));
    const offset = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + offset + items.length) % items.length;
    event.preventDefault(); event.stopImmediatePropagation(); items[next]?.focus();
  };
  private closeMenu(trigger: HTMLElement) {
    const menu = this.menu;
    (menu ?? trigger).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    // Host dismissal uses its existing outside-click handler. Do not remove React-owned nodes.
    if (menu?.isConnected) document.body.click();
    this.clearTarget(); trigger.focus({ preventScroll: true });
  }
  private updateRow(task: TaskView) {
    if (!this.row || this.row.dataset.roteCapture !== task.sourceId) return;
    const busy = ['queued','creating','uploading','finalizing'].includes(task.status);
    const label = this.row.querySelector('span');
    if (label) label.textContent = this.t(task.status === 'saved' ? 'saved' : busy ? 'saving' : 'save');
    this.row.setAttribute('aria-disabled', String(busy || task.status === 'saved'));
  }
  update(task: TaskView) {
    this.updateRow(task);
    if (task.sourceId !== this.watchedSource) return;
    const key = task.status === 'saved' ? 'saved' : task.status === 'uncertain' ? 'create_uncertain'
      : task.status === 'failed' ? task.noteId ? 'partial' : task.error ?? 'save_failed' : 'saving';
    this.showToast(key, undefined, task.status === 'failed' || task.status === 'uncertain');
  }
  private showToast(key: string, template?: HTMLElement, action = false) {
    if (this.timer) clearTimeout(this.timer);
    if (!this.toast) {
      const host = document.createElement('div'); host.dataset.roteToast = '';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = ':host{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 32px)}.message{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;box-shadow:0 2px 12px #0003;font-size:14px;line-height:20px}button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;white-space:nowrap;padding:0;text-decoration:underline}button:focus-visible{outline:2px solid currentColor;outline-offset:3px}';
      const box = document.createElement('div'); box.className = 'message'; box.setAttribute('role','status'); box.setAttribute('aria-live','polite');
      const basis = template ?? document.body;
      box.style.background = menuBackground(basis); box.style.color = getComputedStyle(basis).color;
      box.style.fontFamily = getComputedStyle(basis).fontFamily;
      this.toastText = document.createElement('span');
      this.toastAction = document.createElement('button'); this.toastAction.textContent = this.t('settingsLink');
      this.toastAction.onclick = () => { void this.bridge.openSettings(); this.removeToast(); };
      const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', this.language === 'zh' ? '关闭' : 'Close');
      close.onclick = () => this.removeToast();
      box.append(this.toastText, this.toastAction, close); shadow.append(style,box); document.body.append(host); this.toast = host;
    }
    this.toastText!.textContent = this.t(key); this.toastAction!.hidden = !action;
    if (key === 'saved' || ['incomplete','unsupported','empty_capture'].includes(key)) this.timer = setTimeout(() => this.removeToast(), 6000);
  }
  private removeToast() { this.toast?.remove(); this.toast = undefined; }
  dispose() {
    this.menu?.removeEventListener('keydown', this.menuKeys, true);
    this.observer?.disconnect(); this.clearTarget(); this.removeToast();
    if (this.timer) clearTimeout(this.timer);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('popstate', this.clearTarget);
  }
}
