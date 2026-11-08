// Dictionary search against Postgres. Every value goes in as a bound parameter.

import { neon } from '@neondatabase/serverless';
import { sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import {
  trimSenses,
  type CommonWord,
  type DictionaryStore,
  type KanjiResult,
  type SenseResult,
  type WordResult,
} from '../lib/dictionary/store.ts';
import { KANJI_LIMIT, WORD_LIMIT } from '../lib/dictionary/limits.ts';
import { escapeLike, type ParsedQuery, type SearchLang } from '../lib/dictionary/search.ts';

type Row = Record<string, unknown>;
export type Execute = (query: SQL) => Promise<Row[]>;

/** Rows read per match type: a bound on the work a very generic query can cause. */
const SCAN_LIMIT = 1000;
const COMMON_WORDS_PER_KANJI = 3;

const RANK_EXACT = 0;
const RANK_EXACT_OTHER_LANGUAGE = 1;
const RANK_PREFIX = 2;
const RANK_PARTIAL = 3;

const textArray = (values: readonly string[]) => sql`${sql.param(values)}::text[]`;
const intArray = (values: readonly number[]) => sql`${sql.param(values)}::int[]`;

const likeAny = (patterns: readonly string[]): SQL =>
  sql.join(
    patterns.map((pattern) => sql`term LIKE ${pattern}`),
    sql` OR `,
  );

/** One bounded scan per match type; `extraExact` adds the kanji typed in the query. */
function candidates(
  table: SQL,
  key: SQL,
  query: ParsedQuery,
  lang: SearchLang,
  extraExact: readonly string[] = [],
): SQL {
  const exact = [...new Set([...query.exact, ...extraExact])];
  const other = lang === 'en' ? 'es' : 'en';
  const scans = [
    sql`(SELECT ${key} AS key, CASE WHEN kind = ${other} THEN ${RANK_EXACT_OTHER_LANGUAGE}::int
      ELSE ${RANK_EXACT}::int END AS rank
      FROM ${table} WHERE term = ANY(${textArray(exact)}) LIMIT ${SCAN_LIMIT})`,
  ];
  if (query.prefix.length > 0) {
    const patterns = query.prefix.map((term) => `${escapeLike(term)}%`);
    scans.push(
      sql`(SELECT ${key} AS key, ${RANK_PREFIX}::int AS rank FROM ${table}
        WHERE ${likeAny(patterns)} LIMIT ${SCAN_LIMIT})`,
    );
  }
  if (query.partial.length > 0) {
    const patterns = query.partial.map((term) => `%${escapeLike(term)}%`);
    scans.push(
      sql`(SELECT ${key} AS key, ${RANK_PARTIAL}::int AS rank FROM ${table}
        WHERE ${likeAny(patterns)} LIMIT ${SCAN_LIMIT})`,
    );
  }
  return sql`SELECT key, min(rank) AS rank FROM (${sql.join(scans, sql` UNION ALL `)}) AS hits
    GROUP BY key`;
}

/**
 * The earliest sense whose gloss is the query, so 食べる ("to eat" first) beats 遣る
 * ("to eat" among many senses). Only for exact matches: the others never have one.
 */
function matchingSense(query: ParsedQuery): SQL {
  const glosses = [...query.exact, ...query.exact.map((term) => `to ${term}`)];
  return sql`CASE WHEN m.rank <= ${RANK_EXACT_OTHER_LANGUAGE}::int THEN (
      SELECT min(s.position) FROM word_senses s
      WHERE s.word_id = w.id AND EXISTS (
        SELECT 1 FROM unnest(s.glosses_en || s.glosses_es) AS gloss
        WHERE lower(gloss) = ANY(${textArray(glosses)})
      )
    ) END`;
}

/** Exact matches first, then common words, then the rest; easier JLPT levels break ties. */
export function wordMatches(query: ParsedQuery, lang: SearchLang): SQL {
  return sql`SELECT w.id, w.kanji_forms, w.readings, w.common, w.jlpt,
      count(*) OVER () AS total
    FROM (${candidates(sql`word_terms`, sql`word_id`, query, lang)}) AS m
    JOIN words w ON w.id = m.key
    ORDER BY CASE WHEN m.rank <= ${RANK_EXACT_OTHER_LANGUAGE}::int THEN 0
                  WHEN w.common THEN 1 ELSE 2 END,
      m.rank, w.common DESC, ${matchingSense(query)} ASC NULLS LAST, w.jlpt DESC NULLS LAST, w.id
    LIMIT ${WORD_LIMIT}`;
}

export function kanjiMatches(query: ParsedQuery, lang: SearchLang): SQL {
  return sql`SELECT k.*, count(*) OVER () AS total
    FROM (${candidates(sql`kanji_terms`, sql`literal`, query, lang, query.kanji)}) AS m
    JOIN kanji k ON k.literal = m.key
    ORDER BY m.rank, k.freq ASC NULLS LAST, k.literal
    LIMIT ${KANJI_LIMIT}`;
}

export function commonWordsOf(literals: readonly string[], perKanji = COMMON_WORDS_PER_KANJI): SQL {
  const firstGloss = (column: SQL) =>
    sql`(SELECT ${column} FROM word_senses s
      WHERE s.word_id = w.id AND cardinality(${column}) > 0 ORDER BY s.position LIMIT 1)`;
  return sql`SELECT k.literal, w.id, w.kanji_forms[1] AS form, w.readings[1] AS reading,
      ${firstGloss(sql`s.glosses_en`)} AS glosses_en,
      ${firstGloss(sql`s.glosses_es`)} AS glosses_es
    FROM unnest(${textArray(literals)}) AS k(literal)
    CROSS JOIN LATERAL (
      SELECT id, kanji_forms, readings FROM words
      WHERE kanji_chars @> ARRAY[k.literal] AND common
        -- The main spelling must use the kanji and be a compound: 一 alone says nothing new,
        -- and 百 only matches through its rare variant 一百.
        AND position(k.literal IN kanji_forms[1]) > 0 AND char_length(kanji_forms[1]) > 1
      ORDER BY jlpt DESC NULLS LAST, char_length(kanji_forms[1]), id
      LIMIT ${perKanji}
    ) AS w`;
}

export function sensesOf(ids: readonly number[]): SQL {
  return sql`SELECT word_id, pos, glosses_en, glosses_es FROM word_senses
    WHERE word_id = ANY(${intArray(ids)}) ORDER BY word_id, position`;
}

const total = (rows: readonly Row[]): number => Number(rows[0]?.['total'] ?? 0);

export function sqlDictionaryStore(execute: Execute): DictionaryStore {
  return {
    async search(query, lang) {
      const [wordRows, kanjiRows] = await Promise.all([
        execute(wordMatches(query, lang)),
        execute(kanjiMatches(query, lang)),
      ]);
      const ids = wordRows.map((row) => row['id'] as number);
      const literals = kanjiRows.map((row) => row['literal'] as string);
      const [senseRows, commonRows] = await Promise.all([
        ids.length > 0 ? execute(sensesOf(ids)) : Promise.resolve([]),
        literals.length > 0 ? execute(commonWordsOf(literals)) : Promise.resolve([]),
      ]);

      const senses = new Map<number, SenseResult[]>();
      for (const row of senseRows) {
        const id = row['word_id'] as number;
        const list = senses.get(id) ?? [];
        list.push({
          pos: row['pos'] as string[],
          glossesEn: row['glosses_en'] as string[],
          glossesEs: row['glosses_es'] as string[],
        });
        senses.set(id, list);
      }

      const common = new Map<string, CommonWord[]>();
      for (const row of commonRows) {
        const literal = row['literal'] as string;
        const list = common.get(literal) ?? [];
        list.push({
          id: row['id'] as number,
          form: row['form'] as string,
          reading: row['reading'] as string,
          glossesEn: (row['glosses_en'] as string[] | null) ?? [],
          glossesEs: (row['glosses_es'] as string[] | null) ?? [],
        });
        common.set(literal, list);
      }

      const words = wordRows.map((row): WordResult => ({
        id: row['id'] as number,
        kanjiForms: row['kanji_forms'] as string[],
        readings: row['readings'] as string[],
        common: row['common'] as boolean,
        jlpt: row['jlpt'] as number | null,
        senses: trimSenses(senses.get(row['id'] as number) ?? []),
      }));
      const kanji = kanjiRows.map((row): KanjiResult => ({
        literal: row['literal'] as string,
        grade: row['grade'] as number | null,
        jlpt: row['jlpt'] as number | null,
        strokes: row['strokes'] as number,
        freq: row['freq'] as number | null,
        meaningsEn: row['meanings_en'] as string[],
        meaningsEs: row['meanings_es'] as string[],
        onReadings: row['on_readings'] as string[],
        kunReadings: row['kun_readings'] as string[],
        commonWords: common.get(row['literal'] as string) ?? [],
      }));
      return { words, kanji, counts: { words: total(wordRows), kanji: total(kanjiRows) } };
    },
  };
}

export function drizzleDictionaryStore(url: string): DictionaryStore {
  const db = drizzle(neon(url));
  return sqlDictionaryStore(async (query) => (await db.execute(query)).rows);
}
