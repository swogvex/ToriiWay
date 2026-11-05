// Test helpers: a run and a claim that pass every plausibility check.

import type { RunClaim } from './verify';
import type { GameRunRecord } from './types';

export const NOW = Date.UTC(2026, 10, 5, 12);
export const ITEMS: ReadonlySet<string> = new Set(['さくら', 'ねこ', 'すし', 'みず']);

export function fakeRun(over: Partial<GameRunRecord> = {}): GameRunRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    seed: 42,
    script: 'hiragana',
    difficulty: 'normal',
    mode: 'challenge',
    // Countdown (3 s) + 150 s of play + a little.
    serverStart: NOW - 160_000,
    usedAt: null,
    ...over,
  };
}

/**
 * A cleared Normal challenge: 150 s at 3 correct keys per second, one wrong key in
 * second 10 → 36 WPM, 99.78 % accuracy.
 */
export function fakeClaim(over: Partial<RunClaim> = {}): RunClaim {
  const samples = Array.from({ length: 150 }, (_, index) =>
    index === 10 ? ([3, 1] as const) : ([3, 0] as const),
  );
  return {
    runId: '11111111-1111-4111-8111-111111111111',
    script: 'hiragana',
    difficulty: 'normal',
    mode: 'challenge',
    status: 'cleared',
    duration: 150,
    samples,
    correctKeys: 450,
    wrongKeys: 1,
    popped: 60,
    missed: 2,
    items: ['さくら', 'ねこ', 'すし'],
    wpm: 36,
    rawWpm: 36,
    accuracy: 100,
    consistency: 97,
    ...over,
  };
}
