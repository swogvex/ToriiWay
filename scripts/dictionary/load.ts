// Builds the dictionary rows and writes them to Postgres in one transaction.
// DELETE instead of TRUNCATE: TRUNCATE would lock out searches for the whole import,
// while DELETE lets them keep reading the old data until the commit.

import {
  jlptIndex,
  mapExamples,
  mapKanji,
  mapWord,
  type KanjiRow,
  type KanjiTermRow,
  type SenseRow,
  type WordRow,
  type WordTermRow,
} from '../../src/lib/dictionary/import-map.ts';
import { addSpanish, extraExamples } from '../../src/lib/dictionary/sentences.ts';
import type { Downloaded, SourceInfo } from './sources.ts';

const BATCH_SIZE = 5000;

// A broken upstream file must stop the import, never replace good data.
const MINIMUM_ROWS = {
  words: 150_000,
  kanji: 10_000,
  jlptWords: 5000,
  jlptKanji: 2000,
  spanishSentences: 4000,
};

/** The one method shared by a Neon client and the local test database. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface Tables {
  words: WordRow[];
  senses: SenseRow[];
  terms: WordTermRow[];
  kanji: KanjiRow[];
  kanjiTerms: KanjiTermRow[];
  sentences: ReturnType<typeof mapExamples>['sentences'];
  links: ReturnType<typeof mapExamples>['links'];
}

export function buildTables(data: Downloaded): Tables {
  const vocabLevels = jlptIndex(
    data.vocab.map((item) => ({ key: item.jmdict_id, level: item.level })),
  );
  const kanjiLevels = jlptIndex(
    data.jlptKanji.map((item) => ({ key: item.character, level: item.level })),
  );
  const tables: Tables = {
    words: [],
    senses: [],
    terms: [],
    kanji: [],
    kanjiTerms: [],
    sentences: [],
    links: [],
  };
  for (const entry of data.words) {
    const { word, senses, terms } = mapWord(entry, vocabLevels);
    tables.words.push(word);
    for (const sense of senses) tables.senses.push(sense);
    for (const term of terms) tables.terms.push(term);
  }
  for (const character of data.characters) {
    const { kanji, terms } = mapKanji(character, kanjiLevels);
    tables.kanji.push(kanji);
    for (const term of terms) tables.kanjiTerms.push(term);
  }
  const known = new Set(tables.words.map((word) => word.id));
  const examples = mapExamples(data.vocab, known);
  const curated = addSpanish(examples.sentences, data.corpus);
  const extra = extraExamples(data.vocab, curated, examples.links, known, data.corpus);
  tables.sentences = [...curated, ...extra.sentences];
  tables.links = [...examples.links, ...extra.links];
  return tables;
}

export function assertPlausible(tables: Tables): void {
  const counts = {
    words: tables.words.length,
    kanji: tables.kanji.length,
    jlptWords: tables.words.filter((word) => word.jlpt !== null).length,
    jlptKanji: tables.kanji.filter((kanji) => kanji.jlpt !== null).length,
    spanishSentences: tables.sentences.filter((sentence) => sentence.es).length,
  };
  for (const key of Object.keys(MINIMUM_ROWS) as (keyof typeof MINIMUM_ROWS)[]) {
    if (counts[key] < MINIMUM_ROWS[key]) {
      throw new Error(`Only ${counts[key]} ${key}, expected at least ${MINIMUM_ROWS[key]}`);
    }
  }
}

async function insert(client: Queryable, table: string, rows: readonly object[]): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await client.query(
      `INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
      [JSON.stringify(rows.slice(start, start + BATCH_SIZE))],
    );
  }
}

/** Replaces every dictionary table. Any failure rolls back and leaves the old data in place. */
export async function replaceDictionary(
  client: Queryable,
  tables: Tables,
  sources: readonly SourceInfo[],
  importedAt: Date,
): Promise<void> {
  const names = [
    'words',
    'word_senses',
    'word_terms',
    'kanji',
    'kanji_terms',
    'sentences',
    'word_sentences',
    'data_sources',
  ];
  await client.query('BEGIN');
  try {
    for (const name of names) await client.query(`DELETE FROM ${name}`);
    await insert(
      client,
      'words',
      tables.words.map((row) => ({
        id: row.id,
        kanji_forms: row.kanjiForms,
        readings: row.readings,
        kanji_chars: row.kanjiChars,
        common: row.common,
        jlpt: row.jlpt,
      })),
    );
    await insert(
      client,
      'word_senses',
      tables.senses.map((row) => ({
        word_id: row.wordId,
        position: row.position,
        pos: row.pos,
        glosses_en: row.glossesEn,
        glosses_es: row.glossesEs,
      })),
    );
    await insert(
      client,
      'word_terms',
      tables.terms.map((row) => ({ word_id: row.wordId, term: row.term, kind: row.kind })),
    );
    await insert(
      client,
      'kanji',
      tables.kanji.map((row) => ({
        literal: row.literal,
        grade: row.grade,
        jlpt: row.jlpt,
        strokes: row.strokes,
        freq: row.freq,
        meanings_en: row.meaningsEn,
        meanings_es: row.meaningsEs,
        on_readings: row.onReadings,
        kun_readings: row.kunReadings,
      })),
    );
    await insert(client, 'kanji_terms', tables.kanjiTerms);
    await insert(client, 'sentences', tables.sentences);
    await insert(
      client,
      'word_sentences',
      tables.links.map((row) => ({ word_id: row.wordId, sentence_id: row.sentenceId })),
    );
    await insert(
      client,
      'data_sources',
      sources.map((source) => ({ ...source, imported_at: importedAt.toISOString() })),
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Also after a rollback: its dead rows take as much room as a full import, and without
    // this each monthly import would add a whole copy of the data to the storage bill.
    for (const name of names) await client.query(`VACUUM (ANALYZE) ${name}`);
  }
}
