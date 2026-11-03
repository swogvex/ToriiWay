import { describe, expect, it } from 'vitest';

import { DIFFICULTY, LANES } from './config';
import { filledChars } from './fill';
import { type GameItem, Run, type RunEvent } from './run';
import { pickItem, pickLane, pickSide, seededRandom } from './spawner';

const words: GameItem[] = ['さくら', 'ねこ', 'いぬ', 'やま', 'かわ'].map((w) => ({
  text: w,
  reading: w,
  en: w,
}));

function newRun(items: readonly GameItem[] = words, difficulty = DIFFICULTY.normal): Run {
  return new Run({ config: difficulty, mode: 'challenge', items, random: seededRandom(1) });
}

/** Advances the run in 50 ms frames. */
function play(run: Run, seconds: number): RunEvent[] {
  const events: RunEvent[] = [];
  for (let t = 0; t < seconds; t += 0.05) {
    run.step(0.05);
    events.push(...run.drain());
  }
  return events;
}

describe('spawner', () => {
  it('does not repeat an item within the window', () => {
    const recent: number[] = [];
    const random = seededRandom(7);
    const picks = Array.from({ length: 200 }, () => pickItem(40, recent, random));
    for (let i = 15; i < picks.length; i++) {
      expect(picks.slice(i - 15, i)).not.toContain(picks[i]);
    }
  });

  it('still varies short pools', () => {
    const recent: number[] = [];
    const random = seededRandom(3);
    const picks = Array.from({ length: 20 }, () => pickItem(3, recent, random));
    picks.slice(1).forEach((pick, i) => expect(pick).not.toBe(picks[i]));
  });

  it('balances sides and finds free lanes', () => {
    const random = () => 0;
    expect(pickSide({ left: 3, right: 1 }, random)).toBe('right');
    expect(pickSide({ left: 1, right: 3 }, random)).toBe('left');
    expect(pickSide({ left: 2, right: 1 }, random)).toBe('left');
    expect(pickLane(3, new Set([0, 2]), random)).toBe(1);
    expect(pickLane(2, new Set([0, 1]), random)).toBeNull();
  });
});

