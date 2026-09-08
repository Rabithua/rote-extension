import type { TaskView } from '../domain/task';

/** Shared Rote feedback. Shadow DOM keeps all toast styling off the host page. */
export class CaptureToast {
  private host?: HTMLElement;
  private text?: HTMLElement;
  private icon?: HTMLElement;
  private action?: HTMLButtonElement;
  private timer?: ReturnType<typeof setTimeout>;
  private exitTimer?: ReturnType<typeof setTimeout>;
  private dismissed = false;
  constructor(private t: (key: string) => string, private openSettings: () => Promise<void>) {}
  reset() { this.dismissed = false; }
  showTask(task: TaskView) {
    const failed = task.status === 'failed' || task.status === 'uncertain';
    const key = task.status === 'saved' ? 'saved' : task.status === 'uncertain' ? 'create_uncertain'
      : task.status === 'failed' ? task.noteId ? 'partial' : task.error ?? 'save_failed' : 'saving';
    this.show(key, failed);
  }
  show(key: string, recovery = false) {
    if (this.dismissed) return;
    if (this.timer) clearTimeout(this.timer);
    if (this.exitTimer) clearTimeout(this.exitTimer);
    this.exitTimer = undefined;
    if (this.host) delete this.host.dataset.closing;
    if (!this.host) {
      const host = document.createElement('div'); host.dataset.roteToast = '';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      // Rote popover/foreground/border tokens, matching its Sonner theme mapping.
      style.textContent = `:host{all:initial;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;width:max-content;max-width:calc(100vw - 32px);color-scheme:light dark;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:oklch(.145 0 0)}
      .message{display:flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;border:1px solid oklch(.922 0 0);background:oklch(1 0 0);box-shadow:0 4px 12px #0000001a;opacity:1;transform:translateY(0) scale(1);transition:opacity 180ms ease-out,transform 360ms cubic-bezier(.22,1.2,.36,1)}
      @starting-style{.message{opacity:0;transform:translateY(10px) scale(.96)}}
      :host([data-closing]){pointer-events:none}
      :host([data-closing]) .message{opacity:0;transform:translateY(6px) scale(.98);transition:opacity 160ms ease-out,transform 180ms cubic-bezier(.4,-.12,.6,1)}
      .text{overflow-wrap:anywhere;min-width:0;max-width:420px}.icon{flex:none;width:16px;text-align:center;font-size:16px}.saving{box-sizing:border-box;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin 1s linear infinite}
      button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;flex:none;padding:0}button[hidden]{display:none}.action{text-decoration:underline;text-underline-offset:3px}.close{display:flex;align-items:center;justify-content:center;padding:2px;border-radius:999px}.close:hover{background:#8882}button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
      @keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.saving{animation:none}.message{transition:none!important;transform:none!important}}@media(prefers-color-scheme:dark){:host{color:oklch(.985 0 0)}.message{background:oklch(.205 0 0);border-color:#ffffff1a}}
      @media(max-width:480px){.message{flex-wrap:wrap}.text{flex:1}.action{margin-left:24px}.close{margin-left:auto}}`;
      const box = document.createElement('div'); box.className = 'message'; box.setAttribute('role','status'); box.setAttribute('aria-live','polite'); box.setAttribute('aria-atomic','true');
      this.icon = document.createElement('span'); this.icon.setAttribute('aria-hidden','true');
      this.text = document.createElement('span'); this.text.className = 'text';
      this.action = document.createElement('button'); this.action.type = 'button'; this.action.className = 'action'; this.action.textContent = this.t('settingsLink');
      this.action.onclick = () => { void this.openSettings().then(() => this.hide()).catch(() => { this.text!.textContent = this.t('save_failed'); }); };
      const close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.textContent = '×'; close.setAttribute('aria-label', this.t('close')); close.onclick = () => this.hide();
      box.append(this.icon,this.text,this.action,close); shadow.append(style,box); document.body.append(host); this.host = host;
    }
    this.text!.textContent = this.t(key);
    this.icon!.className = key === 'saving' ? 'icon saving' : 'icon';
    this.icon!.textContent = key === 'saving' ? '' : key === 'saved' ? '✓' : '!';
    this.action!.hidden = !recovery;
    if (key === 'saved' || ['incomplete','unsupported','empty_capture'].includes(key)) this.timer = setTimeout(() => this.hide(), 6000);
  }
  hide() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined; this.dismissed = true;
    const host = this.host;
    if (!host || host.dataset.closing !== undefined) return;
    const remove = () => {
      host.remove();
      if (this.host === host) { this.host = undefined; this.text = undefined; this.icon = undefined; this.action = undefined; }
      this.exitTimer = undefined;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { remove(); return; }
    host.dataset.closing = '';
    this.exitTimer = setTimeout(remove, 200);
  }
}
