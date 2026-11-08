// Browser side of the dictionary search, shared by the search page and the ⌘K dialog.

import type { SearchResult, SenseResult } from './store';

export type DisplayLocale = 'en' | 'es';

const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const MIN_LATIN = 2;
export const DEBOUNCE_MS = 200;

/** One Japanese character is a real query; one Latin letter is not. */
export function canSearch(query: string): boolean {
  const text = query.trim();
  return JAPANESE.test(text) ? text.length >= 1 : text.length >= MIN_LATIN;
}

export async function fetchDictionary(
  query: string,
  locale: DisplayLocale,
  signal: AbortSignal,
): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query.trim(), lang: locale });
  const response = await fetch(`/api/dictionary/search?${params}`, { signal });
  if (!response.ok) throw new Error(`search failed: ${response.status}`);
  return (await response.json()) as SearchResult;
}

export interface Meaning {
  primary: string[];
  /** The same meaning in the site's other language, when there is one. */
  other: string[];
  /** Spanish page with no Spanish data: English is shown and labelled, never translated. */
  englishOnly: boolean;
}

export function pickMeaning(
  english: readonly string[],
  spanish: readonly string[],
  locale: DisplayLocale,
): Meaning {
  if (locale === 'en') return { primary: [...english], other: [...spanish], englishOnly: false };
  if (spanish.length > 0) return { primary: [...spanish], other: [...english], englishOnly: false };
  return { primary: [...english], other: [], englishOnly: true };
}

/** All glosses of a word, one list per language, without repeats. */
export function senseGlosses(senses: readonly SenseResult[]): { en: string[]; es: string[] } {
  return {
    en: [...new Set(senses.flatMap((sense) => sense.glossesEn))],
    es: [...new Set(senses.flatMap((sense) => sense.glossesEs))],
  };
}

export function displayLocale(): DisplayLocale {
  return document.documentElement.lang === 'es' ? 'es' : 'en';
}

export function dictionaryUrl(base: string, term: string): string {
  return `${base}?${new URLSearchParams({ q: term })}`;
}
