import { describe, expect, it } from 'vitest';

import { librarySchema } from '../content/schemas';
import {
  bookMarkdown,
  isCoverKanji,
  isHttpsUrl,
  type NewBook,
  parseCategories,
  parseEditions,
  parseLevels,
  parseYesNo,
  slugify,
} from './add';

describe('library:add helpers', () => {
  it('makes plain ASCII slugs', () => {
    expect(slugify('Kanji para recordar 1 / Remembering the Kanji 1')).toBe(
      'kanji-para-recordar-1-remembering-the-kanji-1',
    );
    expect(slugify('Gramática Básica: ¡Japonés!')).toBe('gramatica-basica-japones');
  });

  it('parses lists in any case and order, and rejects unknown values', () => {
    expect(parseLevels('n4, kana N5')).toEqual(['kana', 'N5', 'N4']);
    expect(parseLevels('N6')).toBeNull();
    expect(parseLevels('')).toBeNull();
    expect(parseCategories('Grammar jlpt')).toEqual(['grammar', 'jlpt']);
    expect(parseEditions('es en')).toEqual(['en', 'es']);
  });

  it('reads yes/no in Spanish or English', () => {
    expect(parseYesNo('sí')).toBe(true);
    expect(parseYesNo('Y')).toBe(true);
    expect(parseYesNo('no')).toBe(false);
    expect(parseYesNo('quizá')).toBeNull();
  });

  it('checks URLs and cover characters', () => {
    expect(isHttpsUrl('https://example.org/book')).toBe(true);
    expect(isHttpsUrl('http://example.org')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
    expect(isCoverKanji('覚')).toBe(true);
    expect(isCoverKanji('覚え')).toBe(false);
    expect(isCoverKanji('')).toBe(false);
  });

  it('writes a file the library schema accepts', () => {
    const book: NewBook = {
      title: "Kanji 'fácil'",
      author: 'Someone',
      levels: ['N5'],
      categories: ['kanji'],
      audio: false,
      exercises: true,
      editions: ['es'],
      url: 'https://example.org/book',
      license: 'All rights reserved — linked to the publisher',
      coverKanji: '字',
      featured: false,
      description: 'A short original description.',
    };
    const markdown = bookMarkdown(book);
    const [, front = ''] = markdown.split('---\n');
    // A tiny YAML reader for this exact format is enough to check the shape.
    const data: Record<string, unknown> = {};
    let nested: Record<string, unknown> | null = null;
    for (const line of front.trimEnd().split('\n')) {
      const indented = line.startsWith('  ');
      const [key = '', ...rest] = line.trim().split(': ');
      const raw = rest.join(': ');
      const value: unknown =
        raw === ''
          ? {}
          : raw.startsWith('[')
            ? raw.slice(1, -1).split(', ')
            : raw === 'true' || raw === 'false'
              ? raw === 'true'
              : raw.startsWith("'")
                ? raw.slice(1, -1).replaceAll("''", "'")
                : raw;
      if (indented && nested) nested[key.replace(/:$/, '')] = value;
      else {
        const name = key.replace(/:$/, '');
        data[name] = value;
        nested = raw === '' ? (data[name] as Record<string, unknown>) : null;
      }
    }
    const parsed = librarySchema.safeParse(data);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(markdown.trimEnd().endsWith('A short original description.')).toBe(true);
  });
});
