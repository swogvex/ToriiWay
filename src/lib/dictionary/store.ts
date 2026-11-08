// Result types and an in-memory store for local development and e2e, where there is no database.

import { mapKanji, mapWord, type KanjiRow, type TermKind } from './import-map.ts';
import type { ParsedQuery, SearchLang } from './search.ts';

export const KANJI_LIMIT = 12;
export const WORD_LIMIT = 50;
/** Per language: long entries would bloat the result list. */
const SENSES_PER_LANGUAGE = 3;

export interface SenseResult {
  pos: string[];
  glossesEn: string[];
  glossesEs: string[];
}

export interface WordResult {
  id: number;
  kanjiForms: string[];
  readings: string[];
  common: boolean;
  jlpt: number | null;
  senses: SenseResult[];
}

export interface CommonWord {
  id: number;
  form: string;
  reading: string;
  glossesEn: string[];
  glossesEs: string[];
}

export interface KanjiResult extends KanjiRow {
  commonWords: CommonWord[];
}

export interface SearchResult {
  kanji: KanjiResult[];
  words: WordResult[];
  /** Matches found, up to the cap of the search. */
  counts: { kanji: number; words: number };
}

export interface DictionaryStore {
  search(query: ParsedQuery, lang: SearchLang): Promise<SearchResult>;
}

/** Upstream lists each language as its own sense, so a plain slice could lose all the Spanish. */
export function trimSenses(senses: readonly SenseResult[]): SenseResult[] {
  let en = 0;
  let es = 0;
  return senses.filter((sense) => {
    if (sense.glossesEn.length > 0 && ++en <= SENSES_PER_LANGUAGE) return true;
    return sense.glossesEs.length > 0 && ++es <= SENSES_PER_LANGUAGE;
  });
}

const SAMPLE_WORD = mapWord(
  {
    id: '1160790',
    kanji: [{ common: true, text: '一' }],
    kana: [{ common: true, text: 'いち' }],
    sense: [
      { partOfSpeech: ['num'], gloss: [{ lang: 'eng', text: 'one' }] },
      { partOfSpeech: ['num'], gloss: [{ lang: 'spa', text: 'uno' }] },
    ],
  },
  new Map([[1160790, 5]]),
);

const SAMPLE_KANJI = mapKanji(
  {
    literal: '一',
    misc: { grade: 1, strokeCounts: [1], frequency: 2 },
    readingMeaning: {
      groups: [
        {
          readings: [
            { type: 'ja_on', value: 'イチ' },
            { type: 'ja_kun', value: 'ひと.つ' },
          ],
          meanings: [
            { lang: 'en', value: 'one' },
            { lang: 'es', value: 'uno' },
          ],
        },
      ],
    },
  },
  new Map([['一', 5]]),
);

function matches(terms: readonly { term: string; kind: TermKind }[], query: ParsedQuery): boolean {
  return terms.some(
    ({ term }) =>
      query.exact.includes(term) ||
      query.prefix.some((prefix) => term.startsWith(prefix)) ||
      query.partial.some((partial) => term.includes(partial)),
  );
}

export function memoryDictionaryStore(): DictionaryStore {
  return {
    search(query) {
      const hasKanji =
        matches(SAMPLE_KANJI.terms, query) || query.kanji.includes(SAMPLE_KANJI.kanji.literal);
      const hasWord = matches(SAMPLE_WORD.terms, query);
      const { id, kanjiForms, readings, common, jlpt } = SAMPLE_WORD.word;
      return Promise.resolve({
        kanji: hasKanji ? [{ ...SAMPLE_KANJI.kanji, commonWords: [] }] : [],
        words: hasWord
          ? [
              {
                id,
                kanjiForms,
                readings,
                common,
                jlpt,
                senses: SAMPLE_WORD.senses.map(({ pos, glossesEn, glossesEs }) => ({
                  pos,
                  glossesEn,
                  glossesEs,
                })),
              },
            ]
          : [],
        counts: { kanji: hasKanji ? 1 : 0, words: hasWord ? 1 : 0 },
      });
    },
  };
}
