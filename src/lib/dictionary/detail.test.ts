import { describe, expect, it } from 'vitest';

import { isKanjiParam, isWordParam, memoryDetailStore, parseFurigana, posKeys } from './detail';
import { parseKanjiVg, strokeNumbers } from './kanjivg';

describe('route parameters', () => {
  it('accepts exactly one kanji', () => {
    expect(isKanjiParam('一')).toBe(true);
    expect(isKanjiParam('𠮷')).toBe(true);
    expect(isKanjiParam('一二')).toBe(false);
    expect(isKanjiParam('あ')).toBe(false);
    expect(isKanjiParam(undefined)).toBe(false);
  });

  it('accepts only a plausible entry number', () => {
    expect(isWordParam('1160790')).toBe(true);
    expect(isWordParam('0')).toBe(false);
    expect(isWordParam('123456789')).toBe(false);
    expect(isWordParam('1;drop')).toBe(false);
  });
});

describe('parseFurigana', () => {
  it('splits ruby and plain text', () => {
    expect(parseFurigana('もう{会|あ}う。')).toEqual([
      { text: 'もう' },
      { text: '会', ruby: 'あ' },
      { text: 'う。' },
    ]);
  });

  it('keeps text without markup whole', () => {
    expect(parseFurigana('はい')).toEqual([{ text: 'はい' }]);
  });
});

describe('posKeys', () => {
  it('groups godan verbs, drops repeats and rare tags', () => {
    expect(posKeys(['v5u', 'v5k', 'vt', 'rare-tag'])).toEqual(['godan', 'transitive']);
  });
});

describe('parseKanjiVg', () => {
  const xml = `<kanji id="kvg:kanji_04e8c">
<g id="kvg:04e8c"><path id="kvg:04e8c-s2" d="M2,2"/><path id="kvg:04e8c-s1" kvg:type="x" d="M1,1"/></g>
</kanji>
<kanji id="kvg:kanji_00021"><g><path id="kvg:00021-s1" d="M9,9"/></g></kanji>`;

  it('sorts strokes and keeps only known kanji', () => {
    expect(parseKanjiVg(xml, new Set(['二']))).toEqual([
      { literal: '二', strokes: ['M1,1', 'M2,2'] },
    ]);
  });
});

describe('strokeNumbers', () => {
  it('places a number before the start of its stroke, inside the grid', () => {
    expect(strokeNumbers(['M50,40c1,1', 'M 1 200'])).toEqual([
      { x: 44, y: 38 },
      { x: 6, y: 103 },
    ]);
  });
});

describe('memoryDetailStore', () => {
  it('finds the sample and answers null for anything else', async () => {
    const store = memoryDetailStore();
    expect((await store.getKanji('一'))?.literal).toBe('一');
    expect(await store.getKanji('二')).toBeNull();
    expect((await store.getWord(1160790))?.readings).toEqual(['いち']);
    expect(await store.getWord(2)).toBeNull();
  });
});
