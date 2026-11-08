import { describe, expect, it } from 'vitest';

import { escapeLike, isEmptyQuery, parseQuery } from './search';
import { memoryDictionaryStore, trimSenses } from './store';

describe('parseQuery', () => {
  it('searches romaji both as a gloss and as kana', () => {
    expect(parseQuery('ichi').exact).toEqual(['ichi', 'いち']);
  });

  it('keeps English that cannot be kana as a gloss only', () => {
    expect(parseQuery('to meet').exact).toEqual(['meet']);
  });

  it('normalises Spanish accents and case', () => {
    expect(parseQuery('NÚMERO').exact[0]).toBe('numero');
  });

  it('adds the hiragana form of katakana input', () => {
    expect(parseQuery('イチ').exact).toEqual(['イチ', 'いち']);
  });

  it('lists each kanji typed', () => {
    expect(parseQuery('日本語').kanji).toEqual(['日', '本', '語']);
  });

  it('allows a prefix for one kanji but not for one kana or letter', () => {
    expect(parseQuery('一').prefix).toEqual(['一']);
    expect(parseQuery('あ').prefix).toEqual([]);
    expect(parseQuery('b').prefix).toEqual([]);
  });

  it('only runs partial matches from three characters', () => {
    expect(parseQuery('日本').partial).toEqual([]);
    expect(parseQuery('日本語').partial).toEqual(['日本語']);
  });

  it('treats a query with nothing searchable as empty', () => {
    expect(isEmptyQuery(parseQuery('(  )'))).toBe(true);
  });
});

describe('escapeLike', () => {
  it('matches wildcards literally', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });
});

describe('trimSenses', () => {
  const sense = (en: number, es: number) => ({
    pos: [],
    glossesEn: Array.from({ length: en }, () => 'x'),
    glossesEs: Array.from({ length: es }, () => 'y'),
  });

  it('keeps Spanish senses listed after many English ones', () => {
    const result = trimSenses([sense(1, 0), sense(1, 0), sense(1, 0), sense(1, 0), sense(0, 1)]);
    expect(result).toHaveLength(4);
    expect(result.at(-1)?.glossesEs).toEqual(['y']);
  });
});

describe('memoryDictionaryStore', () => {
  it.each(['ichi', '一', 'one', 'uno'])('finds 一 for %s', async (text) => {
    const result = await memoryDictionaryStore().search(parseQuery(text), 'en');
    expect(result.kanji[0]?.literal).toBe('一');
  });

  it('returns nothing for an unknown term', async () => {
    const result = await memoryDictionaryStore().search(parseQuery('zzz'), 'en');
    expect(result.counts).toEqual({ kanji: 0, words: 0 });
  });
});
