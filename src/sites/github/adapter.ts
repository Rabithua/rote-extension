import type { TaskView } from '../../domain/task';
import { languageFor, translate } from '../../locales/messages';
import type { AdapterBridge, SiteAdapter } from '../adapter';
import { roteIcon } from '../x/appearance';
import { extractRepository } from './extract';

export class GitHubAdapter implements SiteAdapter {
  readonly site = 'github';
  private observer?: MutationObserver;
  private frame?: number;
  private wrapper?: HTMLElement;
  private button?: HTMLButtonElement;
  private label?: HTMLElement;
  private message?: HTMLElement;
  private sourceId?: string;
  private busy = false;
  constructor(private bridge: AdapterBridge) {}
  private t(key: string) { return translate(languageFor('system', document.documentElement.lang), key); }
  mount() {
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('turbo:load', this.schedule);
    window.addEventListener('popstate', this.schedule);
    this.refresh();
  }
  private schedule = () => {
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.refresh(); });
  };
  private refresh() {
    const capture = extractRepository();
    const actions = document.querySelector<HTMLElement>('.pagehead-actions');
    if (!capture || !actions) { this.clear(); return; }
    if (this.sourceId === capture.sourceId && this.wrapper?.parentElement === actions) return;
    this.clear();
    const template = actions.querySelector<HTMLElement>('.btn');
    if (!template) return;
    actions.querySelectorAll('[data-rote-github]').forEach(element => element.remove());
    const wrapper = document.createElement('li'); wrapper.dataset.roteGithub = '';
    const button = document.createElement('button'); button.type = 'button';
    // GitHub owns these scoped button classes, including theme, hover and focus states.
    button.className = 'btn btn-sm';
    const icon = roteIcon(); icon.setAttribute('width','16'); icon.setAttribute('height','16');
    icon.style.cssText = 'width:16px;height:16px;vertical-align:text-bottom;margin-right:4px;fill:currentColor';
    const label = document.createElement('span'); label.textContent = this.t('save');
    button.append(icon,label); wrapper.append(button); actions.append(wrapper);
    this.wrapper = wrapper; this.button = button; this.label = label; this.sourceId = capture.sourceId;
    button.addEventListener('click', () => {
      if (this.busy || button.disabled) return;
      const fresh = extractRepository();
      if (!fresh || fresh.sourceId !== capture.sourceId) { this.refresh(); return; }
      this.busy = true; button.disabled = true; label.textContent = this.t('saving');
      void this.bridge.save(fresh).then(task => { if (task) this.update(task); }, error => {
        if (this.button !== button) return;
        this.busy = false; button.disabled = false; label.textContent = this.t('save');
        this.showMessage(error instanceof Error ? error.message : 'save_failed');
      });
    });
    void this.bridge.status(capture.sourceId).then(task => {
      if (this.button === button && task && !this.busy) this.update(task);
    }).catch(() => undefined);
  }
  update(task: TaskView) {
    if (task.site !== 'github' || task.sourceId !== this.sourceId || !this.button || !this.label) return;
    this.busy = ['queued','creating','uploading','finalizing'].includes(task.status);
    this.button.disabled = this.busy || task.status === 'saved' || task.status === 'uncertain';
    this.label.textContent = this.t(this.busy ? 'saving' : task.status === 'saved' ? 'saved' : task.status === 'uncertain' ? 'uncertain' : 'save');
    if (task.status === 'failed' || task.status === 'uncertain') this.showMessage(task.error ?? 'save_failed');
    else { this.message?.remove(); this.message = undefined; }
  }
  private showMessage(key: string) {
    this.message?.remove();
    const message = document.createElement('div'); message.className = 'flash flash-error'; message.setAttribute('role','status');
    message.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:100;max-width:calc(100vw - 48px)';
    const text = document.createElement('span'); text.textContent = this.t(key) + ' ';
    const settings = document.createElement('button'); settings.type = 'button'; settings.className = 'btn-link'; settings.textContent = this.t('settingsLink');
    settings.onclick = () => { void this.bridge.openSettings(); };
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn-link'; close.textContent = ' ×'; close.setAttribute('aria-label', this.t('close'));
    close.onclick = () => message.remove(); message.append(text,settings,close); document.body.append(message); this.message = message;
  }
  private clear() {
    this.wrapper?.remove(); this.message?.remove(); this.wrapper = undefined; this.button = undefined;
    this.label = undefined; this.message = undefined; this.sourceId = undefined; this.busy = false;
  }
  dispose() {
    this.observer?.disconnect(); document.removeEventListener('turbo:load', this.schedule);
    window.removeEventListener('popstate', this.schedule);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined; this.clear();
  }
}
