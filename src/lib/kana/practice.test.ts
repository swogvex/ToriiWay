import { describe, expect, it } from 'vitest';

import {
  KANA_STORAGE_KEY,
  localKanaProgress,
  parseProgress,
  type PracticeResult,
} from '../progress/kana';
import { buildRound, isCorrect, MAX_PROMPTS, MIN_PROMPTS, shuffle } from './practice';
import { pickJapaneseVoice } from './speech';

/** Deterministic random numbers in [0, 1) (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const kana = (char: string, romaji: string, variants = [romaji]) => ({ char, romaji, variants });
const row = [
  kana('か', 'ka'),
  kana('き', 'ki'),
  kana('く', 'ku'),
  kana('け', 'ke'),
  kana('こ', 'ko'),
];
const script = [
  ...row,
  kana('し', 'shi', ['shi', 'si']),
  kana('じ', 'ji', ['ji', 'zi']),
  kana('ぢ', 'ji', ['ji', 'di']),
  kana('つ', 'tsu', ['tsu', 'tu']),
];

describe('shuffle', () => {
  it('keeps every item', () => {
    expect(
      shuffle(row, seeded(1))
        .map((item) => item.char)
        .sort(),
    ).toEqual(row.map((item) => item.char).sort());
  });
});

describe('buildRound', () => {
  it('asks at least 10 prompts, repeating a short row without back-to-back repeats', () => {
    const round = buildRound(row, script, seeded(2));
    expect(round).toHaveLength(MIN_PROMPTS);
    round.slice(1).forEach((prompt, index) => {
      expect(prompt.kana).not.toBe(round[index]?.kana);
    });
    for (const item of row) expect(round.filter((p) => p.kana === item)).toHaveLength(2);
  });

  it('asks at most 20 prompts', () => {
    const many = Array.from({ length: 30 }, (_, index) => kana(`k${index}`, `r${index}`));
    expect(buildRound(many, many, seeded(3))).toHaveLength(MAX_PROMPTS);
  });

  it('offers four distinct choices with one right answer and no other spelling of it', () => {
    for (const prompt of buildRound([kana('じ', 'ji', ['ji', 'zi'])], script, seeded(4))) {
      expect(prompt.choices).toHaveLength(4);
      expect(new Set(prompt.choices).size).toBe(4);
      expect(prompt.choices.filter((choice) => choice === 'ji')).toHaveLength(1);
      expect(prompt.choices).not.toContain('zi');
    }
  });

  it('takes wrong choices from the chosen row before the rest of the script', () => {
    for (const prompt of buildRound(row, script, seeded(5))) {
      expect(
        prompt.choices.every((choice) => ['ka', 'ki', 'ku', 'ke', 'ko'].includes(choice)),
      ).toBe(true);
    }
  });

  it('returns no prompts for an empty selection', () => {
    expect(buildRound([], script)).toEqual([]);
  });
});

describe('isCorrect', () => {
  it('accepts any listed spelling, ignoring case and spaces', () => {
    const shi = kana('し', 'shi', ['shi', 'si']);
    expect(isCorrect(' SHI ', shi)).toBe(true);
    expect(isCorrect('si', shi)).toBe(true);
    expect(isCorrect('chi', shi)).toBe(false);
    expect(isCorrect('', shi)).toBe(false);
  });
});

describe('pickJapaneseVoice', () => {
  const voice = (lang: string, name: string) => ({ lang, name });

  it('prefers ja-JP and high-quality voices', () => {
    const voices = [
      voice('en-US', 'Samantha'),
      voice('ja', 'Generic'),
      voice('ja-JP', 'Kyoko'),
      voice('ja_JP', 'Microsoft Nanami Online (Natural)'),
    ];
    expect(pickJapaneseVoice(voices)?.name).toBe('Microsoft Nanami Online (Natural)');
    expect(pickJapaneseVoice(voices.slice(0, 3))?.name).toBe('Kyoko');
  });

  it('returns undefined without a Japanese voice', () => {
    expect(pickJapaneseVoice([voice('en-GB', 'Daniel')])).toBeUndefined();
  });
});

describe('localKanaProgress', () => {
  function fakeStorage(initial?: string) {
    const map = new Map<string, string>(initial ? [[KANA_STORAGE_KEY, initial]] : []);
    return {
      map,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  }

  it('stores learned kana and practice results', () => {
    const storage = fakeStorage();
    const progress = localKanaProgress(storage);
    progress.setLearned('か', true);
    progress.setLearned('き', true);
    progress.setLearned('か', false);
    expect([...progress.learned()]).toEqual(['き']);

    const result: PracticeResult = {
      script: 'hiragana',
      mode: 'type',
      rows: ['gojuon:k'],
      correct: 8,
      total: 10,
      date: '2026-11-02',
    };
    progress.addResult(result);
    expect(localKanaProgress(storage).results()).toEqual([result]);
  });

  it('keeps working in memory when storage throws', () => {
    const progress = localKanaProgress({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    progress.setLearned('あ', true);
    expect(progress.learned().has('あ')).toBe(true);
  });

  it('ignores malformed stored data', () => {
    expect(parseProgress('not json')).toEqual({ learned: [], results: [] });
    expect(parseProgress('{"learned":["か",3],"results":[{"bad":true}]}')).toEqual({
      learned: ['か'],
      results: [],
    });
  });
});
