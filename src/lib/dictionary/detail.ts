// Data of the kanji and word pages, and the helpers those pages share.

import type { KanjiRow } from './import-map.ts';
import { SAMPLE_KANJI, SAMPLE_WORD, type CommonWord, type SenseResult } from './store.ts';

/**
 * The CDN keeps a page for a week and may serve it stale for a month while it refreshes,
 * so only the first visit to each page reaches the database.
 */
export const CDN_CACHE = 'public, s-maxage=604800, stale-while-revalidate=2592000';

export interface SentenceResult {
  id: number;
  ja: string;
  reading: string | null;
  en: string | null;
  es: string | null;
}

export interface KanjiDetail extends KanjiRow {
  strokeList: string[];
  commonWords: CommonWord[];
  sentences: SentenceResult[];
}

export interface WordDetail {
  id: number;
  kanjiForms: string[];
  readings: string[];
  common: boolean;
  jlpt: number | null;
  senses: SenseResult[];
  sentences: SentenceResult[];
}

export const KANJI_GROUPS = [
  'n5',
  'n4',
  'n3',
  'n2',
  'n1',
  'g1',
  'g2',
  'g3',
  'g4',
  'g5',
  'g6',
  'g8',
] as const;

export type KanjiGroup = (typeof KANJI_GROUPS)[number];

export const isKanjiGroup = (value: string | undefined): value is KanjiGroup =>
  KANJI_GROUPS.includes(value as KanjiGroup);

export const kanjiGroupHref = (learn: string, group: KanjiGroup): string =>
  group === 'n5' ? `${learn}/kanji` : `${learn}/kanji/level/${group}`;

export interface DataSource {
  name: string;
  version: string;
  license: string;
  url: string;
  importedAt: Date;
}

export interface DictionaryDetailStore {
  getKanji(literal: string): Promise<KanjiDetail | null>;
  getWord(id: number): Promise<WordDetail | null>;
  /** Kanji of a JLPT level or school grade, most frequent first. */
  kanjiByGroup(group: KanjiGroup): Promise<string[]>;
  dataSources(): Promise<DataSource[]>;
  sitemapEntries(): Promise<{ kanji: string[]; words: number[] }>;
}

const SINGLE_KANJI = /^\p{Script=Han}$/u;
const WORD_ID = /^[1-9]\d{0,7}$/;

export const isKanjiParam = (value: string | undefined): value is string =>
  !!value && SINGLE_KANJI.test(value);

export const isWordParam = (value: string | undefined): value is string =>
  !!value && WORD_ID.test(value);

export interface RubyPart {
  text: string;
  ruby?: string;
}

/** Splits furigana markup: "{会|あ}う" gives 会 with the reading あ, then う. */
export function parseFurigana(text: string): RubyPart[] {
  const parts: RubyPart[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{([^|{}]+)\|([^|{}]+)\}/g)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[1] ?? '', ruby: match[2] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Plain kana for the browser's voice: "ひと.つ" and "-ひと" both become speakable. */
export const speakable = (reading: string): string => reading.replace(/[.-]/g, '');

export type PosKey =
  | 'noun'
  | 'godan'
  | 'ichidan'
  | 'suru'
  | 'adjI'
  | 'adjNa'
  | 'adjNo'
  | 'adverb'
  | 'expression'
  | 'pronoun'
  | 'particle'
  | 'interjection'
  | 'conjunction'
  | 'auxiliary'
  | 'counter'
  | 'numeric'
  | 'prefix'
  | 'suffix'
  | 'transitive'
  | 'intransitive';

const POS: Record<string, PosKey> = {
  n: 'noun',
  v1: 'ichidan',
  vs: 'suru',
  'vs-i': 'suru',
  'vs-s': 'suru',
  'adj-i': 'adjI',
  'adj-ix': 'adjI',
  'adj-na': 'adjNa',
  'adj-no': 'adjNo',
  adv: 'adverb',
  'adv-to': 'adverb',
  exp: 'expression',
  pn: 'pronoun',
  prt: 'particle',
  int: 'interjection',
  conj: 'conjunction',
  aux: 'auxiliary',
  'aux-v': 'auxiliary',
  ctr: 'counter',
  num: 'numeric',
  pref: 'prefix',
  suf: 'suffix',
  vt: 'transitive',
  vi: 'intransitive',
};

/** Labels for the common JMdict tags, without repeats; rare tags are left out. */
export function posKeys(tags: readonly string[]): PosKey[] {
  const keys = tags.flatMap((tag) => {
    const key = tag.startsWith('v5') ? 'godan' : POS[tag];
    return key ? [key] : [];
  });
  return [...new Set(keys)];
}

export function memoryDetailStore(): DictionaryDetailStore {
  const sentence: SentenceResult = {
    id: 1,
    ja: '一つください。',
    reading: '{一|ひと}つください。',
    en: 'One, please.',
    es: 'Uno, por favor.',
  };
  return {
    getKanji(literal) {
      if (literal !== SAMPLE_KANJI.kanji.literal) return Promise.resolve(null);
      return Promise.resolve({
        ...SAMPLE_KANJI.kanji,
        strokeList: ['M11,54.25c3.19,0.62,6.25,0.75,9.73,0.5c20.64-1.5,50.39-5.12,68.58-5.24'],
        commonWords: [
          {
            id: SAMPLE_WORD.word.id,
            form: '一つ',
            reading: 'ひとつ',
            glossesEn: ['one'],
            glossesEs: ['uno'],
          },
        ],
        sentences: [sentence],
      });
    },
    kanjiByGroup(group) {
      return Promise.resolve(group === 'n5' ? [SAMPLE_KANJI.kanji.literal] : []);
    },
    dataSources() {
      return Promise.resolve([
        {
          name: 'JMdict',
          version: '2026-11-02',
          license: 'CC BY-SA 4.0',
          url: 'https://www.edrdg.org/jmdict/j_jmdict.html',
          importedAt: new Date('2026-11-09T00:00:00Z'),
        },
      ]);
    },
    sitemapEntries() {
      return Promise.resolve({
        kanji: [SAMPLE_KANJI.kanji.literal],
        words: [SAMPLE_WORD.word.id],
      });
    },
    getWord(id) {
      if (id !== SAMPLE_WORD.word.id) return Promise.resolve(null);
      const { kanjiForms, readings, common, jlpt } = SAMPLE_WORD.word;
      return Promise.resolve({
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
        sentences: [sentence],
      });
    },
  };
}
