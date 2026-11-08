// Kanji and word options for the ⌘K dialog. Text nodes only: this data is never HTML.

import { kanjiHref, pickMeaning, senseGlosses, wordHref, type DisplayLocale } from './client';
import type { SearchResult } from './store';

const MAX_KANJI = 3;
const MAX_WORDS = 5;

function option(id: string, href: string, glyph: string, meaning: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'search__option search__option--page';
  element.id = id;
  element.setAttribute('role', 'option');
  element.setAttribute('aria-selected', 'false');
  element.dataset.href = href;
  element.dataset.searchDictionary = '';

  const text = document.createElement('span');
  text.className = 'search__option-text';
  const label = document.createElement('span');
  label.className = 'search__option-label';
  label.lang = 'ja';
  label.textContent = glyph;
  const excerpt = document.createElement('span');
  excerpt.className = 'search__option-excerpt';
  excerpt.textContent = meaning;
  text.append(label, excerpt);
  element.append(text);
  return element;
}

export function dictionaryOptions(
  result: SearchResult,
  locale: DisplayLocale,
  learn: string,
): HTMLElement[] {
  const kanji = result.kanji
    .slice(0, MAX_KANJI)
    .map((item, index) =>
      option(
        `search-kanji-${index}`,
        kanjiHref(learn, item.literal),
        item.literal,
        pickMeaning(item.meaningsEn, item.meaningsEs, locale).primary.join(', '),
      ),
    );
  const words = result.words.slice(0, MAX_WORDS).map((word, index) => {
    const form = word.kanjiForms[0] ?? word.readings[0] ?? '';
    const reading = word.kanjiForms[0] ? word.readings[0] : undefined;
    const { en, es } = senseGlosses(word.senses);
    return option(
      `search-word-${index}`,
      wordHref(learn, word.id),
      reading ? `${form} · ${reading}` : form,
      pickMeaning(en, es, locale).primary.join(', '),
    );
  });
  return [...kanji, ...words];
}
