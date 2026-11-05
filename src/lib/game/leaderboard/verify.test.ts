import { describe, expect, it } from 'vitest';

import { fakeClaim, fakeRun, ITEMS, NOW } from './fixtures';
import { maxSpawns, reachablePools, type RunClaim, verifyRun } from './verify';

const reason = (claim: RunClaim, run = fakeRun(), now = NOW) => {
  const result = verifyRun(claim, run, now, ITEMS);
  return result.ok ? 'ok' : result.reason;
};

describe('verifyRun', () => {
  it('accepts an honest cleared challenge and recomputes its metrics', () => {
    const result = verifyRun(fakeClaim(), fakeRun(), NOW, ITEMS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run).toMatchObject({
      cleared: true,
      durationS: 150,
      wpm: 36,
      rawWpm: 36.08,
      accuracy: 99.78,
      popped: 60,
      missed: 2,
      errors: [10],
    });
    expect(result.run.consistency).toBeCloseTo(97.29, 1);
    expect(result.run.series).toHaveLength(120);
  });

  it('rejects unknown, used, expired and mismatched runs', () => {
    expect(reason(fakeClaim(), null as never)).toBe('unknown run');
    expect(reason(fakeClaim(), fakeRun({ usedAt: NOW - 1000 }))).toBe('run already used');
    expect(reason(fakeClaim(), fakeRun({ serverStart: NOW - 3 * 3600_000 }))).toBe('run expired');
    expect(reason(fakeClaim({ difficulty: 'hard' }))).toBe('combination does not match');
  });

  it('rejects a run declared longer than the real time since the countdown', () => {
    expect(reason(fakeClaim(), fakeRun({ serverStart: NOW - 100_000 }))).toBe(
      'faster than real time',
    );
    // A few seconds of clock slack are fine.
    expect(reason(fakeClaim(), fakeRun({ serverStart: NOW - 148_000 }))).toBe('ok');
  });

  it('checks the challenge clock and the lives', () => {
    expect(reason(fakeClaim({ duration: 120, samples: fakeClaim().samples.slice(0, 120) }))).toBe(
      'cleared before the end',
    );
    expect(reason(fakeClaim({ status: 'failed' }))).toBe('failed after the end');
    expect(reason(fakeClaim({ missed: 5 }))).toBe('lives do not add up');
    expect(reason(fakeClaim({ mode: 'endless' }), fakeRun({ mode: 'endless' }))).toBe(
      'endless runs end by failing',
    );
  });

  it('counts the Extreme wrong-key penalty as lost lives', () => {
    const run = fakeRun({ difficulty: 'extreme', serverStart: NOW - 200_000 });
    const samples = Array.from({ length: 180 }, (_, index) =>
      index < 10 ? ([2, 1] as const) : ([2, 0] as const),
    );
    // 10 wrong keys = 2 lives, + 1 miss = 3 lives = out, so it cannot be "cleared".
    const claim = fakeClaim({
      difficulty: 'extreme',
      duration: 180,
      samples,
      correctKeys: 360,
      wrongKeys: 10,
      missed: 1,
      wpm: 24,
      rawWpm: 25,
      accuracy: 97,
      consistency: 92,
    });
    expect(reason(claim, run)).toBe('lives do not add up');
  });

  it('rejects tampered numbers', () => {
    expect(reason(fakeClaim({ correctKeys: 900 }))).toBe('key counts');
    expect(reason(fakeClaim({ wpm: 60 }))).toBe('wpm mismatch');
    expect(reason(fakeClaim({ accuracy: 90 }))).toBe('accuracy mismatch');
    expect(reason(fakeClaim({ consistency: 50 }))).toBe('consistency mismatch');
    expect(reason(fakeClaim({ samples: fakeClaim().samples.slice(1) }))).toBe('sample count');
  });

  it('enforces the WPM limit even when the numbers agree', () => {
    const samples = Array.from({ length: 150 }, () => [22, 0] as const);
    const claim = fakeClaim({
      samples,
      correctKeys: 3300,
      wrongKeys: 0,
      wpm: 264,
      rawWpm: 264,
      accuracy: 100,
      consistency: 100,
    });
    expect(reason(claim)).toBe('wpm limit');
  });

  it('limits bubbles to what the spawner can create and items to the lists', () => {
    expect(maxSpawns(fakeClaim(), 150)).toBe(76);
    expect(reason(fakeClaim({ popped: 75, missed: 2 }))).toBe('too many bubbles');
    expect(reason(fakeClaim({ items: ['ラーメン'] }))).toBe('unknown item');
    expect(reason(fakeClaim({ items: [] }))).toBe('item count');
  });

  it('accepts a trailing partial second like the engine records it', () => {
    const run = fakeRun({ mode: 'endless', serverStart: NOW - 100_000 });
    const samples = [...Array.from({ length: 90 }, () => [3, 0] as const), [1, 0] as const];
    const claim = fakeClaim({
      mode: 'endless',
      status: 'failed',
      duration: 90.5,
      samples,
      correctKeys: 271,
      wrongKeys: 0,
      missed: 5,
      wpm: 36,
      rawWpm: 36,
      accuracy: 100,
      consistency: 100,
      popped: 40,
    });
    expect(reason(claim, run)).toBe('ok');
  });
});

describe('reachablePools', () => {
  it('challenge uses one list; endless adds the longer lists it reaches', () => {
    expect(reachablePools(fakeClaim(), 600)).toEqual(['normal']);
    const endless = { ...fakeClaim(), mode: 'endless' as const, difficulty: 'easy' as const };
    expect(reachablePools(endless, 100)).toEqual(['easy']);
    // Level 3 at 4:00 → one pool step.
    expect(reachablePools(endless, 240)).toEqual(['easy', 'normal']);
    expect(reachablePools(endless, 10_000)).toEqual(['easy', 'normal', 'hard', 'extreme']);
  });
});
