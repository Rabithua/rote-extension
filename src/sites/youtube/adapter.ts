import type { CaptureItem } from '../../domain/capture';
import type { TaskView } from '../../domain/task';
import { languageFor, translate } from '../../locales/messages';
import type { AdapterBridge, SiteAdapter } from '../adapter';
import { CaptureToast } from '../toast';
import { applyMenuAppearance, roteIcon } from '../x/appearance';
import { CARD_SELECTOR, extractCard, extractWatch } from './extract';

type VideoCapture = Extract<CaptureItem, {site:'youtube'}>;
export class YouTubeAdapter implements SiteAdapter {
  readonly site = 'youtube';
  private observer?: MutationObserver;
  private frame?: number;
  private menuTarget?: {card: Element; trigger: HTMLElement; id: string};
  private menu?: HTMLElement;
  private row?: HTMLElement;
  private menuStyles: Array<()=>void> = [];
  private watchButton?: HTMLButtonElement;
  private watchId?: string;
  private watchedId?: string;
  private navigating = false;
  private tasks = new Map<string,TaskView>();
  private submitting = new Set<string>();
  private toast: CaptureToast;
  constructor(private bridge: AdapterBridge) { this.toast = new CaptureToast(key=>this.t(key),()=>bridge.openSettings()); }
  private t(key: string) { return translate(languageFor('system',document.documentElement.lang),key); }
  mount() {
    this.navigating = false;
    document.addEventListener('click',this.onClick,true);
    document.addEventListener('keydown',this.onKey,true);
    document.addEventListener('yt-navigate-start',this.navigation);
    document.addEventListener('yt-navigate-finish',this.finished);
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['video-id','hidden','aria-hidden']});
    this.refresh();
  }
  private schedule = () => {
    if(this.frame !== undefined)return;
    this.frame=requestAnimationFrame(()=>{this.frame=undefined;this.refresh();});
  };
  private visible(element: HTMLElement) { return element.getClientRects().length>0 && !element.closest('[hidden],[aria-hidden="true"]'); }
  private refresh() {
    if(this.navigating)return;
    this.mountWatch();
    if(this.menu && (!this.menu.isConnected || !this.visible(this.menu))) this.clearMenu();
    if(!this.menuTarget || this.row)return;
    const menu=Array.from(document.querySelectorAll<HTMLElement>('ytd-menu-popup-renderer, yt-list-view-model[role="menu"]')).find(el=>this.visible(el));
    if(!menu)return;
    const itemSelector='[role="menuitem"], ytd-menu-service-item-renderer, yt-list-item-view-model';
    const items=Array.from(menu.querySelectorAll<HTMLElement>(itemSelector)).filter(el=>!el.parentElement?.closest(itemSelector));
    const native=items[0];if(!native)return;
    const row=document.createElement('div');row.dataset.roteYoutube='menu';row.tabIndex=0;row.setAttribute('role','menuitem');
    const label=document.createElement('span');label.textContent=this.t('save');row.append(roteIcon(),label);
    const layout=native.querySelector<HTMLElement>('.ytListItemViewModelLayoutWrapper')??native;
    applyMenuAppearance(row,layout);
    row.style.height=getComputedStyle(layout).height;
    const nativeText=native.querySelector<HTMLElement>('.ytListItemViewModelTitle, yt-formatted-string');
    if(nativeText){const style=getComputedStyle(nativeText);for(const property of ['font-family','font-size','font-weight','line-height','color'])row.style.setProperty(property,style.getPropertyValue(property));}
    const iconBox=native.querySelector<HTMLElement>('.ytListItemViewModelImageContainer');
    const iconGap=iconBox?getComputedStyle(iconBox).marginRight:'0px';
    row.style.gap=parseFloat(iconGap)>0?iconGap:'12px';
    const iconSize=native.querySelector<HTMLElement>('.ytIconWrapperHost');
    if(iconSize){row.querySelector('svg')!.style.width=getComputedStyle(iconSize).width;row.querySelector('svg')!.style.height=getComputedStyle(iconSize).height;}
    items.at(-1)!.insertAdjacentElement('afterend',row);
    this.menu=menu;this.row=row;
    // YouTube sizes the sheet before our row exists. Expand only this popup and
    // restore its inline styles on close; keep viewport overflow scrollable.
    const sheet=menu.closest<HTMLElement>('yt-sheet-view-model');
    if(sheet){
      this.menuStyle(sheet,'max-height',`calc(100dvh - ${Math.max(16,sheet.getBoundingClientRect().top)}px - 16px)`);
      for(const element of sheet.querySelectorAll<HTMLElement>('yt-contextual-sheet-layout, .ytContextualSheetLayoutContentContainer'))this.menuStyle(element,'height','auto');
    }
    row.addEventListener('click',this.saveMenu);
    this.render(row,this.menuTarget.id);this.readStatus(this.menuTarget.id);
  }
  private mountWatch() {
    const capture=extractWatch();
    const actions=document.querySelector<HTMLElement>('ytd-watch-metadata #top-level-buttons-computed');
    if(!capture || !actions){this.watchButton?.remove();this.watchButton=undefined;this.watchId=undefined;return;}
    if(this.watchId===capture.sourceId && this.watchButton?.parentElement===actions)return;
    this.watchButton?.remove();
    const template=Array.from(actions.querySelectorAll<HTMLButtonElement>('button')).find(el=>this.visible(el) && !el.closest('segmented-like-dislike-button-view-model') && !el.hasAttribute('aria-pressed'));
    if(!template)return;
    const button=document.createElement('button');button.type='button';button.className=template.className;
    button.dataset.roteYoutube='watch';button.style.cssText='display:flex;align-items:center;gap:8px;white-space:nowrap;margin-left:8px';
    const label=document.createElement('span');label.textContent=this.t('save');button.append(roteIcon(),label);actions.append(button);
    const id=capture.sourceId;this.watchButton=button;this.watchId=id;
    button.onclick=()=>{const fresh=extractWatch();if(!fresh || fresh.sourceId!==id){this.toast.reset();this.toast.show('youtube_unavailable');return;}this.save(fresh);};
    this.render(button,id);this.readStatus(id);
  }
  private onClick = (event: MouseEvent) => {
    if(!(event.target instanceof Element) || event.target.closest('[data-rote-youtube]'))return;
    const trigger=event.target.closest<HTMLElement>('button, [role="button"]');
    const card=trigger?.closest(CARD_SELECTOR);
    const label=trigger?.getAttribute('aria-label')??'';
    if(trigger && card && (trigger.closest('ytd-menu-renderer, .ytLockupMetadataViewModelMenuButton, .yt-lockup-metadata-view-model__menu-button') || /action menu|more actions|更多|其他操作|操作菜单/i.test(label))){
      this.clearMenu();const capture=extractCard(card);if(!capture)return;
      this.menuTarget={card,trigger,id:capture.sourceId};this.schedule();return;
    }
    if(this.menu && !this.menu.contains(event.target))this.clearMenu();
  };
  private onKey = (event: KeyboardEvent) => {
    if(!this.menu || !(event.target instanceof Node) || !this.menu.contains(event.target))return;
    if(event.target===this.row && ['Enter',' '].includes(event.key)){this.saveMenu(event);return;}
    if(!['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key))return;
    const items=Array.from(this.menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(el=>el.getAttribute('aria-disabled')!=='true');
    if(!items.length)return;
    const index=items.findIndex(el=>el===document.activeElement || el.contains(document.activeElement));
    const step=event.key==='ArrowUp'||event.key==='Tab'&&event.shiftKey?-1:1;
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+step+items.length)%items.length;
    event.preventDefault();event.stopImmediatePropagation();items[next]?.focus();
  };
  private saveMenu = (event: Event) => {
    event.preventDefault();event.stopPropagation();
    if(!this.menuTarget || this.row?.getAttribute('aria-disabled')==='true')return;
    const target=this.menuTarget;const capture=target.card.isConnected?extractCard(target.card):null;
    if(!capture || capture.sourceId!==target.id){this.closeMenu();this.toast.reset();this.toast.show('youtube_unavailable');return;}
    this.closeMenu();this.save(capture);
  };
  private closeMenu() {
    const menu=this.menu;const trigger=this.menuTarget?.trigger;
    const native=menu?.querySelector<HTMLElement>('[role="menuitem"]:not([data-rote-youtube])')??menu;
    native?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true,composed:true}));
    const backdrop=Array.from(document.querySelectorAll<HTMLElement>('tp-yt-iron-overlay-backdrop[opened]')).find(el=>this.visible(el));
    if(menu?.isConnected && this.visible(menu))backdrop?.click();
    trigger?.focus({preventScroll:true});
  }
  private save(capture: VideoCapture) {
    if(this.submitting.has(capture.sourceId))return;
    this.watchedId=capture.sourceId;this.submitting.add(capture.sourceId);this.toast.reset();this.toast.show('saving');this.renderAll();
    void this.bridge.save(capture).then(task=>{this.submitting.delete(capture.sourceId);if(task)this.update(task);},error=>{
      this.submitting.delete(capture.sourceId);this.renderAll();
      if(this.watchedId===capture.sourceId)this.toast.show(error instanceof Error?error.message:'save_failed',true);
    });
  }
  private readStatus(id:string){void this.bridge.status(id).then(task=>{if(task){this.tasks.set(id,task);this.renderAll();}}).catch(()=>undefined);}
  private render(element:HTMLElement,id:string){
    const status=this.tasks.get(id)?.status;const busy=this.submitting.has(id)||['queued','creating','uploading','finalizing'].includes(status??'');
    const disabled=busy;
    const label=element.querySelector('span');const text=this.t(busy?'saving':status==='saved'?'viewNote':status==='uncertain'?'uncertain':'save');
    if(label && label.textContent!==text)label.textContent=text;
    element.setAttribute('aria-disabled',String(disabled));if(element instanceof HTMLButtonElement)element.disabled=disabled;
  }
  private renderAll(){if(this.row&&this.menuTarget)this.render(this.row,this.menuTarget.id);if(this.watchButton&&this.watchId)this.render(this.watchButton,this.watchId);}
  update(task:TaskView){if(task.site!=='youtube')return;this.tasks.set(task.sourceId,task);this.renderAll();if(task.sourceId===this.watchedId)this.toast.showTask(task);}
  private menuStyle(element:HTMLElement,property:string,value:string){
    const previous=element.style.getPropertyValue(property);const priority=element.style.getPropertyPriority(property);
    element.style.setProperty(property,value);
    this.menuStyles.push(()=>{if(element.style.getPropertyValue(property)===value){if(previous)element.style.setProperty(property,previous,priority);else element.style.removeProperty(property);}});
  }
  private clearMenu(){this.menuStyles.splice(0).forEach(restore=>restore());this.row?.remove();this.row=undefined;this.menu=undefined;this.menuTarget=undefined;}
  private finished = ()=>{this.navigating=false;this.schedule();};
  private navigation = ()=>{this.navigating=true;this.clearMenu();this.watchButton?.remove();this.watchButton=undefined;this.watchId=undefined;this.watchedId=undefined;this.toast.hide();};
  dispose(){this.tasks.clear();this.observer?.disconnect();document.removeEventListener('click',this.onClick,true);document.removeEventListener('keydown',this.onKey,true);document.removeEventListener('yt-navigate-start',this.navigation);document.removeEventListener('yt-navigate-finish',this.finished);if(this.frame!==undefined)cancelAnimationFrame(this.frame);this.frame=undefined;this.navigation();}
}
