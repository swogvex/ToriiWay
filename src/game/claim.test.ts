import { describe, expect, it } from 'vitest';

import { verifyRun } from '../lib/game/leaderboard/verify';
import { buildClaim, canSubmit, lazySeededRandom } from './claim';
import { DIFFICULTY } from './config';
import { romajiHint } from './romaji';
import { type GameItem, Run } from './run';
import { seededRandom } from './spawner';

const words: GameItem[] = ['さくら', 'ねこ', 'いぬ', 'やま', 'かわ', 'すし'].map((w) => ({
  text: w,
  reading: w,
}));
const TEXTS = new Set(words.map((word) => word.text));
const START = Date.UTC(2026, 10, 5, 12);

/** Plays in 50 ms frames; `typist` may type each frame. Stops when the run ends. */
function simulate(run: Run, typist: (run: Run, frame: number) => void, maxSeconds = 400): void {
  for (let frame = 0; frame < maxSeconds * 20 && run.status === 'playing'; frame++) {
    typist(run, frame);
    run.step(0.05);
    run.drain();
  }
}

/** Types the romaji of the bubble closest to its exit, one key every other frame. */
function goodTypist(run: Run, frame: number): void {
  if (frame % 2 !== 0) return;
  const target = run.target ?? [...run.bubbles].sort((a, b) => b.progress - a.progress)[0] ?? null;
  if (!target) return;
  const hint = romajiHint(target.item.reading);
  const next = hint[target.typed.length];
  if (next) run.type(next);
}

describe('buildClaim + verifyRun', () => {
  it('a real cleared Normal challenge passes the server checks', () => {
    const run = new Run({
      config: DIFFICULTY.normal,
      mode: 'challenge',
      items: words,
      random: seededRandom(5),
    });
    simulate(run, goodTypist);
    expect(run.status).toBe('cleared');
    const claim = buildClaim(
      run,
      { script: 'hiragana', difficulty: 'normal', mode: 'challenge' },
      'cleared',
      'r',
    );
    const serverRun = {
      id: 'r',
      seed: 5,
      script: 'hiragana' as const,
      difficulty: 'normal' as const,
      mode: 'challenge' as const,
      serverStart: START,
      usedAt: null,
    };
    const result = verifyRun(claim, serverRun, START + 155_000, TEXTS);
    expect(result).toMatchObject({ ok: true, run: { cleared: true, durationS: 150 } });
  });

  it('a real Extreme run lost to wrong keys passes as failed', () => {
    const run = new Run({
      config: DIFFICULTY.extreme,
      mode: 'endless',
      difficulty: 'extreme',
      items: words,
      random: seededRandom(9),
    });
    simulate(run, (current, frame) => {
      if (frame > 10 && frame % 3 === 0) current.type('q');
      else goodTypist(current, frame);
    });
    expect(run.status).toBe('failed');
    const claim = buildClaim(
      run,
      { script: 'hiragana', difficulty: 'extreme', mode: 'endless' },
      'failed',
      'r',
    );
    const serverRun = {
      id: 'r',
      seed: 9,
      script: 'hiragana' as const,
      difficulty: 'extreme' as const,
      mode: 'endless' as const,
      serverStart: START,
      usedAt: null,
    };
    const result = verifyRun(claim, serverRun, START + (run.elapsed + 4) * 1000, TEXTS);
    expect(result.ok).toBe(true);
  });
});

describe('canSubmit', () => {
  it('offers cleared and failed runs, never quit or reduced-motion runs', () => {
    expect(canSubmit('cleared', false)).toBe(true);
    expect(canSubmit('failed', false)).toBe(true);
    expect(canSubmit('quit', false)).toBe(false);
    expect(canSubmit('cleared', true)).toBe(false);
  });
});

describe('lazySeededRandom', () => {
  it('uses the server seed when it arrived before the first draw', () => {
    let seed: number | null = null;
    const random = lazySeededRandom(
      () => seed,
      () => 0.5,
      seededRandom,
    );
    seed = 42;
    expect(random()).toBe(seededRandom(42)());
  });

  it('falls back to local randomness when the seed is late', () => {
    let seed: number | null = null;
    const random = lazySeededRandom(
      () => seed,
      () => 0.5,
      seededRandom,
    );
    expect(random()).toBe(0.5);
    seed = 42;
    expect(random()).toBe(0.5);
  });
});
