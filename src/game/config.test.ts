import { describe, expect, it } from 'vitest';

import {
  crossTime,
  DIFFICULTIES,
  DIFFICULTY,
  ENDLESS,
  endlessLevel,
  endlessPool,
  endlessTuning,
} from './config';

describe('difficulty config', () => {
  it.each(DIFFICULTIES)('%s has sane values', (difficulty) => {
    const config = DIFFICULTY[difficulty];
    expect(config.lives).toBeGreaterThan(0);
    expect(config.challengeTime).toBeGreaterThan(0);
    expect(config.baseCrossTime).toBeGreaterThan(config.spawnEvery);
    expect(config.perKana).toBeGreaterThanOrEqual(0);
    expect(config.maxBubbles).toBeGreaterThan(0);
    expect(config.maxBubbles).toBeLessThanOrEqual(8);
  });

  it('only Extreme costs lives for wrong keys', () => {
    expect(DIFFICULTIES.filter((d) => DIFFICULTY[d].wrongKeysPerLife !== null)).toEqual([
      'extreme',
    ]);
  });

  it('gives longer targets proportionally more time', () => {
    expect(crossTime(DIFFICULTY.normal, 1)).toBe(10);
    expect(crossTime(DIFFICULTY.normal, 4)).toBeCloseTo(12.4);
    expect(crossTime(DIFFICULTY.easy, 3)).toBe(12);
  });
});

describe('endless progression', () => {
  it('levels up every two minutes up to the cap', () => {
    expect(endlessLevel(0)).toBe(1);
    expect(endlessLevel(119.9)).toBe(1);
    expect(endlessLevel(120)).toBe(2);
    expect(endlessLevel(10_000)).toBe(ENDLESS.maxLevel);
  });

  it('speeds up 12% and spawns 10% faster per level', () => {
    expect(endlessTuning(DIFFICULTY.normal, 1)).toEqual({ crossTimeScale: 1, spawnEvery: 2 });
    const level3 = endlessTuning(DIFFICULTY.normal, 3);
    expect(level3.crossTimeScale).toBeCloseTo(0.88 ** 2);
    expect(level3.spawnEvery).toBeCloseTo(2 * 0.9 ** 2);
    expect(endlessTuning(DIFFICULTY.normal, 99)).toEqual(
      endlessTuning(DIFFICULTY.normal, ENDLESS.maxLevel),
    );
  });

  it('shifts to longer pools every two levels and stops at Extreme', () => {
    expect(endlessPool('easy', 1)).toBe('easy');
    expect(endlessPool('easy', 2)).toBe('easy');
    expect(endlessPool('easy', 3)).toBe('normal');
    expect(endlessPool('easy', 5)).toBe('hard');
    expect(endlessPool('hard', 5)).toBe('extreme');
    expect(endlessPool('easy', 15)).toBe('extreme');
  });
});
