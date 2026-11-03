import { describe, expect, it } from 'vitest';

import { runResult } from './result';

describe('runResult', () => {
  it('rounds the metrics and stamps the local date', () => {
    const stats = {
      correctKeys: 263,
      wrongKeys: 17,
      popped: 41,
      missed: 3,
      combo: 0,
      maxCombo: 30,
    };
    const result = runResult(
      { stats, elapsed: 150.4, level: 1 },
      { script: 'hiragana', difficulty: 'normal', mode: 'challenge' },
      'cleared',
      new Date(2026, 10, 3, 23, 30),
    );
    expect(result).toEqual({
      script: 'hiragana',
      difficulty: 'normal',
      mode: 'challenge',
      status: 'cleared',
      wpm: 21,
      accuracy: 94,
      popped: 41,
      time: 150,
      level: 1,
      date: '2026-11-03',
    });
  });
});
