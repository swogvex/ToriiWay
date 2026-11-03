// One section of the exam (components/jlpt/JlptExam.astro): question map, question,
// choices, flags, keyboard and timer. Answers are saved in the browser on every change.

import type { StoredRun } from '../../progress/jlpt';
import type { Paper, PaperMondai, PaperQuestion } from '../client';
import { LEVELS } from '../levels';
import { crossedAnnouncement, formatClock, parseScript, parseStem } from './format';
import type { Labels } from './labels';
import type { Player } from './voices';

const LOW_TIME = 5 * 60_000;

interface Item {
  question: PaperQuestion;
  mondai: PaperMondai;
  number: number;
}

export interface ExamOptions {
  root: HTMLElement;
  paper: Paper;
  run: StoredRun;
  deadline: number;
  t: Labels;
  /** Server time in milliseconds. */
  now: () => number;
  save: () => void;
  player: Player | null;
  /** Called once, by the player (finalize) or by the timer (auto = true). */
  onFinalize: (auto: boolean) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  if (text !== undefined) node.textContent = text;
  return node;
}

export class Exam {
  private readonly items: Item[];
  private index = 0;
  private readonly cleanup: (() => void)[] = [];
  private lastRemaining = Number.POSITIVE_INFINITY;
  private ended = false;
  private readonly $ = <T extends Element = HTMLElement>(selector: string) =>
    this.options.root.querySelector<T>(selector);

  constructor(private readonly options: ExamOptions) {
    let number = 0;
    this.items = options.paper.mondai.flatMap((mondai) =>
      mondai.questions.map((question) => ({ question, mondai, number: (number += 1) })),
    );
    const firstOpen = this.items.findIndex((item) => !this.answer(item.question.id));
    this.index = Math.max(0, firstOpen);
  }

  start(): void {
    const { root } = this.options;
    root.hidden = false;
    this.renderSteps();
    this.render(false);
    this.listen(this.$('[data-prev]'), 'click', () => this.go(this.index - 1));
    this.listen(this.$('[data-next]'), 'click', () => this.next());
    this.listen(this.$('[data-flag]'), 'click', () => this.toggleFlag());
    this.listen(this.$('[data-finalize]'), 'click', () => this.options.onFinalize(false));
    this.listen(this.$('[data-play]'), 'click', () => void this.play());
    this.listen(this.$('[data-choices]'), 'change', (event) => {
      const input = event.target as HTMLInputElement;
      this.choose(Number(input.value));
    });
    this.listen(document, 'keydown', (event) => this.onKey(event as KeyboardEvent));
    const timer = window.setInterval(() => this.tick(), 250);
    this.cleanup.push(() => window.clearInterval(timer));
    this.tick();
  }

  stop(): void {
    for (const dispose of this.cleanup.splice(0)) dispose();
    this.options.player?.stop();
    this.options.root.hidden = true;
  }

  /** Unanswered questions and milliseconds left, for the finalize dialog. */
  status(): { unanswered: number; left: number } {
    const unanswered = this.items.filter((item) => !this.answer(item.question.id)).length;
    return { unanswered, left: Math.max(0, this.options.deadline - this.options.now()) };
  }

  /** Every answer of this section, for the server. */
  answers(): { id: string; choice: number | null; at: number }[] {
    return this.items.map(({ question }) => {
      const stored = this.options.run.answers[question.id];
      return { id: question.id, choice: stored?.choice ?? null, at: stored?.at ?? 0 };
    });
  }

