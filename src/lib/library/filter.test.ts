import { describe, expect, it } from 'vitest';

import {
  type BookFacts,
  compareBooks,
  EMPTY_STATE,
  fold,
  matches,
  searchFromState,
  stateFromSearch,
} from './filter';

const book = (over: Partial<BookFacts>): BookFacts => ({
  slug: 'x',
  title: 'X',
  levels: ['N5'],
  categories: ['grammar'],
  audio: false,
  exercises: false,
  editions: ['ja'],
  featured: false,
  text: 'x',
  ...over,
});

describe('library URL state', () => {
  it('round-trips and leaves defaults out', () => {
    expect(searchFromState(EMPTY_STATE)).toBe('');
    const search = '?level=N5,N4&category=grammar&resources=audio,es&q=kanji&sort=az';
    expect(searchFromState(stateFromSearch(search))).toBe(search);
  });

  it('drops unknown values', () => {
    expect(stateFromSearch('?level=N9,N5&category=magic&sort=newest&resources=pdf')).toEqual({
      ...EMPTY_STATE,
      levels: ['N5'],
    });
  });
});

describe('matches', () => {
  const genki = book({
    levels: ['N5', 'N4'],
    categories: ['grammar', 'kanji'],
    audio: true,
    editions: ['ja', 'en'],
    text: fold('GENKI The Japan Times grammar kanji beginner'),
  });
  const kanjiEs = book({
    levels: ['N5', 'N1'],
    categories: ['kanji'],
    editions: ['es', 'en'],
    text: fold('Kanji para recordar Heisig — método japonés'),
  });

  it('ORs within a group and ANDs across groups', () => {
    const state = { ...EMPTY_STATE, levels: ['N4', 'N1'] as const, categories: ['kanji'] as const };
    expect(
      matches(genki, { ...state, levels: [...state.levels], categories: [...state.categories] }),
    ).toBe(true);
    expect(matches(genki, { ...EMPTY_STATE, levels: ['N1'] })).toBe(false);
    expect(matches(genki, { ...EMPTY_STATE, levels: ['N5'], categories: ['reading'] })).toBe(false);
  });

  it('requires every chosen resource and edition', () => {
    expect(matches(kanjiEs, { ...EMPTY_STATE, resources: ['es'] })).toBe(true);
    expect(matches(kanjiEs, { ...EMPTY_STATE, resources: ['es', 'en'] })).toBe(true);
    expect(matches(genki, { ...EMPTY_STATE, resources: ['es'] })).toBe(false);
    expect(matches(genki, { ...EMPTY_STATE, resources: ['audio', 'en'] })).toBe(true);
  });

  it('searches every word, ignoring case and accents', () => {
    expect(matches(kanjiEs, { ...EMPTY_STATE, query: 'JAPONES heisig' })).toBe(true);
    expect(matches(kanjiEs, { ...EMPTY_STATE, query: 'heisig genki' })).toBe(false);
  });
});

describe('compareBooks', () => {
  const books = [
    book({ slug: 'b', title: 'Beta', levels: ['N3'] }),
    book({ slug: 'a', title: 'Alpha', levels: ['N1'], featured: true }),
    book({ slug: 'c', title: 'Gamma', levels: ['kana'] }),
  ];
  const order = (sort: Parameters<typeof compareBooks>[0]) =>
    [...books].sort(compareBooks(sort)).map((b) => b.slug);

  it('recommended: featured, then easiest level, then title', () => {
    expect(order('recommended')).toEqual(['a', 'c', 'b']);
  });

  it('A–Z and level', () => {
    expect(order('az')).toEqual(['a', 'b', 'c']);
    expect(order('level')).toEqual(['c', 'b', 'a']);
  });
});
