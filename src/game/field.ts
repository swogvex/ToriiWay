import { toRomaji } from 'wanakana';

import { fitLanes, LANES } from './config';
import { filledChars } from './fill';
import { type Bubble, Run, type RunEvent } from './run';

interface View {
  el: HTMLElement;
  text: HTMLElement;
  hint: HTMLElement;
  chars: HTMLElement[];
  width: number;
  height: number;
  danger: boolean;
  x: number;
  y: number;
}

export interface FieldElements {
  field: HTMLElement;
  template: HTMLTemplateElement;
  typed: HTMLElement;
  wrong: HTMLElement;
  kana: HTMLElement;
}

export interface FieldOptions {
  locale: string;
  /** Show the romaji under a bubble after the first wrong key on it. */
  hint: boolean;
  /** Show the meaning in the "+1" note on pop. */
  meaning: boolean;
  /** Called when a resize changes how many lanes fit. */
  onLanes?: (lanes: number) => void;
}

/** How long the pop and miss animations in PlayField.astro last, plus a little slack. */
const RETIRE_MS = { 'is-popping': 200, 'is-missed': 360 } as const;

/** Space above the top lane and below the bottom one, for the danger badge and the hint. */
const EDGE = 12;
/** Room between rows, so the danger badge and hint do not touch the next bubble. */
const ROW_GAP = 8;

/**
 * Draws a run into the field. Bubble elements are pooled and moved with
 * translate3d only; sizes are read once per spawn, never in the frame loop.
 */
export class Field {
  private readonly views = new Map<number, View>();
  private readonly free: View[] = [];
  private width = 0;
  private height = 0;
  private row = 0;
  /** Lanes that fit the field at the current size and text size. */
  lanes = LANES;
  private targetId: number | null = null;
  private readonly resize: ResizeObserver;

