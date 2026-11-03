// Break between sections (components/jlpt/JlptBreak.astro). The server decides when the
// break may end (mandatory minute) and when the next section starts on its own.

import type { PublicRunState } from '../run';
import { LEVELS } from '../levels';
import { formatClock } from './format';
import type { Labels } from './labels';

export type Rating = 'easy' | 'right' | 'hard';

export interface BreakOptions {
  root: HTMLElement;
  state: PublicRunState;
  t: Labels;
  now: () => number;
  onContinue: () => void;
  /** The break ran out: the server has started the next section. */
  onTimeout: () => void;
  onFeedback: (rating: Rating) => Promise<void>;
}

export class Pause {
  private timer = 0;
  private readonly cleanup: (() => void)[] = [];
  private readonly $ = <T extends Element = HTMLElement>(selector: string) =>
    this.options.root.querySelector<T>(selector);

  constructor(private readonly options: BreakOptions) {}

  start(): void {
    const { root, state, t } = this.options;
    const sections = LEVELS[state.level].sections;
    const done = sections[state.section - 1];
    const next = sections[state.section];
    if (!done || !next) return;
    const set = (selector: string, text: string) => {
      const node = this.$(selector);
      if (node) node.textContent = text;
    };
    set(
      '[data-break-kicker]',
      t('jlpt.break.kicker', {
        level: t(`level.${state.level}`),
        number: state.section,
        total: sections.length - 1,
      }),
    );
    set('[data-break-title]', t('jlpt.break.title', { section: t(`section.${done.id}`) }));
    set('[data-break-text]', t('jlpt.break.text', { next: t(`section.${next.id}`) }));
    this.renderSummary();
    this.resetFeedback();

    const button = this.$<HTMLButtonElement>('[data-continue]');
    const onContinue = () => {
      if (button) button.disabled = true;
      this.options.onContinue();
    };
    button?.addEventListener('click', onContinue);
    this.cleanup.push(() => button?.removeEventListener('click', onContinue));

    const feel = this.$('[data-feel]');
    const onFeel = (event: Event) => {
      const option = (event.target as Element).closest<HTMLButtonElement>('[data-rating]');
      if (option) void this.rate(option);
    };
    feel?.addEventListener('click', onFeel);
    this.cleanup.push(() => feel?.removeEventListener('click', onFeel));

    root.hidden = false;
    this.$('[data-break-title]')?.focus();
    this.timer = window.setInterval(() => this.tick(), 250);
    this.tick();
  }

  stop(): void {
    window.clearInterval(this.timer);
    for (const dispose of this.cleanup.splice(0)) dispose();
    this.options.root.hidden = true;
  }

  private tick(): void {
    const { state, t, now } = this.options;
    const minEnds = state.breakMinEndsAt ?? 0;
    const ends = state.breakEndsAt ?? 0;
    const current = now();
    const mandatory = minEnds - current;
    const rest = ends - current;
    const minute = 60_000;
    const ring = this.$<SVGElement>('[data-ring]');
    const time = this.$('[data-ring-time]');
    const of = this.$('[data-ring-of]');
    const button = this.$<HTMLButtonElement>('[data-continue]');
    const label = this.$('[data-continue-label]');
    const restText = this.$('[data-rest]');

    if (mandatory > 0) {
      ring?.style.setProperty('--progress', String(1 - mandatory / minute));
      if (time) time.textContent = formatClock(mandatory);
      if (of) of.textContent = t('jlpt.break.of', { time: formatClock(minute) });
      if (label) label.textContent = t('jlpt.break.continueIn', { time: formatClock(mandatory) });
      if (button && !button.dataset.clicked) button.disabled = true;
    } else {
      ring?.style.setProperty('--progress', '1');
      if (time) time.textContent = formatClock(Math.max(0, rest));
      if (of) of.textContent = t('jlpt.break.of', { time: formatClock(ends - minEnds + minute) });
      if (label) label.textContent = t('jlpt.break.continue');
      if (button && button.disabled && !button.dataset.clicked) button.disabled = false;
    }
    if (restText) restText.textContent = t('jlpt.break.rest', { time: formatClock(rest) });
    if (rest <= 0) {
      this.stop();
      this.options.onTimeout();
    }
  }

  private renderSummary(): void {
    const { state, t } = this.options;
    const list = this.$('[data-summary]');
    if (!list) return;
    list.replaceChildren(
      ...LEVELS[state.level].sections.map((section, index) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        const meta = document.createElement('span');
        meta.className = 'summary__meta';
        const result = state.results.find((entry) => entry.section === index);
        name.textContent = `${result ? '✓ ' : ''}${index + 1} · ${t(`section.${section.id}`)}`;
        if (result) {
          item.dataset.done = '';
          meta.textContent = t('jlpt.break.done', {
            answered: result.answered,
            total: result.total,
            time: formatClock(result.seconds * 1000),
          });
        } else {
          const time = formatClock(section.minutes * 60_000);
          if (index === state.section) {
            item.dataset.next = '';
            meta.textContent = `${t('jlpt.break.next')} · ${time}`;
          } else {
            meta.textContent = time;
          }
        }
        item.append(name, meta);
        return item;
      }),
    );
  }

  private resetFeedback(): void {
    for (const option of this.options.root.querySelectorAll<HTMLButtonElement>('[data-rating]')) {
      option.setAttribute('aria-pressed', 'false');
      option.disabled = false;
    }
    const thanks = this.$('[data-feel-thanks]');
    if (thanks) thanks.textContent = '';
  }

  private async rate(option: HTMLButtonElement): Promise<void> {
    const rating = option.dataset.rating as Rating;
    for (const other of this.options.root.querySelectorAll<HTMLButtonElement>('[data-rating]')) {
      other.setAttribute('aria-pressed', String(other === option));
    }
    try {
      await this.options.onFeedback(rating);
      const thanks = this.$('[data-feel-thanks]');
      if (thanks) thanks.textContent = this.options.t('jlpt.break.thanks');
    } catch {
      // Feedback is optional: a failed request changes nothing for the run.
    }
  }
}
