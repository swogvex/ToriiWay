import { describe, expect, it } from 'vitest';

import { parseRuby, stripRuby } from './ruby';

describe('parseRuby', () => {
  it('attaches readings to the kanji run before them', () => {
    expect(parseRuby('一緒[いっしょ]に頑張[がんば]ろう')).toEqual([
      { text: '一緒', reading: 'いっしょ' },
      { text: 'に' },
      { text: '頑張', reading: 'がんば' },
      { text: 'ろう' },
    ]);
  });

  it('keeps plain text as one segment', () => {
    expect(parseRuby('ありがとう')).toEqual([{ text: 'ありがとう' }]);
  });

  it('strips readings', () => {
    expect(stripRuby('一緒[いっしょ]に頑張[がんば]ろう')).toBe('一緒に頑張ろう');
  });
});
