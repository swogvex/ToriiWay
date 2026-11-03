import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETUP,
  GAME_STORAGE_KEY,
  type GameResult,
  localGameProgress,
  parseGame,
} from './game';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const result: GameResult = {
  script: 'hiragana',
  difficulty: 'normal',
  mode: 'challenge',
  status: 'cleared',
  wpm: 42,
  accuracy: 94,
  popped: 41,
  time: 150,
  level: 1,
  date: '2026-11-03',
};

describe('localGameProgress', () => {
  it('keeps the best WPM per script, difficulty and mode', () => {
    const progress = localGameProgress(memoryStorage());
    expect(progress.record(result)).toBe(true);
    expect(progress.record({ ...result, wpm: 30 })).toBe(false);
    expect(progress.record({ ...result, wpm: 50 })).toBe(true);
    expect(progress.best('hiragana', 'normal', 'challenge')?.wpm).toBe(50);
    expect(progress.best('hiragana', 'normal', 'endless')).toBeUndefined();
  });

  it('marks cleared challenges only, and ignores quit runs', () => {
    const progress = localGameProgress(memoryStorage());
    progress.record({ ...result, status: 'failed', difficulty: 'hard' });
    progress.record({ ...result, mode: 'endless', difficulty: 'easy' });
    expect(progress.record({ ...result, status: 'quit', difficulty: 'extreme' })).toBe(false);
    progress.record(result);
    expect(progress.cleared()).toEqual(new Set(['hiragana/normal']));
    expect(progress.best('hiragana', 'extreme', 'challenge')).toBeUndefined();
    expect(progress.best('hiragana', 'hard', 'challenge')?.wpm).toBe(42);
  });

  it('remembers the last setup', () => {
    const storage = memoryStorage();
    expect(localGameProgress(storage).setup()).toEqual(DEFAULT_SETUP);
    const setup = {
      ...DEFAULT_SETUP,
      script: 'katakana',
      hint: false,
      layout: 'iso-es',
      sound: true,
      reduce: false,
      cues: true,
      size: 'l',
    } as const;
    localGameProgress(storage).saveSetup(setup);
    expect(localGameProgress(storage).setup()).toEqual(setup);
    expect(storage.data.has(GAME_STORAGE_KEY)).toBe(true);
  });

  it('works in memory when storage throws', () => {
    const progress = localGameProgress({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    progress.record(result);
    expect(progress.best('hiragana', 'normal', 'challenge')?.wpm).toBe(42);
  });
});

describe('parseGame', () => {
  it('drops malformed data instead of failing', () => {
    expect(parseGame('not json').bests).toEqual({});
    const parsed = parseGame(
      JSON.stringify({
        bests: { ok: { ...result }, bad: { wpm: 'fast' } },
        cleared: ['hiragana/easy', 3],
        setup: { script: 'cyrillic', hint: false, reduce: 'yes', size: 'xl', sound: true },
      }),
    );
    expect(Object.keys(parsed.bests)).toEqual(['ok']);
    expect(parsed.cleared).toEqual(['hiragana/easy']);
    expect(parsed.setup).toEqual({ ...DEFAULT_SETUP, hint: false, sound: true });
  });
});
