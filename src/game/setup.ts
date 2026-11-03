import { challengeKey, type GameSetup, localGameProgress } from '../lib/progress/game';
import { DIFFICULTIES, type Difficulty, GAME_SCRIPTS, type Mode, MODES } from './config';
import { KEYBOARD_LAYOUTS, type KeyboardLayout } from './keyboard';

function pick<T extends string>(value: FormDataEntryValue | null, allowed: readonly T[]): T {
  return allowed.find((item) => item === value) ?? (allowed[0] as T);
}

/** The setup the form currently shows. */
function readForm(form: HTMLFormElement): GameSetup {
  const data = new FormData(form);
  return {
    script: pick(data.get('script'), GAME_SCRIPTS),
    difficulty: pick<Difficulty>(data.get('difficulty'), DIFFICULTIES),
    mode: pick<Mode>(data.get('mode'), MODES),
    layout: pick<KeyboardLayout>(data.get('layout'), KEYBOARD_LAYOUTS),
    hint: data.getAll('hint').includes('1'),
    meaning: data.getAll('meaning').includes('1'),
  };
}

function writeForm(form: HTMLFormElement, setup: GameSetup): void {
  for (const name of ['script', 'difficulty', 'mode', 'layout'] as const) {
    const input = form.querySelector<HTMLInputElement>(
      `input[name="${name}"][value="${setup[name]}"]`,
    );
    if (input) input.checked = true;
  }
  for (const name of ['hint', 'meaning'] as const) {
    const box = form.querySelector<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`);
    if (box) box.checked = setup[name];
  }
}

/**
 * Setup page: restores the last setup, then keeps the best WPM, cleared challenges and
 * Start label in sync with the form. The form itself works without this script.
 */
export function initSetup(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-setup-form]');
  const start = root.querySelector<HTMLButtonElement>('[data-start]');
  const startLabel = root.querySelector<HTMLElement>('[data-start-label]');
  const best = root.querySelector<HTMLElement>('[data-best]');
  const bestLabel = root.querySelector<HTMLElement>('[data-best-label]');
  const soon = root.querySelector<HTMLElement>('[data-soon]');
  if (!form || !start || !startLabel || !best || !bestLabel || !soon) return;

  const labels = JSON.parse(root.dataset['labels'] ?? '{}') as Record<string, string>;
  const available = new Set(JSON.parse(root.dataset['available'] ?? '[]') as string[]);
  const progress = localGameProgress();
  const noBest = bestLabel.textContent;

  const cleared = progress.cleared();
  let count = 0;
  for (const cell of root.querySelectorAll<HTMLElement>('[data-challenge]')) {
    const done = cleared.has(cell.dataset['challenge'] ?? '');
    if (done) count += 1;
    cell.querySelector<HTMLElement>('.grid__cleared')?.toggleAttribute('hidden', !done);
    cell.querySelector<HTMLElement>('.grid__open')?.toggleAttribute('hidden', done);
  }
  const clearedCount = root.querySelector<HTMLElement>('[data-cleared-count]');
  if (clearedCount) clearedCount.textContent = String(count);

  const update = () => {
    const setup = readForm(form);
    const record = progress.best(setup.script, setup.difficulty, setup.mode);
    best.textContent = record ? String(record.wpm) : '[–]';
    bestLabel.textContent = record ? `${record.wpm} WPM` : noBest;
    const name = [labels[setup.script], labels[setup.difficulty]].join(' ');
    startLabel.textContent = (labels['start'] ?? '{setup}').replace('{setup}', name);
    const ready = available.has(challengeKey(setup.script, setup.difficulty));
    start.disabled = !ready;
    soon.hidden = ready;
    progress.saveSetup(setup);
  };

  writeForm(form, progress.setup());
  update();
  form.addEventListener('change', update);
}