  private listen(target: EventTarget | null, type: string, handler: (event: Event) => void) {
    if (!target) return;
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  private answer(id: string): number | null {
    return this.options.run.answers[id]?.choice ?? null;
  }

  private choose(choice: number): void {
    const item = this.items[this.index];
    if (!item || choice < 1 || choice > item.question.choices.length) return;
    this.options.run.answers[item.question.id] = { choice, at: this.options.now() };
    this.options.save();
    const input = this.$<HTMLInputElement>(`[data-choices] input[value="${choice}"]`);
    if (input) input.checked = true;
    this.renderMap();
    this.renderSteps();
  }

  private toggleFlag(): void {
    const item = this.items[this.index];
    if (!item) return;
    const flags = new Set(this.options.run.flags);
    if (flags.has(item.question.id)) flags.delete(item.question.id);
    else flags.add(item.question.id);
    this.options.run.flags = [...flags];
    this.options.save();
    this.renderMap();
    this.renderFlag();
  }

  private go(index: number): void {
    if (index < 0 || index >= this.items.length || index === this.index) return;
    this.options.player?.stop();
    this.index = index;
    this.render(true);
  }

  private next(): void {
    if (this.index === this.items.length - 1) this.options.onFinalize(false);
    else this.go(this.index + 1);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) {
      return;
    }
    if (/^[1-4]$/.test(event.key)) this.choose(Number(event.key));
    else if (event.key === 'ArrowRight') this.go(this.index + 1);
    else if (event.key === 'ArrowLeft') this.go(this.index - 1);
    else if (event.key === 'f' || event.key === 'F') this.toggleFlag();
    else return;
    event.preventDefault();
  }

  private tick(): void {
    const left = this.options.deadline - this.options.now();
    const timer = this.$('[data-timer]');
    if (timer) {
      timer.textContent = formatClock(left);
      timer.toggleAttribute('data-low', left < LOW_TIME);
    }
    const minutes = crossedAnnouncement(this.lastRemaining, left);
    const announce = this.$('[data-announce]');
    if (minutes !== null && announce) {
      announce.textContent =
        minutes === 1
          ? this.options.t('jlpt.run.announceLast')
          : this.options.t('jlpt.run.announce', { minutes });
    }
    this.lastRemaining = left;
    if (left <= 0 && !this.ended) {
      this.ended = true;
      this.options.onFinalize(true);
    }
  }

  private renderSteps(): void {
    const { t, paper, run } = this.options;
    const list = this.$('[data-steps]');
    const level = this.$('[data-level]');
    if (level) level.textContent = t(`level.${run.level}`);
    if (!list) return;
    const answered = this.items.filter((item) => this.answer(item.question.id)).length;
    list.replaceChildren(
      ...LEVELS[run.level].sections.map((section, index) => {
        const item = el('li');
        item.append(`${index + 1} ${t(`section.${section.id}`)} `);
        const meta = el('span', { className: 'steps__meta' });
        if (index === paper.section) {
          item.setAttribute('aria-current', 'step');
          meta.textContent = `${answered}/${this.items.length}`;
        } else if (index < paper.section) {
          item.dataset.done = '';
        } else {
          meta.textContent = formatClock(section.minutes * 60_000);
        }
        item.append(meta);
        return item;
      }),
    );
  }

  private renderMap(): void {
    const { t } = this.options;
    const map = this.$('[data-map]');
    if (!map) return;
    const flags = new Set(this.options.run.flags);
    const groups = this.options.paper.mondai.map((mondai) => {
      const group = el('div', { className: 'map__group' });
      group.append(
        el(
          'span',
          { className: 'map__label', lang: 'ja' },
          t('jlpt.run.mondai', { number: mondai.number }),
        ),
      );
      for (const item of this.items.filter((entry) => entry.mondai === mondai)) {
        const position = this.items.indexOf(item);
        const states = [t('jlpt.run.question', { number: item.number })];
        const button = el(
          'button',
          { type: 'button', className: 'map__item' },
          String(item.number),
        );
        if (this.answer(item.question.id)) {
          button.dataset.answered = '';
          states.push(t('jlpt.run.mapState.answered'));
        }
        if (flags.has(item.question.id)) {
          button.dataset.flagged = '';
          states.push(t('jlpt.run.mapState.flagged'));
        }
        if (position === this.index) button.setAttribute('aria-current', 'true');
        button.setAttribute('aria-label', states.join(', '));
        button.addEventListener('click', () => this.go(position));
        group.append(button);
      }
      return group;
    });
    map.replaceChildren(...groups);
  }

