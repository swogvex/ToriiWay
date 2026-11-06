// The 404 omikuji island (07-spec-shell): idle → shaking → open → tied. Framework-free;
// the page renders every element, this only toggles states and fills the paper.

import { drawIndex, type Fortune, isBad, tiedGlyph } from './fortune';

export interface OmikujiData {
  locale: string;
  fortunes: Fortune[];
  /** Card label per path, e.g. { library: 'Library' }. */
  paths: Record<string, string>;
  status: { shaking: string; drawn: string; tied: string };
}

type State = 'idle' | 'shaking' | 'open' | 'tied';

const SHAKE_MS = 900;

/** Fills a template like "You drew {rank} (…)." with the rank kept in a lang="ja" span. */
function statusNodes(template: string, fortune: Fortune, locale: string): Node[] {
  const filled = template
    .replace('{romaji}', fortune.romaji)
    .replace('{meaning}', fortune.meaning.toLocaleLowerCase(locale));
  const [before = '', after = ''] = filled.split('{rank}');
  const rank = document.createElement('span');
  rank.lang = 'ja';
  rank.textContent = fortune.rank;
  return [document.createTextNode(before), rank, document.createTextNode(after)];
}

export function initOmikuji(root: HTMLElement, data: OmikujiData): void {
  const stage = root.querySelector<HTMLElement>('[data-omikuji-stage]');
  const status = root.querySelector<HTMLElement>('[data-omikuji-status]');
  if (!stage || !status || data.fortunes.length === 0) return;
  // Typed as non-null so the hoisted functions below keep the narrowing.
  const board: HTMLElement = stage;
  const live: HTMLElement = status;

  const q = <T extends HTMLElement>(selector: string): T[] => [
    ...root.querySelectorAll<T>(selector),
  ];
  const buttons = q<HTMLButtonElement>('[data-omikuji-action]');
  const button = (action: string) => buttons.find((b) => b.dataset.omikujiAction === action);
  const fields = (name: string) => q(`[data-fortune="${name}"]`);
  const set = (name: string, text: string) => {
    for (const el of fields(name)) el.textContent = text;
  };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let state: State = 'idle';
  let current: number | null = null;
  let timer = 0;

  /** Buttons shown in each state; the first one is the main action. */
  function visible(): string[] {
    if (state === 'open') {
      const bad = isBad(data.fortunes[current ?? 0]?.rank ?? '');
      return [bad ? 'tie-bad' : 'tie-good', 'again'];
    }
    if (state === 'tied') return ['another'];
    return ['shake'];
  }

  function render(): void {
    const focused = document.activeElement;
    const shown = visible();
    for (const b of buttons) b.hidden = !shown.includes(b.dataset.omikujiAction ?? '');
    const shake = button('shake');
    if (shake) shake.setAttribute('aria-disabled', String(state === 'shaking'));
    board.dataset.state = state;
    for (const el of q('[data-omikuji-show]')) {
      el.hidden = !(el.dataset.omikujiShow ?? '').split(' ').includes(state);
    }
    // Focus stays put unless the focused button just disappeared (07-spec-shell).
    if (focused instanceof HTMLButtonElement && buttons.includes(focused) && focused.hidden) {
      button(shown[0] ?? 'shake')?.focus();
    }
  }

  function announce(nodes: Node[] | string): void {
    live.replaceChildren(...(typeof nodes === 'string' ? [nodes] : nodes));
  }

  function markLucky(path: string | null): void {
    for (const card of q('[data-omikuji-path]')) {
      const lucky = card.dataset.omikujiPath === path;
      card.toggleAttribute('data-lucky', lucky);
      const tag = card.querySelector<HTMLElement>('[data-omikuji-lucky]');
      if (tag) tag.hidden = !lucky;
    }
  }

  function open(): void {
    current = drawIndex(data.fortunes.length, current, Math.random);
    const fortune = data.fortunes[current];
    if (!fortune) return;
    set('rank', fortune.rank);
    set('reading', fortune.reading);
    set('meaning', fortune.meaning);
    set('romaji', fortune.romaji);
    set('message', fortune.message);
    set('path', data.paths[fortune.path] ?? fortune.path);
    set('word', fortune.word);
    set('word-kana', fortune.wordKana);
    set('word-meaning', fortune.wordMeaning);
    set('tied', tiedGlyph(fortune.rank));
    markLucky(fortune.path);
    state = 'open';
    render();
    announce(statusNodes(data.status.drawn, fortune, data.locale));
  }

  function shake(): void {
    if (state === 'shaking') return;
    markLucky(null);
    if (reduced()) {
      open();
      return;
    }
    state = 'shaking';
    render();
    announce(data.status.shaking);
    timer = window.setTimeout(open, SHAKE_MS);
  }

  function tie(): void {
    state = 'tied';
    render();
    announce(data.status.tied);
  }

  root.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[data-omikuji-action]',
    );
    if (!target || target.getAttribute('aria-disabled') === 'true') return;
    const action = target.dataset.omikujiAction;
    if (action === 'tie-bad' || action === 'tie-good') tie();
    else shake();
  });

  // Leaving with the back/forward cache must not resume a half-done shake.
  window.addEventListener('pagehide', () => {
    window.clearTimeout(timer);
    if (state !== 'shaking') return;
    state = 'idle';
    render();
    announce('');
  });

  render();
  // The shake button held its place invisibly until now (no layout shift on load).
  for (const b of buttons) b.removeAttribute('data-omikuji-wait');
}
