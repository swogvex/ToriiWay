// Turns what the visitor typed into the terms the dictionary tables store.

import { toHiragana } from 'wanakana';

import { glossTerm, kanjiChars, normalizeText, toHiraganaOnly } from './normalize.ts';

export type SearchLang = 'en' | 'es';

export interface ParsedQuery {
  /** Whole-term matches. */
  exact: string[];
  /** Start-of-term matches; very short queries would match half the table. */
  prefix: string[];
  /** Anywhere in the term; the trigram index needs three characters. */
  partial: string[];
  /** Each kanji typed, so 日本語 also lists 日, 本 and 語. */
  kanji: string[];
}

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const ONLY_KANA = /^[\p{Script=Hiragana}ー]+$/u;
const HAN = /\p{Script=Han}/u;
const MIN_PREFIX = 2;
const MIN_PARTIAL = 3;

/** Escapes LIKE wildcards so a typed % or _ is matched literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

export function parseQuery(raw: string): ParsedQuery {
  const text = normalizeText(raw);
  const terms = new Set<string>();
  if (JAPANESE.test(text)) {
    terms.add(text);
    terms.add(toHiraganaOnly(text));
  } else {
    const gloss = glossTerm(text);
    if (gloss) terms.add(gloss);
    const kana = toHiragana(text);
    if (ONLY_KANA.test(kana)) terms.add(kana);
  }
  const exact = [...terms];
  return {
    exact,
    prefix: exact.filter((term) => HAN.test(term) || term.length >= MIN_PREFIX),
    partial: exact.filter((term) => term.length >= MIN_PARTIAL),
    kanji: kanjiChars([text]),
  };
}

export const isEmptyQuery = (query: ParsedQuery): boolean => query.exact.length === 0;
