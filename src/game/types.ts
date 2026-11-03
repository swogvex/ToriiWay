import type { Difficulty, DifficultyConfig, Mode } from './config';
import type { Random, Side } from './spawner';

/** One bubble's content. Single kana have no meaning to show on pop. */
export interface GameItem {
  text: string;
  reading: string;
  en?: string;
  es?: string;
}

export interface Bubble {
  id: number;
  item: GameItem;
  lane: number;
  side: Side;
  /** Share of the path travelled, 0–1. */
  progress: number;
  /** Seconds to cross the field. */
  duration: number;
  /** Romaji typed for this bubble while it is the target. */
  typed: string;
  /** Kana of the reading already produced. */
  kana: number;
  /** Romaji not yet converted. */
  pending: string;
  /** Wrong keys while this bubble was the target (the romaji hint shows after the first). */
  misses: number;
}

export type RunStatus = 'playing' | 'cleared' | 'failed' | 'quit';

export type RunEvent =
  | { type: 'spawn'; bubble: Bubble }
  | { type: 'key'; key: string; correct: boolean; bubble: Bubble | null }
  | { type: 'pop'; bubble: Bubble }
  | { type: 'miss'; bubble: Bubble }
  | { type: 'edit'; bubble: Bubble }
  | { type: 'release'; bubble: Bubble }
  | { type: 'life'; lives: number }
  | { type: 'level'; level: number }
  | { type: 'end'; status: Exclude<RunStatus, 'playing'> };

export interface RunStats {
  correctKeys: number;
  wrongKeys: number;
  popped: number;
  missed: number;
  combo: number;
  maxCombo: number;
}

export interface RunOptions {
  config: DifficultyConfig;
  mode: Mode;
  /** Items of the chosen difficulty. */
  items: readonly GameItem[];
  random: Random;
  /** Speed multiplier (reduced motion uses 0.7). */
  speed?: number;
  /** Endless: the chosen difficulty and the longer pools it moves on to. */
  difficulty?: Difficulty;
  pools?: Partial<Record<Difficulty, readonly GameItem[]>>;
}
