// Leaderboard order (08-spec-game: "Order").
// Challenge: cleared first, then WPM desc, accuracy desc, oldest first.
// Endless: survival time (longest or shortest first), then WPM desc, oldest first.
// All modes: WPM desc, accuracy desc, oldest first.

import type { Mode } from '../../../game/config';
import type { RankKey, SortOrder } from './types';

type Compare = (a: RankKey, b: RankKey) => number;

const byWpm: Compare = (a, b) => b.wpm - a.wpm;
const byAccuracy: Compare = (a, b) => b.accuracy - a.accuracy;
const byCleared: Compare = (a, b) => Number(b.cleared) - Number(a.cleared);
const oldestFirst: Compare = (a, b) => a.createdAt - b.createdAt;

function chain(...compares: Compare[]): Compare {
  return (a, b) => {
    for (const compare of compares) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

/** Comparator for a board: negative when `a` is listed before `b`. */
export function boardOrder(mode: Mode | null, sort: SortOrder = 'longest'): Compare {
  if (mode === 'challenge') return chain(byCleared, byWpm, byAccuracy, oldestFirst);
  if (mode === 'endless') {
    const bySurvival: Compare =
      sort === 'shortest'
        ? (a, b) => a.durationS - b.durationS
        : (a, b) => b.durationS - a.durationS;
    return chain(bySurvival, byWpm, oldestFirst);
  }
  return chain(byWpm, byAccuracy, oldestFirst);
}

/**
 * Whether a new run beats the stored one for the same name and combination.
 * Endless always keeps the longest survival, whatever the page's sort; an equal
 * run does not replace the older one.
 */
export function isBetter(candidate: RankKey, stored: RankKey, mode: Mode): boolean {
  const compare = boardOrder(mode, 'longest');
  return compare({ ...candidate, createdAt: 0 }, { ...stored, createdAt: 0 }) < 0;
}

/**
 * 1-based position `candidate` takes among `entries` on a board. The candidate is
 * the newest, so entries it ties with stay ahead of it.
 */
export function rankAmong(
  candidate: RankKey,
  entries: readonly RankKey[],
  mode: Mode | null,
  sort: SortOrder = 'longest',
): number {
  const compare = boardOrder(mode, sort);
  return 1 + entries.filter((entry) => compare(entry, candidate) <= 0).length;
}

/** Evenly spaced points, at most `max`, always keeping the last one. */
export function downsample(values: readonly number[], max = 120): number[] {
  if (values.length <= max) return [...values];
  return Array.from({ length: max }, (_, index) => {
    const at = Math.round(((index + 1) * values.length) / max) - 1;
    return values[at] ?? 0;
  });
}
