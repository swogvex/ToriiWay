import { describe, expect, it } from 'vitest';

import { boardOrder, downsample, isBetter, rankAmong } from './ranking';
import type { RankKey } from './types';

const key = (over: Partial<RankKey> & { id?: string }) => ({
  id: 'x',
  cleared: true,
  wpm: 40,
  accuracy: 95,
  durationS: 150,
  createdAt: 1000,
  ...over,
});

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('board order', () => {
  it('challenge: cleared first, then WPM, accuracy and oldest', () => {
    const rows = [
      key({ id: 'fast-failed', cleared: false, wpm: 90 }),
      key({ id: 'slow', wpm: 30 }),
      key({ id: 'tie-new', wpm: 50, accuracy: 90, createdAt: 2000 }),
      key({ id: 'tie-old', wpm: 50, accuracy: 90, createdAt: 1000 }),
      key({ id: 'accurate', wpm: 50, accuracy: 99 }),
    ];
    expect(ids(rows.sort(boardOrder('challenge')))).toEqual([
      'accurate',
      'tie-old',
      'tie-new',
      'slow',
      'fast-failed',
    ]);
  });

  it('endless: survival time (either direction), then WPM, then oldest', () => {
    const rows = [
      key({ id: 'short', durationS: 60, wpm: 80 }),
      key({ id: 'long-slow', durationS: 600, wpm: 20 }),
      key({ id: 'long-fast', durationS: 600, wpm: 30 }),
    ];
    expect(ids([...rows].sort(boardOrder('endless', 'longest')))).toEqual([
      'long-fast',
      'long-slow',
      'short',
    ]);
    expect(ids([...rows].sort(boardOrder('endless', 'shortest')))).toEqual([
      'short',
      'long-fast',
      'long-slow',
    ]);
  });

  it('all modes: WPM, then accuracy, then oldest', () => {
    const rows = [
      key({ id: 'b', wpm: 50, accuracy: 90 }),
      key({ id: 'a', wpm: 50, accuracy: 95, cleared: false }),
      key({ id: 'c', wpm: 70 }),
    ];
    expect(ids(rows.sort(boardOrder(null)))).toEqual(['c', 'a', 'b']);
  });
});

describe('isBetter (one entry per name and combination)', () => {
  it('challenge: a clear beats a fail, then WPM, then accuracy; a tie keeps the old run', () => {
    expect(
      isBetter(key({ cleared: true, wpm: 10 }), key({ cleared: false, wpm: 90 }), 'challenge'),
    ).toBe(true);
    expect(isBetter(key({ wpm: 41 }), key({ wpm: 40 }), 'challenge')).toBe(true);
    expect(isBetter(key({ wpm: 40, accuracy: 96 }), key({ wpm: 40 }), 'challenge')).toBe(true);
    expect(isBetter(key({ createdAt: 9 }), key({ createdAt: 99 }), 'challenge')).toBe(false);
    expect(isBetter(key({ wpm: 39 }), key({ wpm: 40 }), 'challenge')).toBe(false);
  });

  it('endless keeps the longest survival', () => {
    expect(
      isBetter(key({ durationS: 300, wpm: 5 }), key({ durationS: 200, wpm: 80 }), 'endless'),
    ).toBe(true);
    expect(isBetter(key({ durationS: 100 }), key({ durationS: 200 }), 'endless')).toBe(false);
  });
});

describe('rankAmong', () => {
  it('places a new run after the entries it ties with', () => {
    const entries = [key({ wpm: 60 }), key({ wpm: 40 }), key({ wpm: 20 })];
    expect(rankAmong(key({ wpm: 70, createdAt: 5000 }), entries, 'challenge')).toBe(1);
    expect(rankAmong(key({ wpm: 40, createdAt: 5000 }), entries, 'challenge')).toBe(3);
    expect(rankAmong(key({ wpm: 1, createdAt: 5000 }), entries, 'challenge')).toBe(4);
  });
});

describe('downsample', () => {
  it('keeps short series and the last point of long ones', () => {
    expect(downsample([1, 2, 3])).toEqual([1, 2, 3]);
    const long = Array.from({ length: 1000 }, (_, index) => index);
    const small = downsample(long);
    expect(small).toHaveLength(120);
    expect(small.at(-1)).toBe(999);
  });
});
