import { describe, expect, it } from 'vitest';

import { matches, normalize } from './search';

describe('search matching', () => {
  it('folds case, width and accents', () => {
    expect(normalize('Vídeos')).toBe('videos');
    expect(normalize('ｶﾀｶﾅ')).toBe('カタカナ');
  });

  it('keeps dakuten apart', () => {
    expect(normalize('がんば')).toBe('がんば');
    expect(matches('か', 'が')).toBe(false);
  });

  it('matches English, Spanish, romaji, kana and kanji keywords', () => {
    const learn = 'Learn learn study aprender kana hiragana 学 まなぶ manabu';
    for (const query of ['learn', 'APRENDER', 'manabu', 'まなぶ', '学', 'hira']) {
      expect(matches(query, learn)).toBe(true);
    }
    expect(matches('library', learn)).toBe(false);
  });

  it('needs every word of the query', () => {
    expect(matches('kana study', 'learn study kana')).toBe(true);
    expect(matches('kana exam', 'learn study kana')).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(matches('  ', 'anything')).toBe(true);
  });
});
