import { describe, expect, it } from 'vitest';

import { canSearch, dictionaryUrl, pickMeaning, senseGlosses } from './client';

describe('canSearch', () => {
  it('accepts one Japanese character but needs two Latin ones', () => {
    expect(canSearch('一')).toBe(true);
    expect(canSearch('あ')).toBe(true);
    expect(canSearch('a')).toBe(false);
    expect(canSearch(' ab ')).toBe(true);
    expect(canSearch('   ')).toBe(false);
  });
});

describe('pickMeaning', () => {
  it('leads with English on English pages and adds the Spanish', () => {
    expect(pickMeaning(['one'], ['uno'], 'en')).toEqual({
      primary: ['one'],
      other: ['uno'],
      englishOnly: false,
    });
  });

  it('leads with Spanish on Spanish pages', () => {
    expect(pickMeaning(['one'], ['uno'], 'es').primary).toEqual(['uno']);
  });

  it('labels English when there is no Spanish', () => {
    expect(pickMeaning(['one'], [], 'es')).toEqual({
      primary: ['one'],
      other: [],
      englishOnly: true,
    });
  });
});

describe('senseGlosses', () => {
  it('flattens senses and drops repeats', () => {
    expect(
      senseGlosses([
        { pos: [], glossesEn: ['one', '1'], glossesEs: [] },
        { pos: [], glossesEn: [], glossesEs: ['uno', '1', 'uno'] },
      ]),
    ).toEqual({ en: ['one', '1'], es: ['uno', '1'] });
  });
});

describe('dictionaryUrl', () => {
  it('encodes the term', () => {
    expect(dictionaryUrl('/learn/search', '一 a&b')).toBe('/learn/search?q=%E4%B8%80+a%26b');
  });
});
