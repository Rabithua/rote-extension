import type { CaptureItem } from '../../domain/capture';
import type { TaskView } from '../../domain/task';
import { languageFor, translate } from '../../locales/messages';
import type { AdapterBridge, SiteAdapter } from '../adapter';
import { CaptureToast } from '../toast';

type PageCapture = Exclude<CaptureItem, { site: 'x' | 'github' | 'youtube' | 'web' }>;

export interface PageDefinition {
  site: PageCapture['site'];
  sourceId(url: string): string | null;
  closeMenu?(): void;
  isMountedValid?(): boolean;
  extract(): PageCapture | null | Promise<PageCapture | null>;
  mountButton(label: string): { button: HTMLButtonElement; root: HTMLElement } | null;
}

export class PageAdapter implements SiteAdapter {
  readonly site: PageCapture['site'];
  private observer?: MutationObserver;
  private frame?: number;
  private root?: HTMLElement;
  private button?: HTMLButtonElement;
  private label?: HTMLElement;
  private sourceId?: string;
  private routeId?: string;
  private watchedSource?: string;
  private busy = false;
  private tasks = new Map<string, TaskView>();
  private toast: CaptureToast;

  constructor(private bridge: AdapterBridge, private definition: PageDefinition) {
    this.site = definition.site;
    this.toast = new CaptureToast(key => this.t(key), () => bridge.openSettings());
  }

  private t(key: string) { return translate(languageFor('system', document.documentElement.lang), key); }

  mount() {
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'aria-labelledby', 'data-state'] });
    document.addEventListener('rote:page-refresh', this.schedule);
    this.refresh();
  }

  private schedule = () => {
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.refresh(); });
  };

  private refresh() {
    const sourceId = this.definition.sourceId(location.href);
    if (!sourceId) { this.clear(); return; }
    if (sourceId === this.routeId && this.root?.isConnected && (this.definition.isMountedValid?.() ?? true)) return;
    if (sourceId !== this.routeId) { this.clear(); this.routeId = sourceId; this.sourceId = sourceId; }
    this.root?.remove(); this.root = undefined; this.button = undefined; this.label = undefined;
    const mounted = this.definition.mountButton(this.t('save'));
    if (!mounted) return;
    this.root = mounted.root; this.button = mounted.button;
    this.label = mounted.button.querySelector('[data-rote-label]') ?? undefined;
    this.sourceId = this.tasks.get(sourceId)?.sourceId ?? sourceId; this.routeId = sourceId;
    if (this.busy) this.render('saving');
    mounted.button.addEventListener('click', () => { void this.save(sourceId, mounted.button); });
    void this.bridge.status(this.tasks.get(sourceId)?.sourceId ?? sourceId).then(task => {
      if (this.button !== mounted.button) return;
      if (task) { this.tasks.set(sourceId, task); this.sourceId = task.sourceId; }
      if (this.button === mounted.button && task && !this.busy) this.update(task);
    }).catch(() => undefined);
  }

  private async save(sourceId: string, button: HTMLButtonElement) {
    if (this.busy || button.disabled) return;
    const pageUrl = location.href;
    this.definition.closeMenu?.();
    this.busy = true; this.render('saving'); this.toast.reset(); this.toast.show('saving');
    try {
      const capture = await this.definition.extract();
      if (location.href !== pageUrl) return;
      if (!capture) throw new Error('unsupported');
      this.sourceId = capture.sourceId; this.watchedSource = capture.sourceId;
      const task = await this.bridge.save(capture);
      if (task) { this.tasks.set(sourceId, task); this.update(task); }
    } catch (error) {
      if (location.href !== pageUrl) return;
      this.busy = false; this.render('save');
      this.toast.show(error instanceof Error ? error.message : 'save_failed', true);
      if (error instanceof Error && error.message === 'not_configured') void this.bridge.openSettings();
    }
  }

  private render(state: 'save' | 'saving' | 'saved' | 'uncertain') {
    if (!this.button) return;
    const disabled = state !== 'save';
    this.button.disabled = disabled;
    this.button.setAttribute('aria-disabled', String(disabled));
    const translated = this.t(state);
    this.button.setAttribute('aria-label', translated);
    this.button.title = translated;
    if (this.label) this.label.textContent = translated;
  }

  update(task: TaskView) {
    if (task.site !== this.site || task.sourceId !== this.sourceId) return;
    if (this.routeId) this.tasks.set(this.routeId, task);
    this.busy = ['queued', 'creating', 'uploading', 'finalizing'].includes(task.status);
    this.render(this.busy ? 'saving' : task.status === 'saved' ? 'saved'
      : task.status === 'uncertain' ? 'uncertain' : 'save');
    if (task.sourceId === this.watchedSource) this.toast.showTask(task);
  }

  private clear() {
    this.root?.remove(); this.toast.hide(); this.root = undefined; this.button = undefined;
    this.label = undefined; this.sourceId = undefined; this.routeId = undefined; this.watchedSource = undefined; this.busy = false;
  }

  dispose() {
    this.observer?.disconnect();
    document.removeEventListener('rote:page-refresh', this.schedule);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined; this.clear();
  }
}
