import { describe, expect, it } from 'vitest';

import { errorSeconds, slowestKana, summarize, wordList, wpmSeries } from './summary';

const sample = (correct: number, wrong = 0, seconds = 1) => ({ correct, wrong, seconds });

describe('summarize', () => {
  it('rounds every number on the results screen', () => {
    const summary = summarize({
      stats: {
        correctKeys: 263,
        wrongKeys: 17,
        popped: 41,
        missed: 3,
        kana: 130,
        combo: 0,
        maxCombo: 30,
      },
      elapsed: 150,
      samples: [sample(4), sample(4), sample(4, 0, 0.4)],
    });
    expect(summary).toEqual({
      wpm: 21,
      raw: 22,
      accuracy: 94,
      consistency: 100,
      kpm: 52,
      time: 150,
      popped: 41,
      missed: 3,
    });
  });

  it('measures consistency on full seconds only', () => {
    const steady = summarize({
      stats: { correctKeys: 0, wrongKeys: 0, popped: 0, missed: 0, kana: 0, combo: 0, maxCombo: 0 },
      elapsed: 3,
      samples: [sample(5), sample(5), sample(0, 0, 0.2)],
    });
    expect(steady.consistency).toBe(100);
  });
});

describe('chart series', () => {
  it('is the WPM so far at the end of each second', () => {
    expect(wpmSeries([sample(5), sample(15), sample(1, 0, 0.5)]).map(Math.round)).toEqual([60, 120, 101]);
  });

  it('marks seconds with wrong keys', () => {
    expect(errorSeconds([sample(3), sample(2, 1), sample(1), sample(0, 2)])).toEqual([1, 3]);
  });
});

describe('slowestKana', () => {
  it('ranks by average time and skips a lone long-vowel mark', () => {
    const times = [
      { kana: 'か', seconds: 0.2 },
      { kana: 'しゃ', seconds: 0.9 },
      { kana: 'ー', seconds: 3 },
      { kana: 'か', seconds: 0.4 },
      { kana: 'を', seconds: 0.6 },
      { kana: 'づ', seconds: 0.7 },
    ];
    expect(slowestKana(times)).toEqual(['しゃ', 'づ', 'を']);
  });
});

describe('wordList', () => {
  it('lists each item once in first-seen order with its counts', () => {
    const neko = { text: 'ねこ', reading: 'ねこ' };
    const yama = { text: 'やま', reading: 'やま' };
    const list = wordList([
      { item: neko, popped: true },
      { item: yama, popped: false },
      { item: neko, popped: true },
    ]);
    expect(list).toEqual([
      { item: neko, popped: 2, missed: 0 },
      { item: yama, popped: 0, missed: 1 },
    ]);
  });
});
