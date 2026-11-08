import { describe, expect, it } from 'vitest';

import { jlptIndex, mapExamples, mapKanji, mapWord } from './import-map';
import { glossTerm, kanjiChars, normalizeText, readingTerms, toHiraganaOnly } from './normalize';

describe('normalisation', () => {
  it('shifts katakana to hiragana and keeps the long mark', () => {
    expect(toHiraganaOnly('ラーメン')).toBe('らーめん');
  });

  it('drops Latin accents but never dakuten', () => {
    expect(normalizeText('  Número   UNO ')).toBe('numero uno');
    expect(normalizeText('がぱ')).toBe('がぱ');
  });

  it('keeps the searchable part of a gloss', () => {
    expect(glossTerm('to meet')).toBe('meet');
    expect(glossTerm('one (number)')).toBe('one');
    expect(glossTerm('(usu. in kana)')).toBeNull();
    expect(glossTerm('x'.repeat(65))).toBeNull();
  });

  it('expands kanjidic readings into the full form and the stem', () => {
    expect(readingTerms('ひと.つ')).toEqual(['ひとつ', 'ひと']);
    expect(readingTerms('-び')).toEqual(['び']);
    expect(readingTerms('イチ')).toEqual(['いち']);
  });

  it('lists the distinct kanji of a set of forms', () => {
    expect(kanjiChars(['一人', '一つ'])).toEqual(['一', '人']);
  });
});

describe('jlptIndex', () => {
  it('keeps the easiest level and skips items without a key', () => {
    const index = jlptIndex([
      { key: 1, level: 'N3' },
      { key: 1, level: 'N5' },
      { key: null, level: 'N1' },
    ]);
    expect([...index]).toEqual([[1, 5]]);
  });
});

describe('mapExamples', () => {
  const example = { ja: '一つ。', furigana: '{一|ひと}つ。', en: 'One.', tatoeba_id: 7 };

  it('shares a sentence between words and drops unknown words', () => {
    const { sentences, links } = mapExamples(
      [
        { level: 'N5', jmdict_id: 1, examples: [example] },
        { level: 'N4', jmdict_id: 2, examples: [example] },
        { level: 'N4', jmdict_id: 3, examples: [example] },
        { level: 'N4', jmdict_id: null, examples: [example] },
      ],
      new Set([1, 2]),
    );
    expect(sentences).toEqual([
      { id: 7, ja: '一つ。', reading: '{一|ひと}つ。', en: 'One.', es: null },
    ]);
    expect(links).toEqual([
      { wordId: 1, sentenceId: 7 },
      { wordId: 2, sentenceId: 7 },
    ]);
  });
});

describe('mapWord', () => {
  const entry = {
    id: '1160790',
    kanji: [{ common: true, text: '一' }],
    kana: [{ common: false, text: 'イチ' }],
    sense: [
      { partOfSpeech: ['num'], gloss: [{ lang: 'eng', text: 'one' }] },
      { partOfSpeech: ['num'], gloss: [{ lang: 'dut', text: 'een' }] },
      { partOfSpeech: ['num'], gloss: [{ lang: 'spa', text: 'Uno' }] },
    ],
  };

  it('keeps only English and Spanish senses, renumbered', () => {
    const { senses } = mapWord(entry, new Map());
    expect(senses.map((sense) => [sense.position, sense.glossesEn, sense.glossesEs])).toEqual([
      [0, ['one'], []],
      [1, [], ['Uno']],
    ]);
  });

  it('produces one term per form, kana reading and gloss', () => {
    const { terms } = mapWord(entry, new Map());
    expect(terms.map((term) => [term.kind, term.term])).toEqual([
      ['form', '一'],
      ['reading', 'いち'],
      ['en', 'one'],
      ['es', 'uno'],
    ]);
  });

  it('marks common words and adds the JLPT level', () => {
    const { word } = mapWord(entry, new Map([[1160790, 5]]));
    expect(word).toMatchObject({ id: 1160790, common: true, jlpt: 5, kanjiChars: ['一'] });
  });
});

describe('mapKanji', () => {
  const character = {
    literal: '一',
    misc: { grade: 1, strokeCounts: [1, 2], frequency: 2 },
    readingMeaning: {
      groups: [
        {
          readings: [
            { type: 'ja_on', value: 'イチ' },
            { type: 'ja_kun', value: 'ひと.つ' },
            { type: 'pinyin', value: 'yi1' },
          ],
          meanings: [
            { lang: 'en', value: 'one' },
            { lang: 'es', value: 'uno' },
            { lang: 'fr', value: 'un' },
          ],
        },
      ],
    },
  };

  it('finds the kanji by literal, reading, English and Spanish', () => {
    const { terms } = mapKanji(character, new Map());
    expect(terms.map((term) => term.term)).toEqual(['一', 'いち', 'ひとつ', 'ひと', 'one', 'uno']);
  });

  it('uses the first stroke count and the JLPT list', () => {
    const { kanji } = mapKanji(character, new Map([['一', 5]]));
    expect(kanji).toMatchObject({ strokes: 1, jlpt: 5, grade: 1, freq: 2 });
  });

  it('copes with characters that have no readings', () => {
    const { kanji, terms } = mapKanji({ ...character, readingMeaning: null }, new Map());
    expect(kanji.meaningsEn).toEqual([]);
    expect(terms).toEqual([{ literal: '一', term: '一', kind: 'form' }]);
  });
});
