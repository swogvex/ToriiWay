import { localGameProgress } from '../lib/progress/game';
import { initBlocked } from './blocked';
import { type Difficulty, DIFFICULTY, REDUCED_MOTION_SPEED } from './config';
import { Field } from './field';
import { Hud } from './hud';
import { VirtualKeyboard } from './keyboard';
import { loadItems, loadLongerPools } from './load';
import { runResult } from './result';
import { Results } from './results';
import { type GameItem, Run, type RunEvent, type RunStatus } from './run';
import { modeLabel, readSettings } from './settings';
import { GameSound } from './sound';
import { type Random, seededRandom } from './spawner';

type State = 'loading' | 'blocked' | 'countdown' | 'playing' | 'paused' | 'ended';

const COUNTDOWN = ['3', '2', '1'];
const GO = '始め!';
const STEP_MS = 1000;
const GO_MS = 300;

/** Narrow screens and devices without a fine pointer get the blocked screen (CSS too). */
const BLOCKED = '(width < 1024px), not (pointer: fine)';

function required<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

export async function initPlay(root: HTMLElement): Promise<void> {
  const settings = readSettings(location.search);
  const config = DIFFICULTY[settings.difficulty];
  const input = required<HTMLInputElement>(root, '[data-input]');
  const stage = required<HTMLElement>(root, '.stage');
  const overlay = required<HTMLElement>(root, '[data-overlay]');
  const count = required<HTMLElement>(root, '[data-count]');
  const focusNote = required<HTMLElement>(root, '[data-focus-note]');
  const keyboardEl = required<HTMLElement>(root, '[data-keyboard]');
  const labels = JSON.parse(root.dataset['labels'] ?? '{}') as Record<string, string>;
  required<HTMLElement>(root, '[data-mode-label]').textContent = modeLabel(settings, labels);
  keyboardEl.dataset['layout'] = settings.layout;
  // The game option wins; without one, the system setting decides.
  const reducedMotion = settings.reduce ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('is-reduced', reducedMotion);
  root.classList.toggle('has-cues', settings.cues);
  root.dataset['size'] = settings.size;
  const sound = new GameSound(settings.sound);

  const keyboard = new VirtualKeyboard(keyboardEl);
  const hud = new Hud(root, {
    lives: config.lives,
    mode: settings.mode,
    challengeTime: config.challengeTime,
    levelLabel: labels['level'] ?? 'Level {level}',
    reducedMotion,
  });
  const progress = localGameProgress();
  const results = new Results(required(root, '[data-results]'));
  const field = new Field(
    {
      field: required(root, '[data-field]'),
      template: required(root, '[data-bubble-template]'),
      typed: required(root, '[data-typed]'),
      wrong: required(root, '[data-wrong]'),
      kana: required(root, '[data-typed-kana]'),
    },
    {
      locale: document.documentElement.lang,
      hint: settings.hint,
      meaning: settings.meaning,
      onLanes: (lanes) => run?.setLanes(lanes),
    },
  );
  const blocked = matchMedia(BLOCKED);
  let forced = false;

  let state: State = 'loading';
  let run: Run | null = null;
  let items: GameItem[] = [];
  let pools: Partial<Record<Difficulty, GameItem[]>> = {};
  let frame = 0;
  let last = 0;
  let timers: number[] = [];
  /** Bumped by every new run, so a countdown waiting for a key knows it is stale. */
  let countdownId = 0;
  const pressKey = required<HTMLElement>(root, '[data-press-key]');

  const setState = (next: State, status?: RunStatus | 'unavailable') => {
    state = next;
    root.dataset['status'] = status ?? next;
  };

  const showPanel = (name: string | null) => {
    overlay.hidden = name === null;
    for (const panel of overlay.querySelectorAll<HTMLElement>('[data-panel]')) {
      panel.hidden = panel.dataset['panel'] !== name;
    }
  };

  const sync = (current: Run) => {
    hud.update(current);
    root.dataset['lives'] = String(current.lives);
    root.dataset['popped'] = String(current.stats.popped);
    root.dataset['missed'] = String(current.stats.missed);
  };

  const react = (events: readonly RunEvent[]) => {
    for (const event of events) {
      sound.react(event);
      if (event.type === 'key') keyboard.flash(event.key, event.correct);
      else if (event.type === 'life') hud.damage();
      else if (event.type === 'level') hud.levelUp(event.level);
      else if (event.type === 'end') finish(event.status);
    }
  };

  const flush = (current: Run) => {
    const events = current.drain();
    if (events.length === 0) return;
    field.handle(events, current);
    sync(current);
    react(events);
  };

  const tick = (now: number) => {
    if (!run || state !== 'playing') return;
    run.step((now - last) / 1000);
    last = now;
    flush(run);
    field.render(run);
    sync(run);
    if (state === 'playing') frame = requestAnimationFrame(tick);
  };

  const stopClock = () => {
    cancelAnimationFrame(frame);
    timers.forEach((timer) => clearTimeout(timer));
    timers = [];
  };

  const play = () => {
    setState('playing');
    stage.classList.remove('is-paused');
    showPanel(null);
    input.focus();
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };

  const showCount = (text: string) => {
    count.textContent = text;
    if (!reducedMotion) {
      count.animate(
        [
          { opacity: 0, scale: 1.4 },
          { opacity: 1, scale: 1 },
        ],
        {
          duration: 250,
          easing: 'ease-out',
        },
      );
    }
  };

  /** New run: fresh field and HUD, then 3 · 2 · 1 · 始め! and play. */
  const begin = () => {
    stopClock();
    const random: Random =
      settings.seed === null ? Math.random.bind(Math) : seededRandom(settings.seed);
    run = new Run({
      config,
      mode: settings.mode,
      difficulty: settings.difficulty,
      items,
      pools,
      random,
      speed: reducedMotion ? REDUCED_MOTION_SPEED : 1,
      lanes: field.lanes,
    });
    field.clear();
    sync(run);
    focusNote.hidden = true;
    stage.classList.remove('is-paused');
    setState('countdown');
    showPanel('countdown');
    input.focus();
    void countdown(++countdownId);
  };

  /** Waits for the next key or click anywhere on the page. */
  const anyKey = () =>
    new Promise<void>((resolve) => {
      const done = () => {
        document.removeEventListener('keydown', done, true);
        document.removeEventListener('pointerdown', done, true);
        resolve();
      };
      document.addEventListener('keydown', done, true);
      document.addEventListener('pointerdown', done, true);
    });

  /** 3 · 2 · 1 · 始め! with a beep each, then play. With audio blocked, a key starts it. */
  const countdown = async (id: number) => {
    count.textContent = '';
    pressKey.hidden = true;
    if (!(await sound.ready())) {
      if (id !== countdownId) return;
      pressKey.hidden = false;
      await anyKey();
      pressKey.hidden = true;
      await sound.ready();
    }
    if (id !== countdownId || state !== 'countdown') return;
    [...COUNTDOWN, GO].forEach((text, index) => {
      timers.push(
        window.setTimeout(() => {
          showCount(text);
          sound.beep(text === GO);
        }, index * STEP_MS),
      );
    });
    timers.push(window.setTimeout(play, COUNTDOWN.length * STEP_MS + GO_MS));
  };

  const pause = () => {
    if (state !== 'playing') return;
    stopClock();
    setState('paused');
    stage.classList.add('is-paused');
    showPanel('paused');
    required<HTMLElement>(overlay, '[data-resume]').focus();
  };

  const quit = () => {
    if (state !== 'paused' || !run) return;
    run.quit();
    flush(run);
  };

  const finish = (status: Exclude<RunStatus, 'playing'>) => {
    stopClock();
    if (!run) return;
    const result = runResult(run, settings, status);
    const newBest = progress.record(result);
    root.dataset['newBest'] = String(newBest);
    results.show({
      run,
      settings,
      status,
      newBest,
      modeLabel: modeLabel(settings, labels),
      setupLabel: `${labels[settings.script] ?? settings.script} ${labels[settings.difficulty] ?? settings.difficulty}`,
      date: result.date,
    });
    setState('ended', status);
    stage.classList.remove('is-paused');
    showPanel(null);
    focusNote.hidden = true;
    window.scrollTo({ top: 0 });
    // Focus on "Play again" so Enter starts the next run straight away.
    required<HTMLElement>(root, '[data-again]').focus();
  };

  /** Starts when the game is allowed on this device and the tab is visible. */
  const ready = () => {
    if (items.length === 0) return;
    if (blocked.matches && !forced) setState('blocked');
    else if (document.hidden) setState('loading');
    else begin();
  };

  // Browsers start audio only from a key or click.
  for (const type of ['keydown', 'pointerdown'] as const) {
    root.addEventListener(type, () => sound.unlock());
  }

  input.addEventListener('keydown', (event) => {
    if (!run || state !== 'playing') return;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Backspace') run.backspace();
    else if (event.key.length === 1) run.type(event.key);
    else return;
    event.preventDefault();
    flush(run);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state === 'playing') pause();
    else if (state === 'paused') play();
    else return;
    event.preventDefault();
  });

  input.addEventListener('blur', () => (focusNote.hidden = state !== 'playing'));
  input.addEventListener('focus', () => (focusNote.hidden = true));
  // Clicking anywhere in the game puts the caret back in the hidden input.
  stage.addEventListener('pointerup', () => {
    if (state === 'playing') input.focus();
  });

  required<HTMLElement>(root, '[data-pause]').addEventListener('click', () =>
    state === 'paused' ? play() : pause(),
  );
  required<HTMLElement>(overlay, '[data-resume]').addEventListener('click', play);
  required<HTMLElement>(overlay, '[data-quit]').addEventListener('click', quit);
  for (const button of root.querySelectorAll('[data-restart]')) {
    button.addEventListener('click', () => {
      if (state !== 'loading' && state !== 'blocked') begin();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pause();
    else if (document.hidden && state === 'countdown') {
      stopClock();
      setState('loading');
    } else if (!document.hidden && state === 'loading') ready();
  });

  blocked.addEventListener('change', () => {
    if (blocked.matches && !forced) pause();
    else if (state === 'blocked') ready();
  });
  initBlocked(root, () => {
    forced = true;
    root.classList.add('is-forced');
    ready();
  });

  [items, pools] = await Promise.all([
    loadItems(settings.script, settings.difficulty),
    settings.mode === 'endless' ? loadLongerPools(settings.script, settings.difficulty) : {},
  ]);
  if (items.length === 0) {
    setState('ended', 'unavailable');
    showPanel('unavailable');
    return;
  }
  ready();
}
