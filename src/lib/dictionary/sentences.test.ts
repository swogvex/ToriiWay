import { describe, expect, it } from 'vitest';

import type { SentenceRow } from './import-map';
import { addSpanish, extraExamples, translate, type TatoebaCorpus } from './sentences';

const corpus: TatoebaCorpus = {
  japanese: new Map([
    [1, '大学に行く。'],
    [2, '大学は遠い。とても遠い。'],
    [3, '大学。'],
    [4, '学校に行く。'],
    [5, '大学が好き。'],
  ]),
  text: new Map([
    [10, 'I go to university.'],
    [11, 'Voy a la universidad.'],
    [12, 'It is far.'],
    [13, 'Está lejos.'],
    [14, 'University.'],
    [15, 'School.'],
    [16, 'I like university.'],
    [17, 'Me gusta la universidad.'],
  ]),
  jpnEng: new Map([
    [1, [10]],
    [2, [12]],
    [3, [14]],
    [4, [15]],
    [5, [16]],
  ]),
  jpnSpa: new Map([
    [1, [11]],
    [5, [17]],
  ]),
  engSpa: new Map([[12, [13]]]),
};

const row = (id: number, es: string | null = null): SentenceRow => ({
  id,
  ja: corpus.japanese.get(id) ?? '',
  reading: null,
  en: 'x',
  es,
});

describe('translate', () => {
  it('prefers the direct Spanish translation', () => {
    expect(translate(1, corpus)).toEqual({
      en: 'I go to university.',
      es: 'Voy a la universidad.',
      direct: true,
    });
  });

  it('falls back to a translation made through the English', () => {
    expect(translate(2, corpus)).toEqual({ en: 'It is far.', es: 'Está lejos.', direct: false });
  });

  it('leaves Spanish empty when no human translation exists', () => {
    expect(translate(4, corpus).es).toBeNull();
    expect(addSpanish([row(4), row(1)], corpus).map((item) => item.es)).toEqual([
      null,
      'Voy a la universidad.',
    ]);
  });
});

describe('extraExamples', () => {
  const vocab = [{ level: 'N5', jmdict_id: 100, word: '大学' }];

  it('picks direct translations first, then the shortest, at most two', () => {
    const result = extraExamples(vocab, [], [], new Set([100]), corpus);
    expect(result.links).toEqual([
      { wordId: 100, sentenceId: 1 },
      { wordId: 100, sentenceId: 5 },
    ]);
    expect(result.sentences[0]).toMatchObject({ id: 1, reading: null });
  });

  it('skips words that already have a Spanish example', () => {
    const result = extraExamples(
      vocab,
      [row(4, 'Escuela.')],
      [{ wordId: 100, sentenceId: 4 }],
      new Set([100]),
      corpus,
    );
    expect(result.links).toEqual([]);
  });

  it('only links a sentence that is already stored, without copying it', () => {
    const result = extraExamples(vocab, [row(5)], [], new Set([100]), corpus);
    expect(result.links).toContainEqual({ wordId: 100, sentenceId: 5 });
    expect(result.sentences.map((item) => item.id)).toEqual([1]);
  });

  it('ignores single kanji, kana words and unknown words', () => {
    const items = [
      { level: 'N5', jmdict_id: 1, word: '大' },
      { level: 'N5', jmdict_id: 2, word: 'いく' },
      { level: 'N5', jmdict_id: 3, word: '大学' },
    ];
    expect(extraExamples(items, [], [], new Set([1, 2]), corpus).links).toEqual([]);
  });
});
