import {
  CHART,
  type ChartGeometry,
  chartGeometry,
  nearestPoint,
  renderChart,
  showDot,
} from './chart';
import { buildClaim, canSubmit } from './claim';
import type { GameScript } from './config';
import { romajiHint } from './romaji';
import type { Run, RunStatus } from './run';
import type { PlaySettings } from './settings';
import {
  canCopyImage,
  type CardData,
  type CardFonts,
  type CardPalette,
  cardBlob,
  drawCard,
  loadCardFonts,
} from './share';
import { SubmitPanel } from './submit';
import {
  errorSeconds,
  type RunSummary,
  slowestKana,
  summarize,
  wordList,
  wpmSeries,
} from './summary';

type Ending = Exclude<RunStatus, 'playing'>;

/** Words shown before "Show all" when the words card sits under the chart. */
const WORDS_SHOWN = 12;
/** Same breakpoint as PlayResults.astro: chart and words side by side. */
const SIDE_BY_SIDE = '(width >= 48rem)';
const GLYPHS: Record<GameScript, string> = { hiragana: 'あ', katakana: 'ア', kanji: '字' };
const KATAKANA = /[ァ-ヺ]/u;

/** "2:30". */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Fills "{name}" placeholders. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

interface LearnLinks {
  /** "/learn/kana/{kana}" in the page's locale. */
  kana: string;
  /** Kana with their own Learn page. */
  chars: string;
  hiragana: string;
  katakana: string;
}

export interface ResultContext {
  run: Run;
  settings: Pick<PlaySettings, 'script' | 'difficulty' | 'mode'>;
  status: Ending;
  newBest: boolean;
  /** "Hiragana · Normal · Challenge". */
  modeLabel: string;
  /** "Hiragana Normal", for the card. */
  setupLabel: string;
  date: string;
  /** The game option or the system setting: such runs are not ranked. */
  reducedMotion: boolean;
  /** Server run for the leaderboard; resolves to null when it could not be created. */
  runId: Promise<string | null>;
}

/**
 * The results screen (artboard 07): title, stats, WPM chart, words, slowest kana and
 * the share card. The markup is static in PlayResults.astro; this fills it per run.
 */
export class Results {
  private readonly labels: Record<string, string>;
  private readonly learn: LearnLinks;
  private readonly svg: SVGSVGElement;
  private readonly tip: HTMLElement;
  private dot: SVGCircleElement | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly image: HTMLElement;
  private readonly name: HTMLInputElement;
  private readonly shareStatus: HTMLElement;
  private readonly logo: HTMLImageElement;
  private geometry: ChartGeometry | null = null;
  private series: number[] = [];
  private card: Omit<CardData, 'kicker'> & { kicker: string[] } = {
    title: '',
    date: '',
    kicker: [],
    wpm: 0,
    stats: [],
    wpmLabel: '',
    glyph: 'あ',
  };
  private fontsReady: Promise<void> | null = null;
  private readonly submit: SubmitPanel;

  constructor(private readonly root: HTMLElement) {
    this.labels = JSON.parse(root.dataset['labels'] ?? '{}') as Record<string, string>;
    this.learn = JSON.parse(root.dataset['learn'] ?? '{}') as LearnLinks;
    this.svg = required(root, '[data-chart]');
    this.tip = required(root, '[data-chart-tip]');
    this.canvas = required(root, '[data-share-canvas]');
    this.image = required(root, '[data-share-image]');
    this.name = required(root, '[data-share-name]');
    this.shareStatus = required(root, '[data-share-status]');
    this.submit = new SubmitPanel(required(root, '[data-submit]'));
    this.logo = new Image();
    this.logo.src = root.dataset['logo'] ?? '';

    const copy = required<HTMLButtonElement>(root, '[data-share-copy]');
    copy.hidden = !canCopyImage();
    copy.addEventListener('click', () => void this.copy());
    required(root, '[data-share-download]').addEventListener('click', () => void this.download());
    this.name.addEventListener('input', () => this.drawCard());
    this.logo.addEventListener('load', () => this.drawCard());

    const toggle = required<HTMLButtonElement>(root, '[data-words-toggle]');
    toggle.addEventListener('click', () => this.showAllWords(toggle));
    // The list's height comes from the chart beside it; refit when it changes.
    new ResizeObserver(() => this.fitWords()).observe(required(root, '[data-words]'));

    this.svg.addEventListener('pointermove', (event) => this.hover(event));
    this.svg.addEventListener('pointerleave', () => this.hideTip());
  }

  private label(key: string, params: Record<string, string | number> = {}): string {
    return fill(this.labels[key] ?? key, params);
  }

  show(context: ResultContext): void {
    const { run, status, newBest } = context;
    const summary = summarize(run);
    const title = this.label(`title.${status}`);
    required(this.root, '[data-results-mode]').textContent = context.modeLabel;
    required(this.root, '[data-results-title]').textContent = title;
    required<HTMLElement>(this.root, '[data-new-best]').hidden = !newBest;
    this.fillStats(summary);
    this.fillChart(run, summary);
    this.fillWords(run, summary);
    this.fillSlowest(run);
    this.prepareCard(context, summary);
    this.offerSubmission(context);
    this.shareStatus.textContent = '';
    // Announced once: the focus moves to "Play again" for a quick restart.
    required(this.root, '[data-results-announce]').textContent = this.label('announce', {
      title,
      wpm: summary.wpm,
      accuracy: summary.accuracy,
    });
  }

