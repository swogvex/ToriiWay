import { splitJapanese } from '../ja';
import type { KanaProgress } from '../progress/kana';
import { loadKanaData } from './client-data';
import { syncLearned } from './learned';
import { drawStrokes, playStrokes } from './strokes';

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

function japaneseNodes(text: string): Node[] {
  return splitJapanese(text).map((segment) => {
    if (!segment.ja) return document.createTextNode(segment.text);
    const span = document.createElement('span');
    span.lang = 'ja';
    span.textContent = segment.text;
    return span;
  });
}

/** Grid position of a cell button: [row, column] inside its table. */
function position(button: HTMLElement): [number, number] {
  const cell = button.closest('td');
  const row = cell?.parentElement as HTMLTableRowElement | null;
  return [row?.sectionRowIndex ?? 0, (cell?.cellIndex ?? 1) - 1];
}

/**
 * The next kana button from `button` in a direction, skipping empty cells; undefined at
 * the edge of the table.
 */
function neighbour(table: HTMLElement, button: HTMLElement, [dRow, dCol]: [number, number]) {
  const buttons = [...table.querySelectorAll<HTMLElement>('[data-kana]')];
  const grid = new Map(buttons.map((item) => [position(item).join(','), item]));
  let [row, col] = position(button);
  for (let step = 0; step < 20; step++) {
    row += dRow;
    col += dCol;
    if (row < 0 || col < 0 || col > 4 || row > 20) return undefined;
    const found = grid.get(`${row},${col}`);
    if (found) return found;
  }
  return undefined;
}

/**
 * Kana chart behaviour (components/learn/KanaView.astro): choosing a cell shows it in the
 * detail panel and replays its strokes; arrow keys move between cells (one tab stop per
 * table, the roving tabindex pattern), Home and End jump to the ends of a row. The
 * panel's Listen, "Mark as learned" and "Test this row" follow the chosen kana.
 */
export function initKanaExplorer(root: HTMLElement, progress: KanaProgress): void {
  const panel = root.querySelector<HTMLElement>('[data-kana-panel]');
  const svg = panel?.querySelector<SVGSVGElement>('[data-strokes]');
  if (!root.dataset.kanaSrc || !panel || !svg) return;

  // Fetched once, right after load (so practice needs no network later); a click that
  // comes before it arrives waits for it.
  const kana = loadKanaData(root.dataset.kanaSrc).then(
    (items) => new Map(items.map((item) => [item.char, item])),
  );
  const field = (name: string) => panel.querySelector<HTMLElement>(`[data-panel-${name}]`);
  const label = panel.dataset.strokeLabel ?? '{char}';
  const moreLabel = panel.dataset.moreLabel ?? '{char}';
  const buttons = () => [...root.querySelectorAll<HTMLElement>('[data-kana]')];

  // One tab stop per table: the pressed cell, or the first one.
  for (const table of root.querySelectorAll<HTMLElement>('[data-kana-chart]')) {
    const cells = [...table.querySelectorAll<HTMLElement>('[data-kana]')];
    const current = cells.find((cell) => cell.ariaPressed === 'true') ?? cells[0];
    for (const cell of cells) cell.tabIndex = cell === current ? 0 : -1;
  }

  async function show(char: string): Promise<void> {
    for (const button of buttons()) {
      const pressed = button.dataset.kana === char;
      button.ariaPressed = String(pressed);
      if (pressed) {
        const table = button.closest('[data-kana-chart]');
        for (const cell of table?.querySelectorAll<HTMLElement>('[data-kana]') ?? []) {
          cell.tabIndex = cell === button ? 0 : -1;
        }
      }
    }

    const item = (await kana).get(char);
    if (!item || !svg) return;
    drawStrokes(svg, item.glyph, label.replace('{char}', item.char));
    playStrokes(svg);
    field('label')?.replaceChildren(item.label);
    field('char')?.replaceChildren(item.char);
    field('romaji')?.replaceChildren(item.romaji);
    field('examples')?.replaceChildren(
      ...item.examples.map((example) => {
        const li = document.createElement('li');
        const word = document.createElement('span');
        word.lang = 'ja';
        word.textContent = example.word;
        li.append(word, ` ${example.reading} — ${example.meaning}`);
        return li;
      }),
    );
    const mnemonic = field('mnemonic');
    if (mnemonic) {
      mnemonic.hidden = !item.mnemonic;
      mnemonic.replaceChildren(...japaneseNodes(item.mnemonic ?? ''));
    }
    const more = field('more');
    more?.replaceChildren(...japaneseNodes(moreLabel.replace('{char}', item.char)));
    more?.closest('a')?.setAttribute('href', item.href);
    field('status')?.replaceChildren(`${item.romaji}. ${item.label}`);

    const listen = field('listen');
    if (listen) {
      listen.dataset.listen = item.char;
      if (item.audio) listen.dataset.listenAudio = item.audio;
      else delete listen.dataset.listenAudio;
    }
    const learn = field('learn');
    if (learn) learn.dataset.learnToggle = item.char;
    const test = field('test');
    if (test) test.dataset.practiceRow = item.row;
    syncLearned(root, progress);
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-kana]');
    if (button?.dataset.kana) {
      void show(button.dataset.kana);
      // Narrow screens put the details under the chart: bring them into view on a tap.
      if (matchMedia('(width < 64rem)').matches) {
        const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
        svg?.closest('.kana-panel')?.scrollIntoView({
          block: 'nearest',
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    }
    if ((event.target as Element).closest('[data-panel-replay]')) playStrokes(svg);
  });

  root.addEventListener('keydown', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-kana]');
    const table = button?.closest<HTMLElement>('[data-kana-chart]');
    if (!button || !table) return;
    let target: HTMLElement | undefined;
    const arrow = ARROWS[event.key];
    if (arrow) {
      target = neighbour(table, button, arrow);
    } else if (event.key === 'Home' || event.key === 'End') {
      const row = [...(button.closest('tr')?.querySelectorAll<HTMLElement>('[data-kana]') ?? [])];
      target = event.key === 'Home' ? row[0] : row.at(-1);
    } else {
      return;
    }
    event.preventDefault();
    if (!target) return;
    for (const cell of table.querySelectorAll<HTMLElement>('[data-kana]')) {
      cell.tabIndex = cell === target ? 0 : -1;
    }
    target.focus();
  });
}
