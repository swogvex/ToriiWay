import { describe, expect, it } from 'vitest';

import {
  gameListSchema,
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
  const question = {
    id: 'n5-voc-2-0001',
    stem: 'きのう　__ともだち__と　えいがを　みました。',
    choices: ['友逹', '友達', '支達', '反達'],
    answer: 2,
    explanation: { en: 'Because b.', es: 'Porque b.' },
    author: 'claude',
  };
  const mondai = {
    level: 'N5',
    section: 'vocabulary',
    mondai: 2,
    instruction: { en: 'Choose the best answer.', ja: 'いちばん いい ものを えらんで ください。' },
    questions: [question],
  };

  const issues = (entry: unknown) =>
    jlptMondaiSchema
      .safeParse(entry)
      .error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];

  it('accepts a valid mondai and fills defaults', () => {
    const result = jlptMondaiSchema.parse(mondai);
    expect(result.questions[0]?.tags).toEqual([]);
    expect(result.questions[0]?.audio).toBeNull();
    expect(result.passages).toEqual([]);
  });

  it('rejects a mondai the level does not have', () => {
    expect(issues({ ...mondai, mondai: 5 })).toEqual(['mondai: N5 vocabulary has no mondai 5']);
    expect(issues({ ...mondai, section: 'hiragana' })[0]).toMatch(/^mondai:/);
  });

  it('checks IDs, choices and the answer', () => {
    const bad = [
      { ...question, id: 'n5-voc-3-0001' },
      { ...question, id: 'n5-voc-2-0002', choices: ['a', 'b', 'c'] },
      { ...question, id: 'n5-voc-2-0003', choices: ['a', 'b', 'a ', 'c'] },
      { ...question, id: 'n5-voc-2-0004', answer: 4, choices: ['a', 'b', 'c'] },
    ];
    expect(issues({ ...mondai, questions: bad })).toEqual([
      'questions.0.id: ID must start with n5-voc-2-',
      'questions.1.choices: orthography needs 4 choices',
      'questions.2.choices: Choices must differ',
      'questions.3.choices: orthography needs 4 choices',
      'questions.3.answer: answer 4 is out of range for 3 choices',
    ]);
    expect(issues({ ...mondai, questions: [question, question] })).toEqual([
      'questions.1.id: Duplicate ID n5-voc-2-0001',
    ]);
  });

  it('requires a Spanish explanation', () => {
    const entry = { ...mondai, questions: [{ ...question, explanation: { en: 'Because b.' } }] };
    expect(issues(entry)[0]).toMatch(/^questions\.0\.explanation\.es:/);
  });

  it('requires audio on listening questions only', () => {
    const tts = { script: 'おとこのひと：こんにちは。', voices: ['male'] };
    const listening = {
      ...mondai,
      section: 'listening',
      mondai: 3,
      questions: [{ ...question, id: 'n5-lis-3-0001', choices: ['a', 'b', 'c'] }],
    };
    expect(issues(listening)).toEqual(['questions.0.tts: Listening questions need audio or tts']);
    const withTts = { ...listening, questions: [{ ...listening.questions[0], tts }] };
    expect(issues(withTts)).toEqual([]);
    expect(issues({ ...mondai, questions: [{ ...question, tts }] })).toEqual([
      'questions.0.tts: orthography questions have no audio',
    ]);
  });

  it('links reading questions to passages of the right size', () => {
    const reading = (id: string) => ({ ...question, id, passage: 'park' });
    const entry = {
      ...mondai,
      section: 'grammar-reading',
      mondai: 5,
      passages: [{ id: 'park', text: 'こうえんに いきました。' }],
      questions: [reading('n5-grm-5-0001'), reading('n5-grm-5-0002')],
    };
    expect(issues(entry)).toEqual([]);
    expect(issues({ ...entry, questions: [reading('n5-grm-5-0001')] })).toEqual([
      'passages.0: passage park has 1 questions; mid-passage needs 2',
    ]);
    const lost = { ...entry.questions[1], passage: 'lake' };
    expect(issues({ ...entry, questions: [entry.questions[0], lost] })).toContain(
      'questions.1.passage: Expected the ID of a passage in this file',
    );
    expect(issues({ ...mondai, questions: [{ ...question, passage: 'park' }] })).toEqual([
      'questions.0.passage: orthography questions do not use passages',
    ]);
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

describe('gameListSchema', () => {
  const words = ['さくら', 'ねこ', 'いぬ', 'やま', 'かわ', 'うみ', 'そら', 'はな'];
  const items = [...words, ...words.map((word) => word + 'た')].map((word) => ({
    text: word,
    reading: word,
    en: 'meaning',
  }));
  const list = { script: 'hiragana', difficulty: 'normal', items };
  const issuePaths = (input: unknown) =>
    gameListSchema.safeParse(input).error?.issues.map((issue) => issue.path.join('.'));

  it('accepts a valid kana list', () => {
    expect(gameListSchema.safeParse(list).success).toBe(true);
  });

  it('needs more items than the repeat window', () => {
    expect(gameListSchema.safeParse({ ...list, items: items.slice(1) }).success).toBe(false);
  });

  it('allows spaces and punctuation in the text only', () => {
    const sentences = items.map((item) => ({
      text: `きょうは ${item.text}。`,
      reading: `きょうは${item.reading}`,
      en: 'Today…',
    }));
    expect(
      gameListSchema.safeParse({ ...list, difficulty: 'extreme', items: sentences }).success,
    ).toBe(true);
  });

  it('checks the kana length per difficulty', () => {
    const long = { text: 'ありがとう', reading: 'ありがとう', en: 'thanks' };
    expect(issuePaths({ ...list, items: [...items.slice(1), long] })).toEqual(['items.15.reading']);
  });

  it('rejects a reading its own romaji hint cannot complete', () => {
    const kanji = items.map((item) => ({ ...item, text: '山' + item.text }));
    const odd = { text: '居る', reading: 'ゐる', en: 'old spelling' };
    expect(issuePaths({ script: 'kanji', difficulty: 'hard', items: [...kanji, odd] })).toEqual([
      'items.16.reading',
    ]);
  });

  it('rejects a text that differs from the reading', () => {
    const wrong = { text: 'さくら', reading: 'さくろ', en: 'x' };
    expect(issuePaths({ ...list, items: [...items.slice(1), wrong] })).toEqual(['items.15.text']);
  });

  it('rejects duplicates, katakana in hiragana lists and Easy kana files', () => {
    expect(issuePaths({ ...list, items: [...items.slice(1), items[0], items[0]] })).toEqual([
      'items.16',
    ]);
    const katakana = { text: 'ネコ', reading: 'ネコ', en: 'cat' };
    expect(issuePaths({ ...list, items: [...items.slice(1), katakana] })).toEqual([
      'items.15.reading',
    ]);
    expect(issuePaths({ ...list, difficulty: 'easy' })).toEqual(['difficulty']);
  });

  it('only accepts kana readings, also for kanji lists', () => {
    const kanji = items.map((item) => ({ ...item, text: '桜' }));
    kanji.forEach((item, index) => (item.text = `桜${index}`));
    expect(gameListSchema.safeParse({ ...list, script: 'kanji', items: kanji }).success).toBe(true);
    const romaji = [...kanji.slice(1), { text: '桜', reading: 'sakura', en: 'x' }];
    expect(issuePaths({ ...list, script: 'kanji', items: romaji })).toEqual(['items.15.reading']);
  });
});
