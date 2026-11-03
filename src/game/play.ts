import {
  DIFFICULTIES,
  DIFFICULTY,
  type Difficulty,
  GAME_SCRIPTS,
  type GameScript,
  type Mode,
  MODES,
  REDUCED_MOTION_SPEED,
} from './config';
import { Field } from './field';
import { type GameItem, Run, type RunStatus } from './run';
import { type Random, seededRandom } from './spawner';

export interface PlaySettings {
  script: GameScript;
  difficulty: Difficulty;
  mode: Mode;
  /** Fixed seed for reproducible runs (tests); random otherwise. */
  seed: number | null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

/** Settings from `?script=hiragana&difficulty=normal&mode=challenge&seed=1`. */
export function readSettings(search: string): PlaySettings {
  const params = new URLSearchParams(search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return {
    script: oneOf(params.get('script'), GAME_SCRIPTS, 'hiragana'),
    difficulty: oneOf(params.get('difficulty'), DIFFICULTIES, 'normal'),
    mode: oneOf(params.get('mode'), MODES, 'challenge'),
    seed: Number.isFinite(seed) ? seed : null,
  };
}

export function formatTime(seconds: number): string {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

/** Shows exactly one overlay panel (`[data-panel=name]`), or none. */
function showPanel(root: HTMLElement, name: string | null): void {
  const overlay = required<HTMLElement>(root, '[data-overlay]');
  overlay.hidden = name === null;
  for (const panel of overlay.querySelectorAll<HTMLElement>('[data-panel]')) {
    panel.hidden = panel.dataset['panel'] !== name;
  }
}

async function loadItems(settings: PlaySettings): Promise<GameItem[]> {
  const response = await fetch(`/data/game/${settings.script}/${settings.difficulty}.json`);
  if (!response.ok) return [];
  return (await response.json()) as GameItem[];
}

export async function initPlay(root: HTMLElement): Promise<void> {
  const settings = readSettings(location.search);
  const config = DIFFICULTY[settings.difficulty];
  const input = required<HTMLInputElement>(root, '[data-input]');
  const focusNote = required<HTMLElement>(root, '[data-focus-note]');
  const hud = {
    lives: required<HTMLElement>(root, '[data-lives]'),
    time: required<HTMLElement>(root, '[data-time]'),
    popped: required<HTMLElement>(root, '[data-popped]'),
  };
  const field = new Field(
    {
      field: required(root, '[data-field]'),
      template: required(root, '[data-bubble-template]'),
      typed: required(root, '[data-typed]'),
      wrong: required(root, '[data-wrong]'),
      kana: required(root, '[data-typed-kana]'),
    },
    { locale: document.documentElement.lang, hint: true, meaning: true },
  );
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const items = await loadItems(settings).catch(() => []);
  if (items.length === 0) {
    showPanel(root, 'unavailable');
    return;
  }

  let run: Run | null = null;
  let frame = 0;
  let last = 0;
  let shownTime = '';

  const setStatus = (status: RunStatus | 'ready') => (root.dataset['status'] = status);

  const updateHud = (current: Run) => {
    hud.lives.textContent = `${current.lives}/${config.lives}`;
    hud.popped.textContent = String(current.stats.popped);
    root.dataset['lives'] = String(current.lives);
    root.dataset['popped'] = String(current.stats.popped);
    root.dataset['missed'] = String(current.stats.missed);
    const time = formatTime(settings.mode === 'challenge' ? current.remaining : current.elapsed);
    if (time !== shownTime) hud.time.textContent = shownTime = time;
  };

  const flush = (current: Run) => {
    const events = current.drain();
    if (events.length === 0) return;
    field.handle(events, current);
    updateHud(current);
    const end = events.find((event) => event.type === 'end');
    if (end) finish(end.status);
  };

  const tick = (now: number) => {
    if (!run) return;
    run.step((now - last) / 1000);
    last = now;
    flush(run);
    field.render(run);
    updateHud(run);
    if (run.status === 'playing') frame = requestAnimationFrame(tick);
  };

  const finish = (status: Exclude<RunStatus, 'playing'>) => {
    cancelAnimationFrame(frame);
    setStatus(status);
    showPanel(root, status);
    focusNote.hidden = true;
    root.querySelector<HTMLElement>(`[data-panel="${status}"] button`)?.focus();
  };

  const start = () => {
    const random: Random =
      settings.seed === null ? Math.random.bind(Math) : seededRandom(settings.seed);
    field.clear();
    run = new Run({
      config,
      mode: settings.mode,
      items,
      random,
      speed: reducedMotion.matches ? REDUCED_MOTION_SPEED : 1,
    });
    shownTime = '';
    updateHud(run);
    setStatus('playing');
    showPanel(root, null);
    input.focus();
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };

  input.addEventListener('keydown', (event) => {
    if (!run || run.status !== 'playing') return;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Backspace') run.backspace();
    else if (event.key.length === 1) run.type(event.key);
    else return;
    event.preventDefault();
    flush(run);
  });

  input.addEventListener('blur', () => {
    focusNote.hidden = run?.status !== 'playing';
  });
  input.addEventListener('focus', () => (focusNote.hidden = true));
  // Clicking anywhere in the game puts the caret back in the hidden input.
  root.addEventListener('pointerup', () => {
    if (run?.status === 'playing') input.focus();
  });

  for (const button of root.querySelectorAll('[data-start]')) {
    button.addEventListener('click', start);
  }
  setStatus('ready');
  showPanel(root, 'start');
}
