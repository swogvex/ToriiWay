/**
 * Kana Rush progress: best runs per script × difficulty × mode, cleared challenges and
 * the last setup. v1 keeps them in localStorage (no accounts); the interface lets a
 * synced store replace it later (03-architecture).
 */
import {
  DIFFICULTIES,
  type Difficulty,
  GAME_SCRIPTS,
  type GameScript,
  type Mode,
  MODES,
} from '../../game/config';
import { KEYBOARD_LAYOUTS, type KeyboardLayout } from '../../game/keyboard';

export interface GameBest {
  wpm: number;
  accuracy: number;
  popped: number;
  /** Seconds played. */
  time: number;
  /** Endless level reached. */
  level: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
}

export interface GameResult extends GameBest {
  script: GameScript;
  difficulty: Difficulty;
  mode: Mode;
  status: 'cleared' | 'failed' | 'quit';
}

export interface GameSetup {
  script: GameScript;
  difficulty: Difficulty;
  mode: Mode;
  hint: boolean;
  meaning: boolean;
  layout: KeyboardLayout;
}

export const DEFAULT_SETUP: GameSetup = {
  script: 'hiragana',
  difficulty: 'normal',
  mode: 'challenge',
  hint: true,
  meaning: true,
  layout: 'ansi',
};

export interface GameProgress {
  best(script: GameScript, difficulty: Difficulty, mode: Mode): GameBest | undefined;
  /** Challenges cleared, as "script/difficulty". */
  cleared(): Set<string>;
  /** Saves a finished run; quit runs count for nothing. Returns true for a new best. */
  record(result: GameResult): boolean;
  setup(): GameSetup;
  saveSetup(setup: GameSetup): void;
}

export const GAME_STORAGE_KEY = 'nnt:v1:game';

interface StoredGame {
  bests: Record<string, GameBest>;
  cleared: string[];
  setup: GameSetup;
}

export const runKey = (script: GameScript, difficulty: Difficulty, mode: Mode): string =>
  `${script}/${difficulty}/${mode}`;

export const challengeKey = (script: GameScript, difficulty: Difficulty): string =>
  `${script}/${difficulty}`;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isBest(value: unknown): value is GameBest {
  if (typeof value !== 'object' || value === null) return false;
  const best = value as Record<string, unknown>;
  return (
    isNumber(best.wpm) &&
    isNumber(best.accuracy) &&
    isNumber(best.popped) &&
    isNumber(best.time) &&
    isNumber(best.level) &&
    typeof best.date === 'string'
  );
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

function parseSetup(value: unknown): GameSetup {
  const setup = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    script: oneOf(setup.script, GAME_SCRIPTS, DEFAULT_SETUP.script),
    difficulty: oneOf(setup.difficulty, DIFFICULTIES, DEFAULT_SETUP.difficulty),
    mode: oneOf(setup.mode, MODES, DEFAULT_SETUP.mode),
    hint: typeof setup.hint === 'boolean' ? setup.hint : DEFAULT_SETUP.hint,
    meaning: typeof setup.meaning === 'boolean' ? setup.meaning : DEFAULT_SETUP.meaning,
    layout: oneOf(setup.layout, KEYBOARD_LAYOUTS, DEFAULT_SETUP.layout),
  };
}

/** Reads stored progress, dropping anything malformed instead of failing. */
export function parseGame(raw: string | null): StoredGame {
  try {
    const data = JSON.parse(raw ?? '{}') as Partial<Record<keyof StoredGame, unknown>>;
    const bests =
      typeof data.bests === 'object' && data.bests !== null
        ? Object.fromEntries(Object.entries(data.bests).filter(([, best]) => isBest(best)))
        : {};
    return {
      bests: bests as Record<string, GameBest>,
      cleared: Array.isArray(data.cleared)
        ? data.cleared.filter((key): key is string => typeof key === 'string')
        : [],
      setup: parseSetup(data.setup),
    };
  } catch {
    return { bests: {}, cleared: [], setup: { ...DEFAULT_SETUP } };
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Progress kept in localStorage; in memory for the visit when storage is blocked. */
export function localGameProgress(
  storage: StorageLike | undefined = browserStorage(),
): GameProgress {
  let memory: StoredGame | undefined;

  function read(): StoredGame {
    if (memory) return memory;
    try {
      return parseGame(storage?.getItem(GAME_STORAGE_KEY) ?? null);
    } catch {
      return parseGame(null);
    }
  }

  function write(data: StoredGame): void {
    memory = data;
    try {
      storage?.setItem(GAME_STORAGE_KEY, JSON.stringify(data));
      memory = undefined;
    } catch {
      // Blocked or full storage: keep the in-memory copy for this visit.
    }
  }

  return {
    best: (script, difficulty, mode) => read().bests[runKey(script, difficulty, mode)],
    cleared: () => new Set(read().cleared),
    record(result) {
      if (result.status === 'quit') return false;
      const data = read();
      const key = runKey(result.script, result.difficulty, result.mode);
      const previous = data.bests[key];
      const newBest = !previous || result.wpm > previous.wpm;
      const { wpm, accuracy, popped, time, level, date } = result;
      const bests = newBest
        ? { ...data.bests, [key]: { wpm, accuracy, popped, time, level, date } }
        : data.bests;
      const cleared = new Set(data.cleared);
      if (result.mode === 'challenge' && result.status === 'cleared') {
        cleared.add(challengeKey(result.script, result.difficulty));
      }
      write({ ...data, bests, cleared: [...cleared] });
      return newBest;
    },
    setup: () => read().setup,
    saveSetup(setup) {
      write({ ...read(), setup });
    },
  };
}