  private renderFlag(): void {
    const item = this.items[this.index];
    const pressed = Boolean(item && this.options.run.flags.includes(item.question.id));
    this.$('[data-flag]')?.setAttribute('aria-pressed', String(pressed));
  }

  private render(moveFocus: boolean): void {
    const item = this.items[this.index];
    if (!item) return;
    const { t } = this.options;
    const { question, mondai } = item;
    const lang = document.documentElement.lang === 'es' ? 'es' : 'en';
    const mondaiLabel = this.$('[data-mondai]');
    if (mondaiLabel) mondaiLabel.textContent = t('jlpt.run.mondai', { number: mondai.number });
    const instruction = this.$('[data-instruction]');
    if (instruction)
      instruction.textContent = mondai.instruction?.[lang] ?? mondai.instruction?.en ?? '';

    const passage = this.$('[data-passage]');
    const text = mondai.passages.find((entry) => entry.id === question.passage)?.text;
    if (passage) {
      passage.hidden = !text;
      passage.textContent = text ?? '';
    }
    this.renderListen();

    const number = this.$('[data-number]');
    if (number) number.textContent = String(item.number);
    const stem = this.$('[data-stem-text]');
    stem?.replaceChildren(
      ...parseStem(question.stem).map((part) =>
        part.mark === 'underline'
          ? el('u', {}, part.text)
          : part.mark === 'star'
            ? el('span', { className: 'question__star' }, part.text)
            : document.createTextNode(part.text),
      ),
    );

    const chosen = this.answer(question.id);
    this.$('[data-choices]')?.replaceChildren(
      ...question.choices.map((choice, index) => {
        const label = el('label', { className: 'choice' });
        const input = el('input', { type: 'radio', name: 'jlpt-answer', value: String(index + 1) });
        input.checked = chosen === index + 1;
        label.append(input, el('span', { className: 'choice__number' }, String(index + 1)));
        label.append(
          mondai.spokenChoices
            ? el('span', { className: 'choice__text' }, t('jlpt.run.spoken', { number: index + 1 }))
            : el('span', { className: 'choice__text', lang: 'ja' }, choice),
        );
        return label;
      }),
    );
    // The report dialog reads which question is on screen.
    this.options.root.dataset.question = question.id;
    const previous = this.$<HTMLButtonElement>('[data-prev]');
    if (previous) previous.disabled = this.index === 0;
    this.renderFlag();
    this.renderMap();
    if (moveFocus) this.$('[data-stem]')?.focus();
  }

  private playsLeft(id: string): number {
    const used = this.options.run.plays?.[id] ?? 0;
    return Math.max(0, this.options.paper.replays - used);
  }

  private renderListen(): void {
    const item = this.items[this.index];
    const box = this.$('[data-listen]');
    if (!item || !box) return;
    box.hidden = !item.question.tts;
    if (!item.question.tts) return;
    const left = this.playsLeft(item.question.id);
    const button = this.$<HTMLButtonElement>('[data-play]');
    if (button) button.disabled = left === 0 || !this.options.player;
    const note = this.$('[data-plays-left]');
    if (note) note.textContent = this.options.t('jlpt.run.playsLeft', { count: left });
    const warning = this.$('[data-no-voice]');
    if (warning) warning.hidden = Boolean(this.options.player);
  }

  private async play(): Promise<void> {
    const item = this.items[this.index];
    const { player, run, save, t } = this.options;
    if (!item?.question.tts || !player || this.playsLeft(item.question.id) === 0) return;
    run.plays = { ...run.plays, [item.question.id]: (run.plays?.[item.question.id] ?? 0) + 1 };
    save();
    const button = this.$<HTMLButtonElement>('[data-play]');
    const label = this.$('[data-play-label]');
    if (button) button.disabled = true;
    if (label) label.textContent = t('jlpt.run.playing');
    await player.play(parseScript(item.question.tts.script));
    if (label) label.textContent = t('jlpt.run.play');
    if (this.items[this.index] === item) this.renderListen();
  }
}
