import { diffSegments, type Segment } from 'torph';

export const motionTiming = { duration: 280, easing: 'cubic-bezier(.2,0,0,1)' };

/** Keep the accessible value whole while matching and moving visual text fragments. */
export class MorphText {
  private value = '';
  private segments: Segment[] = [];
  private animations: Animation[] = [];
  private label: HTMLElement;
  private visual: HTMLElement;
  private media = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private element: HTMLElement) {
    element.classList.add('rote-morph');
    this.label = document.createElement('span'); this.label.className = 'rote-morph-label';
    this.visual = document.createElement('span'); this.visual.className = 'rote-morph-visual';
    this.visual.setAttribute('aria-hidden', 'true');
    element.replaceChildren(this.label, this.visual);
    this.media.addEventListener?.('change', this.reduceMotion);
  }

  private reduceMotion = () => { if (this.media.matches) this.finish(); };

  private finish() {
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.visual.style.width = ''; this.visual.style.maxWidth = '';
    this.visual.querySelectorAll('[data-exiting]').forEach(node => node.remove());
  }

  update(value: string) {
    if (value === this.value) return;
    const animate = !!this.value && !this.media.matches && typeof this.element.animate === 'function';
    const { segments, splits } = diffSegments(this.segments, value, document.documentElement.lang.startsWith('zh') ? 'zh' : 'en');
    const size = this.element.getBoundingClientRect();
    const bounds = this.visual.getBoundingClientRect();
    const existing = new Map(Array.from(this.visual.children).filter(node => !node.hasAttribute('data-exiting'))
      .map(node => [ (node as HTMLElement).dataset.segment!, { node: node as HTMLElement, rect: node.getBoundingClientRect() } ]));
    // A changed word can split into matching characters. Measure each character
    // inside the old word so its first transition preserves continuity too.
    const replacements: Array<() => void> = [];
    for (const [id, parts] of splits) {
      const previous = existing.get(id);
      if (!previous?.node.firstChild) continue;
      const nodes: HTMLElement[] = []; let offset = 0;
      for (const part of parts) {
        const range = document.createRange();
        range.setStart(previous.node.firstChild, offset); offset += part.string.length;
        range.setEnd(previous.node.firstChild, offset);
        const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : previous.rect;
        const node = document.createElement('span'); node.dataset.segment = part.id; node.textContent = part.string;
        nodes.push(node); existing.set(part.id, { node, rect });
      }
      existing.delete(id); replacements.push(() => previous.node.replaceWith(...nodes));
    }
    // Sample the current visual positions before cancelling an interrupted transition.
    this.finish(); replacements.forEach(replace => replace());
    this.value = value; this.label.textContent = value;
    const retained = new Set(segments.map(segment => segment.id));
    const exiting: HTMLElement[] = [];
    for (const [id, { node, rect }] of existing) {
      if (retained.has(id)) continue;
      if (!animate) { node.remove(); continue; }
      node.dataset.exiting = '';
      Object.assign(node.style, { position: 'absolute', left: `${rect.left - bounds.left}px`, top: `${rect.top - bounds.top}px` });
      exiting.push(node);
    }
    for (const segment of segments) {
      const node = existing.get(segment.id)?.node ?? document.createElement('span');
      node.dataset.segment = segment.id; node.textContent = segment.string;
      this.visual.append(node);
    }
    this.segments = segments;
    if (!animate) return;
    const next = this.visual.getBoundingClientRect();
    const play = (node: HTMLElement, frames: Keyframe[], duration = motionTiming.duration) => {
      const animation = node.animate(frames, { ...motionTiming, duration });
      this.animations.push(animation);
      return animation;
    };
    for (const node of Array.from(this.visual.children) as HTMLElement[]) {
      if (node.hasAttribute('data-exiting')) continue;
      const before = existing.get(node.dataset.segment!);
      const after = node.getBoundingClientRect();
      if (before) {
        const x = before.rect.left - bounds.left - (after.left - next.left);
        const y = before.rect.top - bounds.top - (after.top - next.top);
        if (Math.abs(x) + Math.abs(y) > .5) play(node, [{ transform: `translate(${x}px,${y}px)` }, { transform: 'none' }]);
      } else {
        play(node, [{ opacity: 0, transform: 'translateY(3px)', filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }]);
      }
    }
    for (const node of exiting) {
      play(node, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-2px)', filter: 'blur(2px)' }], 140).onfinish = () => node.remove();
    }
    if (Math.abs(size.width - next.width) + Math.abs(size.height - next.height) > .5) {
      // Keep the destination line breaks stable while its outer footprint changes.
      this.visual.style.width = `${next.width}px`; this.visual.style.maxWidth = 'none';
      play(this.element, [{ width: `${size.width}px`, height: `${size.height}px` }, { width: `${next.width}px`, height: `${next.height}px` }]).onfinish = () => {
        this.visual.style.width = ''; this.visual.style.maxWidth = '';
      };
    }
  }

  destroy() { this.finish(); this.media.removeEventListener?.('change', this.reduceMotion); }
}
