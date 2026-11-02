import { describe, expect, it } from 'vitest';

import { excerptParts, matches, normalize, pageHref } from './search';

describe('Pagefind results', () => {
  it('maps result URLs to the site links', () => {
    expect(pageHref('/')).toBe('/');
    expect(pageHref('/index.html')).toBe('/');
    expect(pageHref('/learn/hiragana/')).toBe('/learn/hiragana');
    expect(pageHref('/learn/hiragana.html')).toBe('/learn/hiragana');
    expect(pageHref('/es/learn/index.html#top')).toBe('/es/learn');
  });

  it('splits an excerpt into plain and marked runs', () => {
    expect(excerptParts('the <mark>torii</mark> gate')).toEqual([
      { text: 'the ', mark: false },
      { text: 'torii', mark: true },
      { text: ' gate', mark: false },
    ]);
  });

  it('decodes escaped text and drops any other tag', () => {
    expect(excerptParts('a &lt;b&gt; &amp; &#39;c&#x27; <img src=x onerror=alert(1)>')).toEqual([
      { text: "a <b> & 'c' ", mark: false },
    ]);
  });

  it('keeps kana untouched', () => {
    expect(excerptParts('<mark>ひらがな</mark>の表')).toEqual([
      { text: 'ひらがな', mark: true },
      { text: 'の表', mark: false },
    ]);
  });
});

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
