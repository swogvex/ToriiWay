// Kana Rush tuning. Every gameplay number lives here (see the difficulty table in the game spec).

export type GameScript = 'hiragana' | 'katakana' | 'kanji';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type Mode = 'challenge' | 'endless';

export const GAME_SCRIPTS: readonly GameScript[] = ['hiragana', 'katakana', 'kanji'];
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'extreme'];
export const MODES: readonly Mode[] = ['challenge', 'endless'];

export interface DifficultyConfig {
  lives: number;
  /** Time to survive in challenge mode, in seconds. */
  challengeTime: number;
  /** Seconds a one-kana bubble takes to cross the field (screen-size independent). */
  baseCrossTime: number;
  /** Extra seconds per kana after the first. */
  perKana: number;
  /** Seconds between spawns. */
  spawnEvery: number;
  maxBubbles: number;
  /** Wrong keys that cost one life (Extreme only). */
  wrongKeysPerLife: number | null;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyConfig>> = {
  easy: {
    lives: 7,
    challengeTime: 120,
    baseCrossTime: 12,
    perKana: 0,
    spawnEvery: 2.4,
    maxBubbles: 4,
    wrongKeysPerLife: null,
  },
  normal: {
    lives: 5,
    challengeTime: 150,
    baseCrossTime: 10,
    perKana: 0.8,
    spawnEvery: 2,
    maxBubbles: 5,
    wrongKeysPerLife: null,
  },
  hard: {
    lives: 3,
    challengeTime: 180,
    baseCrossTime: 8.5,
    perKana: 0.6,
    spawnEvery: 1.7,
    maxBubbles: 6,
    wrongKeysPerLife: null,
  },
  extreme: {
    lives: 3,
    challengeTime: 180,
    baseCrossTime: 9,
    perKana: 0.45,
    spawnEvery: 2.6,
    maxBubbles: 4,
    wrongKeysPerLife: 5,
  },
};

export const ENDLESS = {
  /** Seconds per level. */
  levelEvery: 120,
  maxLevel: 15,
  /** Multipliers applied once per level gained. */
  crossTimeFactor: 0.88,
  spawnFactor: 0.9,
  /** Levels per step to the next (longer) item pool. */
  levelsPerPool: 2,
} as const;

/** An item is not spawned again within this many spawns. */
export const REPEAT_WINDOW = 15;

/** Reduced-motion mode slows everything by 30%. */
export const REDUCED_MOTION_SPEED = 0.7;

/** Danger state: the last fraction of the path. */
export const DANGER_FROM = 0.8;

/** Horizontal lanes in the field; one bubble per lane, so no vertical overlap. */
export const LANES = 6;

/** Longest frame step the simulation accepts, so a stalled tab does not jump ahead. */
export const MAX_STEP = 0.1;

/** Seconds a bubble with this many kana takes to cross the field. */
export function crossTime(config: DifficultyConfig, kanaCount: number): number {
  return config.baseCrossTime + config.perKana * Math.max(0, kanaCount - 1);
}

/** Cross time and spawn interval at an endless level (level 1 = base values). */
export function endlessTuning(
  config: DifficultyConfig,
  level: number,
): { crossTimeScale: number; spawnEvery: number } {
  const steps = Math.min(Math.max(level, 1), ENDLESS.maxLevel) - 1;
  return {
    crossTimeScale: ENDLESS.crossTimeFactor ** steps,
    spawnEvery: config.spawnEvery * ENDLESS.spawnFactor ** steps,
  };
}

/** Endless level after a number of elapsed seconds. */
export function endlessLevel(elapsed: number): number {
  return Math.min(Math.floor(elapsed / ENDLESS.levelEvery) + 1, ENDLESS.maxLevel);
}

/** Item pool used at an endless level, starting from the chosen difficulty. */
export function endlessPool(start: Difficulty, level: number): Difficulty {
  const shift = Math.floor(
    (Math.min(Math.max(level, 1), ENDLESS.maxLevel) - 1) / ENDLESS.levelsPerPool,
  );
  const index = Math.min(DIFFICULTIES.indexOf(start) + shift, DIFFICULTIES.length - 1);
  return DIFFICULTIES[index] ?? start;
}
