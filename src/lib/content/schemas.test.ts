import { describe, expect, it } from 'vitest';

import { jlptMondaiSchema, librarySchema } from './schemas';

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
