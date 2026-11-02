import { describe, expect, it } from 'vitest';

import { splitJapanese } from '../ja';
import { buildChart } from './chart';
import { GLYPH_ADVANCE, GLYPH_SIZE, glyphLayout } from './glyph';

const kana = (char: string, row: string, vowel: string, group = 'gojuon') => ({
  char,
  row,
  vowel,
  group,
});

describe('buildChart', () => {
  const items = [
    kana('や', 'y', 'a'),
    kana('ゆ', 'y', 'u'),
    kana('よ', 'y', 'o'),
    kana('な', 'n', 'a'),
    kana('ん', 'n', 'n'),
    kana('が', 'g', 'a', 'dakuten'),
    kana('ぱ', 'p', 'a', 'handakuten'),
    kana('きゃ', 'ky', 'a', 'yoon'),
    kana('きょ', 'ky', 'o', 'yoon'),
  ];

  it('leaves gaps where a row has no kana', () => {
    const { rows } = buildChart(items, 'gojuon');
    expect(rows[0]?.cells.map((cell) => cell?.char ?? null)).toEqual([
      'や',
      null,
      'ゆ',
      null,
      'よ',
    ]);
  });

  it('gives ん a row of its own after な', () => {
    const { rows } = buildChart(items, 'gojuon');
    expect(rows.map((row) => row.key)).toEqual(['y', 'n', 'nn']);
    expect(rows[2]?.cells[0]?.char).toBe('ん');
  });

  it('puts handakuten in the dakuten table and yōon in three columns', () => {
    expect(buildChart(items, 'dakuten').rows.map((row) => row.key)).toEqual(['g', 'p']);
    const yoon = buildChart(items, 'yoon');
    expect(yoon.columns).toEqual(['a', 'u', 'o']);
    expect(yoon.rows[0]?.cells.map((cell) => cell?.char ?? null)).toEqual(['きゃ', null, 'きょ']);
  });

  it('rejects a vowel outside the columns', () => {
    expect(() => buildChart([kana('きぃ', 'ky', 'i', 'yoon')], 'yoon')).toThrow(/vowel i/);
  });
});

describe('glyphLayout', () => {
  const glyphs = {
    き: {
      strokes: ['M1', 'M2'],
      numbers: [[1, 2] as [number, number], [3, 4] as [number, number]],
    },
    ゃ: { strokes: ['M3'], numbers: [[5, 6] as [number, number]] },
  };

  it('places the glyphs of a yōon side by side, one advance apart', () => {
    expect(glyphLayout('きゃ', glyphs)).toEqual({
      width: GLYPH_ADVANCE + GLYPH_SIZE,
      strokes: [
        { d: 'M1', x: 0 },
        { d: 'M2', x: 0 },
        { d: 'M3', x: GLYPH_ADVANCE },
      ],
      numbers: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5 + GLYPH_ADVANCE, y: 6 },
      ],
    });
  });

  it('returns undefined when a glyph is missing', () => {
    expect(glyphLayout('きょ', glyphs)).toBeUndefined();
  });
});

describe('splitJapanese', () => {
  it('separates Japanese runs from the rest', () => {
    expect(splitJapanese('So か is “ka” and カ too.')).toEqual([
      { text: 'So ', ja: false },
      { text: 'か', ja: true },
      { text: ' is “ka” and ', ja: false },
      { text: 'カ', ja: true },
      { text: ' too.', ja: false },
    ]);
  });

  it('keeps punctuation, the long-vowel mark and kanji in the run', () => {
    expect(splitJapanese('コーヒー、五十音。')).toEqual([{ text: 'コーヒー、五十音。', ja: true }]);
    expect(splitJapanese('no Japanese')).toEqual([{ text: 'no Japanese', ja: false }]);
  });
});