describe('Run', () => {
  it('spawns at once, then every spawn interval, up to the bubble cap', () => {
    const run = newRun();
    run.step(0.01);
    expect(run.bubbles).toHaveLength(1);
    play(run, 2.05);
    expect(run.bubbles).toHaveLength(2);
    play(run, 8);
    expect(run.bubbles.length).toBe(DIFFICULTY.normal.maxBubbles);
    expect(new Set(run.bubbles.map((b) => b.lane)).size).toBe(run.bubbles.length);
    run.bubbles.forEach((b) => expect(b.lane).toBeLessThan(LANES));
  });

  it('gives longer readings more time to cross', () => {
    const run = newRun([{ text: 'さくら', reading: 'さくら' }]);
    run.step(0.01);
    expect(run.bubbles[0]?.duration).toBeCloseTo(10 + 0.8 * 2);
  });

  it('pops a bubble typed in full and fills it kana by kana', () => {
    const run = newRun([{ text: 'さくら', reading: 'さくら' }]);
    run.step(0.01);
    run.drain();
    for (const key of 'saku') run.type(key);
    const bubble = run.target;
    expect(bubble).toMatchObject({ kana: 2, pending: '', typed: 'saku' });
    for (const key of 'ra') run.type(key);
    expect(run.stats.popped).toBe(1);
    expect(run.bubbles).toHaveLength(0);
    expect(run.target).toBeNull();
    expect(run.drain().at(-1)).toMatchObject({ type: 'pop' });
  });

  it('ignores wrong keys, resets the combo and counts misses on the target', () => {
    const run = newRun([{ text: 'ねこ', reading: 'ねこ' }]);
    run.step(0.01);
    run.type('q');
    expect(run.stats).toMatchObject({ wrongKeys: 1, correctKeys: 0 });
    run.type('n');
    run.type('e');
    run.type('x');
    expect(run.target?.misses).toBe(1);
    expect(run.target?.typed).toBe('ne');
    expect(run.stats.combo).toBe(0);
    expect(run.stats.maxCombo).toBe(2);
    expect(run.lives).toBe(DIFFICULTY.normal.lives);
  });

  it('ignores keys that are not romaji', () => {
    const run = newRun();
    run.step(0.01);
    run.type(' ');
    run.type('1');
    expect(run.stats.wrongKeys).toBe(0);
  });

  it('backspace removes pending romaji, then releases the target', () => {
    const run = newRun([{ text: 'さくら', reading: 'さくら' }]);
    run.step(0.01);
    for (const key of 'sak') run.type(key);
    run.backspace();
    expect(run.target).toMatchObject({ typed: 'sa', kana: 1, pending: '' });
    run.backspace();
    expect(run.target).toBeNull();
    expect(run.bubbles[0]).toMatchObject({ typed: '', kana: 0 });
  });

  it('loses a life when a bubble crosses and fails at zero lives', () => {
    const run = newRun(words, { ...DIFFICULTY.normal, lives: 2 });
    const events = play(run, 30);
    expect(events.filter((e) => e.type === 'miss').length).toBe(2);
    expect(run.lives).toBe(0);
    expect(run.status).toBe('failed');
    expect(events.at(-1)).toEqual({ type: 'end', status: 'failed' });
  });

  it('clears the challenge when the timer runs out with lives left', () => {
    const run = newRun(words, { ...DIFFICULTY.normal, challengeTime: 5 });
    play(run, 6);
    expect(run.status).toBe('cleared');
    expect(run.remaining).toBe(0);
  });

  it('costs a life every 5 wrong keys on Extreme only', () => {
    const extreme = newRun(words, DIFFICULTY.extreme);
    extreme.step(0.01);
    for (let i = 0; i < 10; i++) extreme.type('q');
    expect(extreme.lives).toBe(DIFFICULTY.extreme.lives - 2);
    const normal = newRun();
    normal.step(0.01);
    for (let i = 0; i < 10; i++) normal.type('q');
    expect(normal.lives).toBe(DIFFICULTY.normal.lives);
  });

  it('targets the bubble closest to its exit on a tie', () => {
    const run = newRun([
      { text: 'さくら', reading: 'さくら' },
      { text: 'さかな', reading: 'さかな' },
    ]);
    play(run, 2.1);
    const [older, newer] = run.bubbles;
    run.type('s');
    expect(run.target).toBe(older);
    expect(newer).toBeDefined();
  });

  it('moves the target while no kana is typed yet, then locks it', () => {
    const run = newRun([
      { text: 'くるま', reading: 'くるま' },
      { text: 'きた', reading: 'きた' },
    ]);
    play(run, 2.1);
    const [kuruma, kita] = run.bubbles;
    run.type('k');
    expect(run.target).toBe(kuruma);
    run.type('i');
    expect(run.target).toBe(kita);
    expect(run.target).toMatchObject({ typed: 'ki', kana: 1 });
    expect(kuruma).toMatchObject({ typed: '', kana: 0 });
    expect(run.stats).toMatchObject({ correctKeys: 2, wrongKeys: 0 });
    run.type('u');
    expect(run.target).toBe(kita);
    expect(run.stats.wrongKeys).toBe(1);
  });

  it('ignores a huge frame step after a stalled tab', () => {
    const run = newRun();
    run.step(60);
    expect(run.elapsed).toBeCloseTo(0.1);
  });

  it('stops after the end and on quit', () => {
    const run = newRun();
    run.step(0.01);
    run.quit();
    expect(run.status).toBe('quit');
    run.step(1);
    expect(run.elapsed).toBeCloseTo(0.01);
  });
});