  constructor(
    private readonly els: FieldElements,
    private readonly options: FieldOptions,
  ) {
    this.resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.width = entry.contentRect.width;
      this.height = entry.contentRect.height;
      this.fit();
    });
    this.resize.observe(els.field);
  }

  /** Applies one batch of run events (spawns, keys, pops, misses). */
  handle(events: readonly RunEvent[], run: Run): void {
    for (const event of events) {
      switch (event.type) {
        case 'spawn':
          this.spawn(event.bubble);
          break;
        case 'key':
          if (event.bubble) this.update(event.bubble);
          this.input(run, event.correct ? '' : event.key);
          break;
        case 'pop':
          this.update(event.bubble);
          this.note(event.bubble);
          this.retire(event.bubble, 'is-popping');
          this.input(run, '');
          break;
        case 'miss':
          this.retire(event.bubble, 'is-missed');
          this.input(run, '');
          break;
        case 'edit':
        case 'release':
          this.update(event.bubble);
          this.input(run, '');
          break;
        default:
          break;
      }
    }
    this.markTarget(run.target);
  }

  /** Moves every live bubble; runs once per frame. */
  render(run: Run): void {
    const laneHeight = (this.height - 2 * EDGE) / this.lanes;
    for (const bubble of run.bubbles) {
      const view = this.views.get(bubble.id);
      if (!view) continue;
      const travel = Math.max(0, this.width - view.width);
      const along = bubble.side === 'left' ? bubble.progress : 1 - bubble.progress;
      view.x = travel * along;
      const lane = Math.min(bubble.lane, this.lanes - 1);
      view.y = EDGE + lane * laneHeight + (laneHeight - view.height) / 2;
      view.el.style.transform = `translate3d(${view.x}px, ${view.y}px, 0)`;
      const danger = Run.inDanger(bubble);
      if (danger !== view.danger) {
        view.danger = danger;
        view.el.classList.toggle('is-danger', danger);
      }
    }
  }

  /** Removes every bubble, for a new run. */
  clear(): void {
    for (const view of this.views.values()) this.recycle(view);
    this.views.clear();
    this.targetId = null;
    for (const note of this.els.field.querySelectorAll('.pop-note')) note.remove();
    this.els.typed.textContent = '';
    this.els.wrong.textContent = '';
    this.els.kana.textContent = '';
  }

  destroy(): void {
    this.resize.disconnect();
  }

  /** Measures one bubble row (once per size change) and recounts the lanes. */
  private fit(): void {
    if (this.row === 0) {
      const probe = this.create();
      probe.text.textContent = 'あ';
      probe.el.classList.add('is-probe');
      probe.el.hidden = false;
      this.row = probe.el.offsetHeight + ROW_GAP;
      probe.el.remove();
    }
    const lanes = fitLanes(this.height - 2 * EDGE, this.row);
    if (lanes === this.lanes) return;
    this.lanes = lanes;
    this.options.onLanes?.(lanes);
  }

  private spawn(bubble: Bubble): void {
    const view = this.free.pop() ?? this.create();
    view.el.className = `bubble bubble--${bubble.side}`;
    view.el.dataset['reading'] = bubble.item.reading;
    view.chars = [...bubble.item.text].map((char) => {
      const span = document.createElement('span');
      span.textContent = char;
      return span;
    });
    view.text.replaceChildren(...view.chars);
    view.hint.textContent = toRomaji(bubble.item.reading);
    view.danger = false;
    view.el.hidden = false;
    view.width = view.el.offsetWidth;
    view.height = view.el.offsetHeight;
    this.views.set(bubble.id, view);
  }

  private create(): View {
    const fragment = this.els.template.content.cloneNode(true) as DocumentFragment;
    const el = fragment.firstElementChild as HTMLElement;
    this.els.field.append(el);
    const text = el.querySelector<HTMLElement>('[data-text]');
    const hint = el.querySelector<HTMLElement>('[data-hint]');
    if (!text || !hint) throw new Error('Bubble template is missing [data-text] or [data-hint]');
    return { el, text, hint, chars: [], width: 0, height: 0, danger: false, x: 0, y: 0 };
  }

  private update(bubble: Bubble): void {
    const view = this.views.get(bubble.id);
    if (!view) return;
    const filled = filledChars(bubble.item, bubble.kana);
    view.chars.forEach((span, index) => span.classList.toggle('is-filled', index < filled));
    view.el.classList.toggle('is-hinted', this.options.hint && bubble.misses > 0);
  }

  private markTarget(target: Bubble | null): void {
    const id = target?.id ?? null;
    if (id === this.targetId) return;
    if (this.targetId !== null) this.views.get(this.targetId)?.el.classList.remove('is-target');
    if (id !== null) this.views.get(id)?.el.classList.add('is-target');
    this.targetId = id;
  }

  /** Plays the pop or miss animation, then returns the element to the pool. */
  private retire(bubble: Bubble, className: keyof typeof RETIRE_MS): void {
    const view = this.views.get(bubble.id);
    if (!view) return;
    this.views.delete(bubble.id);
    if (this.targetId === bubble.id) this.targetId = null;
    view.el.classList.remove('is-target');
    view.el.classList.add(className);
    setTimeout(() => this.recycle(view), RETIRE_MS[className]);
  }

  private recycle(view: View): void {
    if (view.el.hidden) return;
    view.el.hidden = true;
    view.el.className = 'bubble';
    this.free.push(view);
  }

  /** "+1 さくら cherry blossom" floating where the bubble popped. */
  private note(bubble: Bubble): void {
    const view = this.views.get(bubble.id);
    const note = document.createElement('span');
    note.className = 'pop-note';
    const word = document.createElement('span');
    word.lang = 'ja';
    word.textContent = bubble.item.text;
    note.append('+1 ', word);
    const meaning =
      this.options.locale === 'es' ? (bubble.item.es ?? bubble.item.en) : bubble.item.en;
    if (this.options.meaning && meaning) note.append(` ${meaning}`);
    if (view) note.style.transform = `translate3d(${view.x}px, ${view.y}px, 0)`;
    note.addEventListener('animationend', () => note.remove(), { once: true });
    setTimeout(() => note.remove(), 1500);
    this.els.field.append(note);
  }

  /** The input line: romaji typed for the target, a wrong key, and the kana so far. */
  private input(run: Run, wrongKey: string): void {
    const target = run.target;
    this.els.typed.textContent = target?.typed ?? '';
    this.els.wrong.textContent = wrongKey;
    this.els.kana.textContent = target ? target.item.reading.slice(0, target.kana) : '';
  }
}
