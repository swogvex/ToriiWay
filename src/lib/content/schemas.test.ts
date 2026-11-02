import { describe, expect, it } from 'vitest';

import {
  jlptMondaiSchema,
  kanaSchema,
  kanaScriptSchema,
  kanjivgStrokes,
  librarySchema,
} from './schemas';

const book = {
  title: 'Example book',
  author: 'Example author',
  level: ['N5'],
  categories: ['grammar'],
  resources: { audio: true, exercises: false },
  editions: ['en'],
  link: { kind: 'official', url: 'https://example.com/book' },
  license: 'All rights reserved — linked to publisher',
  coverKanji: '法',
};

describe('librarySchema', () => {
  it('accepts an official link with any license', () => {
    expect(librarySchema.safeParse(book).success).toBe(true);
  });

  it('rejects an own PDF whose license does not allow sharing', () => {
    const result = librarySchema.safeParse({ ...book, link: { ...book.link, kind: 'own-pdf' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['license']);
  });

  it('accepts an own PDF under a shareable license', () => {
    const entry = { ...book, link: { ...book.link, kind: 'own-pdf' }, license: 'CC BY 4.0' };
    expect(librarySchema.safeParse(entry).success).toBe(true);
  });

  it('rejects unknown fields and non-https links', () => {
    expect(librarySchema.safeParse({ ...book, extra: 1 }).success).toBe(false);
    expect(
      librarySchema.safeParse({ ...book, link: { kind: 'official', url: 'http://example.com' } })
        .success,
    ).toBe(false);
  });
});

describe('jlptMondaiSchema', () => {
  const mondai = {
    level: 'N5',
    section: 'vocabulary',
    mondai: 2,
    instruction: { en: 'Choose the best answer.', ja: 'いちばん いい ものを えらんで ください。' },
    subArea: 'vocabulary',
    questions: [
      {
        id: 'n5-voc-2-0001',
        stem: 'Example stem',
        choices: ['a', 'b', 'c'],
        answer: 2,
        explanation: { en: 'Because b.' },
        author: 'claude',
      },
    ],
  };

  it('accepts a valid mondai and fills defaults', () => {
    const result = jlptMondaiSchema.parse(mondai);
    expect(result.questions[0]?.tags).toEqual([]);
    expect(result.questions[0]?.audio).toBeNull();
  });

  it('rejects an answer beyond the number of choices', () => {
    const question = { ...mondai.questions[0], answer: 4 };
    const result = jlptMondaiSchema.safeParse({ ...mondai, questions: [question] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['questions', 0, 'answer']);
  });
});

describe('kanaSchema', () => {
  const ka = {
    char: 'か',
    romaji: 'ka',
    variants: ['ka'],
    row: 'k',
    vowel: 'a',
    group: 'gojuon',
    strokes: 3,
    mnemonic: { en: 'A blade with a spark.' },
    examples: [{ word: 'かさ', reading: 'kasa', en: 'umbrella' }],
  };

  const paths = (entry: unknown) =>
    kanaSchema.safeParse(entry).error?.issues.map((issue) => issue.path.join('.')) ?? [];

  it('accepts a valid basic kana', () => {
    expect(kanaSchema.safeParse(ka).success).toBe(true);
  });

  it('counts strokes from KanjiVG, adding both glyphs of a yōon', () => {
    expect(kanjivgStrokes('か')).toBe(3);
    expect(kanjivgStrokes('きゃ')).toBe(7);
    expect(kanjivgStrokes('A')).toBeUndefined();
    expect(paths({ ...ka, strokes: 4 })).toEqual(['strokes']);
  });

  it('needs the romaji among the variants', () => {
    expect(paths({ ...ka, variants: ['ca'] })).toEqual(['variants']);
  });

  it('needs a mnemonic and an example for basic kana only', () => {
    expect(paths({ ...ka, mnemonic: undefined, examples: [] })).toEqual(['mnemonic', 'examples']);
    const ga = { ...ka, char: 'が', romaji: 'ga', variants: ['ga'], row: 'g', group: 'dakuten' };
    expect(paths({ ...ga, strokes: 5, mnemonic: undefined, examples: [] })).toEqual([]);
  });

  it('rejects an example that does not contain the kana', () => {
    const examples = [{ word: 'いぬ', reading: 'inu', en: 'dog' }];
    expect(paths({ ...ka, examples })).toEqual(['examples.0.word']);
  });
});

describe('kanaScriptSchema', () => {
  const kana = (char: string, row: string, vowel: string, group: string) => ({
    char,
    romaji: 'x',
    variants: ['x'],
    row,
    vowel,
    group,
    strokes: kanjivgStrokes(char),
    mnemonic: { en: 'Mnemonic.' },
    examples: [{ word: char, reading: 'x', en: 'x' }],
  });

  const messages = (items: unknown[], script = 'hiragana') =>
    kanaScriptSchema.safeParse({ script, items }).error?.issues.map((issue) => issue.message) ?? [];

  it('reports duplicates, the wrong script and incomplete groups', () => {
    const result = messages([
      kana('か', 'k', 'a', 'gojuon'),
      kana('か', 'k', 'i', 'gojuon'),
      kana('キ', 'k', 'u', 'gojuon'),
    ]);
    expect(result).toContain('duplicates items[0] (か)');
    expect(result).toContain('キ is not hiragana');
    expect(result).toContain('expected 46 gojuon kana, found 3');
    expect(result).toContain('expected 33 yoon kana, found 0');
  });
});
