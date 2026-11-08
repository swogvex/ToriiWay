// Turns the upstream dictionary JSON (jmdict-simplified, OpenJLPT) into database rows.
// Pure on purpose: the importer does the I/O, and this part is unit-tested.

import { glossTerm, kanjiChars, readingTerms, toHiraganaOnly } from './normalize.ts';

export type TermKind = 'form' | 'reading' | 'en' | 'es';

export interface JmdictWord {
  id: string;
  kanji: { common: boolean; text: string }[];
  kana: { common: boolean; text: string }[];
  sense: { partOfSpeech: string[]; gloss: { lang: string; text: string }[] }[];
}

export interface KanjidicCharacter {
  literal: string;
  misc: { grade: number | null; strokeCounts: number[]; frequency: number | null };
  readingMeaning: {
    groups: {
      readings: { type: string; value: string }[];
      meanings: { lang: string; value: string }[];
    }[];
  } | null;
}

export interface WordRow {
  id: number;
  kanjiForms: string[];
  readings: string[];
  kanjiChars: string[];
  common: boolean;
  jlpt: number | null;
}

export interface SenseRow {
  wordId: number;
  position: number;
  pos: string[];
  glossesEn: string[];
  glossesEs: string[];
}

export interface WordTermRow {
  wordId: number;
  term: string;
  kind: TermKind;
}

export interface KanjiRow {
  literal: string;
  grade: number | null;
  jlpt: number | null;
  strokes: number;
  freq: number | null;
  meaningsEn: string[];
  meaningsEs: string[];
  onReadings: string[];
  kunReadings: string[];
}

export interface KanjiTermRow {
  literal: string;
  term: string;
  kind: TermKind;
}

export interface OpenJlptVocab {
  level: string;
  jmdict_id?: number | null;
  word?: string;
  examples?: { ja: string; furigana?: string; en?: string; tatoeba_id: number }[];
}

export interface SentenceRow {
  id: number;
  ja: string;
  reading: string | null;
  en: string | null;
  es: string | null;
}

export interface WordSentenceRow {
  wordId: number;
  sentenceId: number;
}

/** One row per sentence and per word that uses it; words outside `known` are dropped. */
export function mapExamples(
  vocab: readonly OpenJlptVocab[],
  known: ReadonlySet<number>,
): { sentences: SentenceRow[]; links: WordSentenceRow[] } {
  const sentences = new Map<number, SentenceRow>();
  const links = new Map<string, WordSentenceRow>();
  for (const { jmdict_id: wordId, examples = [] } of vocab) {
    if (wordId == null || !known.has(wordId)) continue;
    for (const example of examples) {
      const id = example.tatoeba_id;
      sentences.set(id, {
        id,
        ja: example.ja,
        reading: example.furigana ?? null,
        en: example.en ?? null,
        es: null,
      });
      links.set(`${wordId}:${id}`, { wordId, sentenceId: id });
    }
  }
  return { sentences: [...sentences.values()], links: [...links.values()] };
}

/** Keeps the easiest level when a list repeats an item: "N5" and "N3" give 5. */
export function jlptIndex<K>(
  items: readonly { key: K | null | undefined; level: string }[],
): Map<K, number> {
  const levels = new Map<K, number>();
  for (const { key, level } of items) {
    const value = Number(level.slice(1));
    if (key == null || !Number.isInteger(value)) continue;
    levels.set(key, Math.max(levels.get(key) ?? 0, value));
  }
  return levels;
}

function uniqueTerms(terms: [string | null, TermKind][]): [string, TermKind][] {
  const seen = new Map<string, [string, TermKind]>();
  for (const [term, kind] of terms) {
    if (term) seen.set(`${kind}:${term}`, [term, kind]);
  }
  return [...seen.values()];
}

/** Only English and Spanish senses are kept; upstream lists each language as its own sense. */
export function mapWord(
  entry: JmdictWord,
  jlpt: ReadonlyMap<number, number>,
): { word: WordRow; senses: SenseRow[]; terms: WordTermRow[] } {
  const id = Number(entry.id);
  const kanjiForms = entry.kanji.map((form) => form.text);
  const readings = entry.kana.map((form) => form.text);
  const senses: SenseRow[] = [];
  for (const sense of entry.sense) {
    const text = (lang: string) =>
      sense.gloss.filter((gloss) => gloss.lang === lang).map((gloss) => gloss.text);
    const glossesEn = text('eng');
    const glossesEs = text('spa');
    if (glossesEn.length === 0 && glossesEs.length === 0) continue;
    senses.push({
      wordId: id,
      position: senses.length,
      pos: sense.partOfSpeech,
      glossesEn,
      glossesEs,
    });
  }
  const terms = uniqueTerms([
    ...kanjiForms.map((form): [string, TermKind] => [form, 'form']),
    ...readings.map((reading): [string, TermKind] => [toHiraganaOnly(reading), 'reading']),
    ...senses.flatMap((sense) => [
      ...sense.glossesEn.map((gloss): [string | null, TermKind] => [glossTerm(gloss), 'en']),
      ...sense.glossesEs.map((gloss): [string | null, TermKind] => [glossTerm(gloss), 'es']),
    ]),
  ]).map(([term, kind]) => ({ wordId: id, term, kind }));
  return {
    word: {
      id,
      kanjiForms,
      readings,
      kanjiChars: kanjiChars(kanjiForms),
      common: [...entry.kanji, ...entry.kana].some((form) => form.common),
      jlpt: jlpt.get(id) ?? null,
    },
    senses,
    terms,
  };
}

export function mapKanji(
  character: KanjidicCharacter,
  jlpt: ReadonlyMap<string, number>,
): { kanji: KanjiRow; terms: KanjiTermRow[] } {
  const groups = character.readingMeaning?.groups ?? [];
  const readings = (type: string) =>
    groups.flatMap((group) =>
      group.readings.filter((reading) => reading.type === type).map((reading) => reading.value),
    );
  const meanings = (lang: string) =>
    groups.flatMap((group) =>
      group.meanings.filter((meaning) => meaning.lang === lang).map((meaning) => meaning.value),
    );
  const { literal } = character;
  const meaningsEn = meanings('en');
  const meaningsEs = meanings('es');
  const onReadings = readings('ja_on');
  const kunReadings = readings('ja_kun');
  const terms = uniqueTerms([
    [literal, 'form'],
    ...[...onReadings, ...kunReadings].flatMap((reading) =>
      readingTerms(reading).map((term): [string, TermKind] => [term, 'reading']),
    ),
    ...meaningsEn.map((meaning): [string | null, TermKind] => [glossTerm(meaning), 'en']),
    ...meaningsEs.map((meaning): [string | null, TermKind] => [glossTerm(meaning), 'es']),
  ]).map(([term, kind]) => ({ literal, term, kind }));
  return {
    kanji: {
      literal,
      grade: character.misc.grade,
      jlpt: jlpt.get(literal) ?? null,
      strokes: character.misc.strokeCounts[0] ?? 0,
      freq: character.misc.frequency,
      meaningsEn,
      meaningsEs,
      onReadings,
      kunReadings,
    },
    terms,
  };
}