  private fillStats(summary: RunSummary): void {
    const values: Record<string, string> = {
      wpm: String(summary.wpm),
      accuracy: `${summary.accuracy}%`,
      consistency: `${summary.consistency}%`,
      time: formatTime(summary.time),
      popped: String(summary.popped),
      missed: String(summary.missed),
      kpm: String(summary.kpm),
      raw: String(summary.raw),
    };
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-stat]')) {
      el.textContent = values[el.dataset['stat'] ?? ''] ?? '';
    }
    this.root
      .querySelector('.results__stat--missed')
      ?.classList.toggle('is-bad', summary.missed > 0);
  }

  private fillChart(run: Run, summary: RunSummary): void {
    const errors = errorSeconds(run.samples);
    this.series = wpmSeries(run.samples).map(Math.round);
    this.geometry = chartGeometry(
      this.series,
      run.samples.map((sample) => sample.seconds),
      errors,
    );
    this.dot = renderChart(this.svg, this.geometry);
    this.hideTip();
    required(this.root, '[data-chart-end]').textContent = formatTime(summary.time);

    const peak = Math.max(0, ...this.series);
    const peakAt = this.series.indexOf(peak) + 1;
    const desc =
      this.series.length === 0
        ? this.label('chart.empty')
        : this.label('chart.desc', {
            start: this.series[0] ?? 0,
            end: this.series.at(-1) ?? 0,
            peak,
            peakAt: formatTime(peakAt),
            errors: errors.length,
          });
    required(this.root, '[data-chart-desc]').textContent = desc;
  }

  private hover(event: PointerEvent): void {
    const geometry = this.geometry;
    const dot = this.dot;
    if (!geometry || !dot || geometry.points.length === 0) return;
    const box = this.svg.getBoundingClientRect();
    const index = nearestPoint(geometry, (event.clientX - box.left) / box.width);
    const point = geometry.points[index];
    if (!point) return;
    showDot(dot, point);
    this.tip.textContent = this.label('chart.tip', {
      time: formatTime(index + 1),
      wpm: this.series[index] ?? 0,
    });
    this.tip.style.insetInlineStart = `${(point.x / CHART.width) * 100}%`;
    this.tip.hidden = false;
  }

  private hideTip(): void {
    this.tip.hidden = true;
    this.dot?.setAttribute('visibility', 'hidden');
  }

  private fillWords(run: Run, summary: RunSummary): void {
    const list = required(this.root, '[data-words]');
    const template = required<HTMLTemplateElement>(this.root, '[data-word-template]');
    const locale = document.documentElement.lang === 'es' ? 'es' : 'en';
    const words = wordList(run.log);
    list.replaceChildren(
      ...words.map((word) => {
        const li = (template.content.firstElementChild as HTMLElement).cloneNode(
          true,
        ) as HTMLElement;
        const { item } = word;
        required(li, '[data-word-text]').textContent = item.text;
        required(li, '[data-word-romaji]').textContent = romajiHint(item.reading);
        const meaning = item[locale] ?? item.en ?? '';
        required(li, '[data-word-meaning]').textContent = meaning;
        const count = word.popped + word.missed;
        required(li, '[data-word-count]').textContent = count > 1 ? `×${count}` : '';
        required<HTMLElement>(li, '[data-word-missed]').hidden = word.missed === 0;
        li.classList.toggle('is-missed', word.missed > 0);
        return li;
      }),
    );
    required(this.root, '[data-words-count]').textContent = this.label('words.count', {
      count: summary.popped,
    });
    required<HTMLElement>(this.root, '[data-words-empty]').hidden = words.length > 0;
    this.fitWords();
  }

  /**
   * The words card is as tall as the chart beside it and shows the words that fit;
   * stacked under the chart (narrow screens) it shows the first 12. "Show all" opens them
   * all in a dialog.
   */
  private fitWords(): void {
    const list = required<HTMLElement>(this.root, '[data-words]');
    const toggle = required<HTMLButtonElement>(this.root, '[data-words-toggle]');
    const items = [...list.children] as HTMLElement[];
    for (const item of items) item.hidden = false;
    let shown = items.length;
    if (matchMedia(SIDE_BY_SIDE).matches) {
      const overflow = items.findIndex(
        (item) => item.offsetTop + item.offsetHeight > list.clientHeight,
      );
      if (overflow !== -1) shown = overflow;
    } else {
      shown = Math.min(WORDS_SHOWN, items.length);
    }
    items.forEach((item, index) => (item.hidden = index >= shown));
    toggle.hidden = shown >= items.length;
    toggle.textContent = this.label('words.all', { count: items.length });
  }

  /** Every word, in a dialog that scrolls inside; Esc or the close button closes it. */
  private showAllWords(opener: HTMLButtonElement): void {
    const dialog = document.getElementById('words-all');
    if (!(dialog instanceof HTMLDialogElement)) return;
    const all = required<HTMLElement>(dialog, '[data-words-all]');
    const words = [...required(this.root, '[data-words]').children].map((item) => {
      const copy = item.cloneNode(true) as HTMLElement;
      copy.hidden = false;
      return copy;
    });
    all.replaceChildren(...words);
    all.scrollTop = 0;
    const title = document.getElementById('words-all-title');
    if (title) {
      title.textContent = `${this.label('words.title')} · ${required(this.root, '[data-words-count]').textContent ?? ''}`;
    }
    dialog.showModal();
    dialog.addEventListener('close', () => opener.focus(), { once: true });
  }

  private fillSlowest(run: Run): void {
    const kana = slowestKana(run.kanaTimes);
    const wrap = required<HTMLElement>(this.root, '[data-slowest]');
    wrap.hidden = kana.length === 0;
    const pages = new Set(this.learn.chars ?? '');
    const links = kana.map((unit) => {
      const a = document.createElement('a');
      a.lang = 'ja';
      a.textContent = unit;
      const own = pages.has(unit) || [...unit].every((char) => pages.has(char));
      a.href = own
        ? fill(this.learn.kana, { kana: unit })
        : KATAKANA.test(unit)
          ? this.learn.katakana
          : this.learn.hiragana;
      return a;
    });
    const list = required(this.root, '[data-slowest-list]');
    list.replaceChildren(
      ...links.flatMap((link, index) =>
        index === 0 ? [link] : [document.createTextNode(', '), link],
      ),
    );
  }

  private offerSubmission(context: ResultContext): void {
    const { run, settings, status, reducedMotion } = context;
    const offered = status === 'cleared' || status === 'failed';
    const state = !offered ? 'hidden' : canSubmit(status, reducedMotion) ? 'offer' : 'reduced';
    const claim = state === 'offer' && offered ? buildClaim(run, settings, status, '') : null;
    this.submit.show({
      state,
      claim,
      runId: context.runId,
      comboLabel: context.modeLabel,
      onRanked: (rank, name) => {
        if (!this.name.value.trim()) this.name.value = name;
        if (rank === null) delete this.card.chip;
        else this.card.chip = this.label('card.leaderboard', { rank });
        this.drawCard();
      },
    });
  }

  private prepareCard(context: ResultContext, summary: RunSummary): void {
    this.card = {
      title: this.label('card.title'),
      date: context.date,
      kicker: [context.setupLabel, this.label(`card.status.${context.status}`)],
      wpm: summary.wpm,
      stats: [
        [this.label('card.acc'), `${summary.accuracy}%`],
        [this.label('card.cons'), `${summary.consistency}%`],
        [this.label('card.popped'), String(summary.popped)],
        [this.label('card.time'), formatTime(summary.time)],
      ],
      wpmLabel: this.label('card.wpm'),
      glyph: GLYPHS[context.settings.script],
    };
    const fonts = this.fonts();
    this.fontsReady ??= loadCardFonts(fonts, this.card.glyph);
    void this.fontsReady.then(() => this.drawCard());
    this.drawCard();
  }

  private fonts(): CardFonts {
    const style = getComputedStyle(this.root);
    return {
      ui: style.getPropertyValue('--font-ui').trim() || 'sans-serif',
      mono: style.getPropertyValue('--font-mono').trim() || 'monospace',
      ja: style.getPropertyValue('--font-display-ja').trim() || 'sans-serif',
    };
  }

  /** Card colours come from the tokens, resolved in the dark scheme by the palette swatches. */
  private palette(): CardPalette {
    const color = (name: string) =>
      getComputedStyle(required(this.root, `[data-card-color="${name}"]`)).color;
    return {
      bg: color('bg'),
      ink: color('ink'),
      muted: color('muted'),
      line: color('line'),
      info: color('info'),
    };
  }

  private drawCard(): void {
    const name = this.name.value.trim();
    const kicker = (name ? [name, ...this.card.kicker] : this.card.kicker).join(' · ');
    const data: CardData = { ...this.card, kicker };
    drawCard(this.canvas, data, this.palette(), this.fonts(), this.logo);
    this.image.setAttribute(
      'aria-label',
      this.label('card.alt', {
        kicker,
        wpm: data.wpm,
        stats: data.stats.map(([label, value]) => `${label} ${value}`).join(', '),
      }),
    );
  }

  private async download(): Promise<void> {
    const blob = await cardBlob(this.canvas);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kana-rush-${this.card.date}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async copy(): Promise<void> {
    try {
      // Safari needs the promise inside ClipboardItem, created in the click handler.
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': cardBlob(this.canvas).then((blob) => {
            if (!blob) throw new Error('No image');
            return blob;
          }),
        }),
      ]);
      this.shareStatus.textContent = this.label('share.copied');
    } catch {
      this.shareStatus.textContent = this.label('share.copyFailed');
    }
  }
}
