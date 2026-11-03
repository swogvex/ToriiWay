import { REPEAT_WINDOW } from './config';

export type Random = () => number;
export type Side = 'left' | 'right';

/** Deterministic random numbers in [0, 1) (mulberry32), for seeded runs and tests. */
export function seededRandom(seed: number): Random {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: Random): T | undefined {
  return items[Math.floor(random() * items.length)];
}

/**
 * Index of the next item, skipping the last REPEAT_WINDOW spawns (fewer for
 * short pools). Updates `recent` in place.
 */
export function pickItem(poolSize: number, recent: number[], random: Random): number {
  const window = Math.min(REPEAT_WINDOW, poolSize - 1);
  const blocked = new Set(recent.slice(-window));
  const free = Array.from({ length: poolSize }, (_, index) => index).filter((i) => !blocked.has(i));
  const index = pick(free, random) ?? 0;
  recent.push(index);
  if (recent.length > REPEAT_WINDOW) recent.shift();
  return index;
}

/** Random side, forced to the other side once one is two spawns ahead. */
export function pickSide(counts: Record<Side, number>, random: Random): Side {
  if (counts.left - counts.right >= 2) return 'right';
  if (counts.right - counts.left >= 2) return 'left';
  return random() < 0.5 ? 'left' : 'right';
}

/** A random lane nobody is using, or null when all are busy. */
export function pickLane(lanes: number, busy: ReadonlySet<number>, random: Random): number | null {
  const free = Array.from({ length: lanes }, (_, lane) => lane).filter((lane) => !busy.has(lane));
  return pick(free, random) ?? null;
}
