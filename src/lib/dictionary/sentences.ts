// Spanish for the example sentences: only human translations from Tatoeba, never machine ones.

import type { OpenJlptVocab, SentenceRow, WordSentenceRow } from './import-map.ts';

/** Most extra sentences given to a word that has no Spanish example. */
const EXTRA_PER_WORD = 2;
/** Longer sentences make poor examples for a learner. */
const MAX_EXTRA_LENGTH = 40;

export interface TatoebaCorpus {
  /** Japanese sentences by id. */
  japanese: ReadonlyMap<number, string>;
  /** English and Spanish sentences by id. */
  text: ReadonlyMap<number, string>;
  jpnEng: ReadonlyMap<number, readonly number[]>;
  jpnSpa: ReadonlyMap<number, readonly number[]>;
  engSpa: ReadonlyMap<number, readonly number[]>;
}

interface Translation {
  en: string | null;
  es: string | null;
  /** Translated straight from the Japanese, not through the English. */
  direct: boolean;
}

export function translate(id: number, corpus: TatoebaCorpus): Translation {
  const english = corpus.jpnEng.get(id) ?? [];
  const firstText = (ids: readonly number[] = []): string | null => {
    for (const item of ids) {
      const text = corpus.text.get(item);
      if (text) return text;
    }
    return null;
  };
  const direct = firstText(corpus.jpnSpa.get(id));
  if (direct) return { en: firstText(english), es: direct, direct: true };
  for (const item of english) {
    const es = firstText(corpus.engSpa.get(item));
    // Keep the English this Spanish was translated from, so both lines say the same.
    if (es) return { en: corpus.text.get(item) ?? null, es, direct: false };
  }
  return { en: firstText(english), es: null, direct: false };
}

export function addSpanish(
  sentences: readonly SentenceRow[],
  corpus: TatoebaCorpus,
): SentenceRow[] {
  return sentences.map((sentence) => ({
    ...sentence,
    es: translate(sentence.id, corpus).es,
  }));
}

/** Compounds only: one kanji or a kana word would match inside unrelated words. */
function matchableForm(form: string | undefined): form is string {
  return !!form && form.length >= 2 && /^\p{Script=Han}{2}/u.test(form);
}

/**
 * Finds sentences with English and Spanish for the words still lacking a Spanish example.
 * Shortest first, and direct translations before those made through the English.
 */
export function extraExamples(
  vocab: readonly OpenJlptVocab[],
  existing: readonly SentenceRow[],
  links: readonly WordSentenceRow[],
  known: ReadonlySet<number>,
  corpus: TatoebaCorpus,
): { sentences: SentenceRow[]; links: WordSentenceRow[] } {
  const withSpanish = new Set(existing.filter((row) => row.es).map((row) => row.id));
  const covered = new Set(
    links.filter((link) => withSpanish.has(link.sentenceId)).map((link) => link.wordId),
  );

  // Candidates indexed by every pair of neighbouring characters, so each word scans few.
  const byPair = new Map<string, { id: number; ja: string; translation: Translation }[]>();
  for (const [id, ja] of corpus.japanese) {
    if (ja.length > MAX_EXTRA_LENGTH) continue;
    const translation = translate(id, corpus);
    if (!translation.en || !translation.es) continue;
    const candidate = { id, ja, translation };
    const pairs = new Set<string>();
    for (let index = 0; index + 2 <= ja.length; index++) pairs.add(ja.slice(index, index + 2));
    for (const pair of pairs) {
      const list = byPair.get(pair);
      if (list) list.push(candidate);
      else byPair.set(pair, [candidate]);
    }
  }
  for (const list of byPair.values()) {
    list.sort(
      (a, b) =>
        Number(b.translation.direct) - Number(a.translation.direct) ||
        a.ja.length - b.ja.length ||
        a.id - b.id,
    );
  }

  const sentences = new Map<number, SentenceRow>();
  const added: WordSentenceRow[] = [];
  const existingIds = new Set(existing.map((row) => row.id));
  const seen = new Set<number>();
  for (const { jmdict_id: wordId, word } of vocab) {
    if (wordId == null || !known.has(wordId) || !matchableForm(word)) continue;
    if (covered.has(wordId) || seen.has(wordId)) continue;
    seen.add(wordId);
    const matches = (byPair.get(word.slice(0, 2)) ?? [])
      .filter((candidate) => candidate.ja.includes(word))
      .slice(0, EXTRA_PER_WORD);
    for (const { id, ja, translation } of matches) {
      added.push({ wordId, sentenceId: id });
      if (!existingIds.has(id)) {
        sentences.set(id, { id, ja, reading: null, en: translation.en, es: translation.es });
      }
    }
  }
  return { sentences: [...sentences.values()], links: added };
}
