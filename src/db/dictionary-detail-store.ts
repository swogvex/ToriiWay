// Queries of the kanji and word pages. Every value goes in as a bound parameter.

import { neon } from '@neondatabase/serverless';
import { sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import type {
  DictionaryDetailStore,
  KanjiGroup,
  SentenceResult,
  WordDetail,
} from '../lib/dictionary/detail.ts';
import { commonWordsOf, sensesOf, type Execute } from './dictionary-store.ts';

const COMMON_WORDS_ON_PAGE = 8;
const KANJI_SENTENCES = 4;
const WORD_SENTENCES = 5;
/** Sentences weighed per kanji: a bound for the most productive characters. */
const SENTENCE_POOL = 300;

type Row = Record<string, unknown>;

// Sentences with both translations first, so a Spanish page finds Spanish when it exists.
const bestFirst = sql`(s.es IS NOT NULL) DESC, (s.reading IS NOT NULL) DESC, char_length(s.ja), s.id`;

export const kanjiRow = (literal: string): SQL =>
  sql`SELECT k.*, st.strokes AS stroke_list FROM kanji k
    LEFT JOIN kanji_strokes st ON st.literal = k.literal
    WHERE k.literal = ${literal}`;

export const kanjiSentences = (literal: string): SQL =>
  sql`SELECT s.id, s.ja, s.reading, s.en, s.es FROM sentences s
    WHERE s.id IN (
      SELECT ws.sentence_id FROM words w
      JOIN word_sentences ws ON ws.word_id = w.id
      WHERE w.kanji_chars @> ARRAY[${literal}]::text[]
      LIMIT ${SENTENCE_POOL}
    ) AND position(${literal} IN s.ja) > 0
    ORDER BY ${bestFirst}
    LIMIT ${KANJI_SENTENCES}`;

export const wordRow = (id: number): SQL =>
  sql`SELECT id, kanji_forms, readings, common, jlpt FROM words WHERE id = ${id}`;

export const wordSentences = (id: number): SQL =>
  sql`SELECT s.id, s.ja, s.reading, s.en, s.es FROM word_sentences ws
    JOIN sentences s ON s.id = ws.sentence_id
    WHERE ws.word_id = ${id}
    ORDER BY ${bestFirst}
    LIMIT ${WORD_SENTENCES}`;

export function kanjiInGroup(group: KanjiGroup): SQL {
  const value = Number(group.slice(1));
  const filter = group.startsWith('n') ? sql`jlpt = ${value}` : sql`grade = ${value}`;
  return sql`SELECT literal FROM kanji WHERE ${filter} ORDER BY freq ASC NULLS LAST, literal`;
}

const allSources = sql`SELECT name, version, license, url, imported_at FROM data_sources ORDER BY name`;
const sitemapKanji = sql`SELECT literal FROM kanji
  WHERE jlpt IS NOT NULL OR grade IS NOT NULL ORDER BY literal`;
const sitemapWords = sql`SELECT id FROM words WHERE common ORDER BY id`;

const toSentence = (row: Row): SentenceResult => ({
  id: row['id'] as number,
  ja: row['ja'] as string,
  reading: row['reading'] as string | null,
  en: row['en'] as string | null,
  es: row['es'] as string | null,
});

export function sqlDictionaryDetailStore(execute: Execute): DictionaryDetailStore {
  return {
    async getKanji(literal) {
      const [rows, commonRows, sentenceRows] = await Promise.all([
        execute(kanjiRow(literal)),
        execute(commonWordsOf([literal], COMMON_WORDS_ON_PAGE)),
        execute(kanjiSentences(literal)),
      ]);
      const row = rows[0];
      if (!row) return null;
      return {
        literal: row['literal'] as string,
        grade: row['grade'] as number | null,
        jlpt: row['jlpt'] as number | null,
        strokes: row['strokes'] as number,
        freq: row['freq'] as number | null,
        meaningsEn: row['meanings_en'] as string[],
        meaningsEs: row['meanings_es'] as string[],
        onReadings: row['on_readings'] as string[],
        kunReadings: row['kun_readings'] as string[],
        strokeList: (row['stroke_list'] as string[] | null) ?? [],
        commonWords: commonRows.map((common) => ({
          id: common['id'] as number,
          form: common['form'] as string,
          reading: common['reading'] as string,
          glossesEn: (common['glosses_en'] as string[] | null) ?? [],
          glossesEs: (common['glosses_es'] as string[] | null) ?? [],
        })),
        sentences: sentenceRows.map(toSentence),
      };
    },

    async kanjiByGroup(group) {
      return (await execute(kanjiInGroup(group))).map((row) => row['literal'] as string);
    },

    async dataSources() {
      return (await execute(allSources)).map((row) => ({
        name: row['name'] as string,
        version: row['version'] as string,
        license: row['license'] as string,
        url: row['url'] as string,
        importedAt: new Date(row['imported_at'] as string | Date),
      }));
    },

    async sitemapEntries() {
      const [kanji, words] = await Promise.all([execute(sitemapKanji), execute(sitemapWords)]);
      return {
        kanji: kanji.map((row) => row['literal'] as string),
        words: words.map((row) => row['id'] as number),
      };
    },

    async getWord(id) {
      const [rows, senseRows, sentenceRows] = await Promise.all([
        execute(wordRow(id)),
        execute(sensesOf([id])),
        execute(wordSentences(id)),
      ]);
      const row = rows[0];
      if (!row) return null;
      const word: WordDetail = {
        id: row['id'] as number,
        kanjiForms: row['kanji_forms'] as string[],
        readings: row['readings'] as string[],
        common: row['common'] as boolean,
        jlpt: row['jlpt'] as number | null,
        senses: senseRows.map((sense) => ({
          pos: sense['pos'] as string[],
          glossesEn: sense['glosses_en'] as string[],
          glossesEs: sense['glosses_es'] as string[],
        })),
        sentences: sentenceRows.map(toSentence),
      };
      return word;
    },
  };
}

export function drizzleDictionaryDetailStore(url: string): DictionaryDetailStore {
  const db = drizzle(neon(url));
  return sqlDictionaryDetailStore(async (query) => (await db.execute(query)).rows);
}