describe('Run in endless mode', () => {
  const easy: GameItem[] = ['あ', 'い', 'う'].map((k) => ({ text: k, reading: k }));
  const normal: GameItem[] = ['ねこ', 'いぬ', 'やま'].map((w) => ({ text: w, reading: w }));
  const config = { ...DIFFICULTY.easy, lives: 1000 };
  const endless = (pools: Record<string, GameItem[]>) =>
    new Run({
      config,
      mode: 'endless',
      difficulty: 'easy',
      items: easy,
      pools,
      random: seededRandom(2),
    });

  it('never ends on time and levels up every two minutes', () => {
    const run = endless({ normal });
    const events = play(run, 250);
    expect(run.status).toBe('playing');
    expect(events.filter((e) => e.type === 'level')).toEqual([
      { type: 'level', level: 2 },
      { type: 'level', level: 3 },
    ]);
    expect(run.level).toBe(3);
  });

  it('spawns longer items from level 3 on, faster', () => {
    const run = endless({ normal });
    const events = play(run, 245);
    const spawned = events.flatMap((e) => (e.type === 'spawn' ? [e.bubble] : []));
    const late = spawned.filter((b) => normal.includes(b.item));
    expect(late.length).toBeGreaterThan(0);
    expect(spawned.filter((b) => b.item.text.length === 1).length).toBeGreaterThan(0);
    const last = late.at(-1);
    expect(last?.duration).toBeCloseTo(12 * 0.88 ** 2);
  });

  it('keeps the chosen pool when no longer list exists yet', () => {
    const run = endless({});
    const events = play(run, 245);
    const spawned = events.flatMap((e) => (e.type === 'spawn' ? [e.bubble.item] : []));
    expect(spawned.every((item) => easy.includes(item))).toBe(true);
  });
});

describe('filledChars', () => {
  it('fills kana text kana by kana', () => {
    const item = { text: 'さくら', reading: 'さくら' };
    expect([0, 1, 2, 3].map((k) => filledChars(item, k))).toEqual([0, 1, 2, 3]);
  });

  it('skips spaces and punctuation', () => {
    const item = { text: 'みずを ください。', reading: 'みずをください' };
    expect(filledChars(item, 3)).toBe(3);
    expect(filledChars(item, 4)).toBe(5);
    expect(filledChars(item, 7)).toBe(9);
  });

  it('fills kanji text in proportion to the reading', () => {
    const item = { text: '日本', reading: 'にほん' };
    expect([0, 1, 2, 3].map((k) => filledChars(item, k))).toEqual([0, 0, 1, 2]);
  });
});

describe('Run results data', () => {
  it('samples keys per second and closes a partial last second', () => {
    const run = newRun();
    run.step(0.01);
    const first = run.bubbles[0];
    if (!first) throw new Error('no bubble');
    run.type('q');
    for (const key of romajiOf(first.item.reading)) run.type(key);
    play(run, 1.5);
    run.quit();
    expect(run.samples.length).toBe(2);
    expect(run.samples[0]?.wrong).toBe(1);
    expect(run.samples[0]?.seconds).toBe(1);
    expect(run.samples[1]?.seconds).toBeCloseTo(0.51, 1);
    expect(run.samples.reduce((sum, s) => sum + s.correct, 0)).toBe(run.stats.correctKeys);
  });

  it('logs popped and missed items in order', () => {
    const run = newRun();
    run.step(0.01);
    const first = run.bubbles[0];
    if (!first) throw new Error('no bubble');
    for (const key of romajiOf(first.item.reading)) run.type(key);
    play(run, 25);
    expect(run.log[0]).toEqual({ item: first.item, popped: true });
    expect(run.log.some((entry) => !entry.popped)).toBe(true);
    expect(run.log.filter((entry) => entry.popped)).toHaveLength(run.stats.popped);
  });

  it('times each kana unit from when it could start and counts kana', () => {
    const items: GameItem[] = [{ text: 'しゃしん', reading: 'しゃしん' }];
    const run = newRun(items);
    run.step(0.01);
    play(run, 0.4);
    for (const key of 'sha') run.type(key);
    play(run, 0.2);
    for (const key of 'shin') run.type(key);
    expect(run.kanaTimes.map((time) => time.kana)).toEqual(['しゃ', 'し', 'ん']);
    expect(run.kanaTimes[0]?.seconds).toBeCloseTo(0.4, 1);
    expect(run.kanaTimes[1]?.seconds).toBeCloseTo(0.2, 1);
    expect(run.stats.kana).toBe(4);
  });
});

/** Hepburn romaji for the test words. */
function romajiOf(reading: string): string {
  const table: Record<string, string> = {
    さくら: 'sakura',
    ねこ: 'neko',
    いぬ: 'inu',
    やま: 'yama',
    かわ: 'kawa',
  };
  return table[reading] ?? '';
}
