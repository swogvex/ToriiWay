import type { Mode } from './config';
import { accuracy, wpm } from './metrics';
import type { Run } from './run';

/** "02:28": minutes and seconds, both padded (the timer pill). */
export function formatClock(seconds: number, round: (value: number) => number = Math.ceil): string {
  const whole = Math.max(0, round(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

const DAMAGE_FLASH: Keyframe[] = [{ opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0 }];
const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-4px)' },
  { transform: 'translateX(4px)' },
  { transform: 'translateX(-3px)' },
  { transform: 'translateX(2px)' },
  { transform: 'translateX(0)' },
];

export interface HudOptions {
  lives: number;
  mode: Mode;
  /** Seconds to survive in challenge mode. */
  challengeTime: number;
}

/** Writes the run into the HUD; each value is only touched when its text changes. */
export class Hud {
  private readonly shown = new Map<HTMLElement, string>();
  private readonly segments: HTMLElement[];
  private readonly els: Record<
    'wpm' | 'acc' | 'popped' | 'time' | 'lives' | 'progress' | 'progressLabel',
    HTMLElement
  >;
  private readonly lifeBar: HTMLElement;
  private readonly field: HTMLElement;
  private readonly damageLayer: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly options: HudOptions,
  ) {
    const get = (selector: string) => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`Missing ${selector}`);
      return el;
    };
    this.els = {
      wpm: get('[data-wpm]'),
      acc: get('[data-acc]'),
      popped: get('[data-hud-popped]'),
      time: get('[data-time]'),
      lives: get('[data-hud-lives]'),
      progress: get('[data-progress]'),
      progressLabel: get('[data-progress-label]'),
    };
    this.lifeBar = get('[data-life-bar]');
    this.field = get('[data-field]');
    this.damageLayer = get('[data-damage]');
    this.segments = Array.from({ length: options.lives }, () => document.createElement('span'));
    this.lifeBar.replaceChildren(...this.segments);
  }

  update(run: Run): void {
    const { stats, elapsed } = run;
    const challenge = this.options.mode === 'challenge';
    this.set(this.els.wpm, String(Math.round(wpm(stats.correctKeys, elapsed))));
    this.set(this.els.acc, `${Math.round(accuracy(stats.correctKeys, stats.wrongKeys))}%`);
    this.set(this.els.popped, String(stats.popped));
    this.set(
      this.els.time,
      challenge ? formatClock(run.remaining) : formatClock(elapsed, Math.floor),
    );
    this.set(this.els.lives, `${run.lives}/${this.options.lives}`);
    const share = challenge ? Math.min(1, elapsed / this.options.challengeTime) : 0;
    const percent = `${Math.floor(share * 100)}%`;
    if (this.set(this.els.progressLabel, percent)) {
      this.els.progress.style.transform = `scaleX(${share})`;
    }
    this.segments.forEach((segment, index) =>
      segment.classList.toggle('is-lost', index >= run.lives),
    );
  }

  /** Life lost: the field edges flash in the accent colour; field and life bar shake. */
  damage(): void {
    this.damageLayer.animate(DAMAGE_FLASH, { duration: 500, easing: 'ease-out' });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of [this.field, this.lifeBar]) el.animate(SHAKE, { duration: 300 });
  }

  /** Returns true when the text changed. */
  private set(el: HTMLElement, text: string): boolean {
    if (this.shown.get(el) === text) return false;
    this.shown.set(el, text);
    el.textContent = text;
    return true;
  }
}
