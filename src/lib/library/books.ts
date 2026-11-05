// Books from the `library` collection (src/content/library/en/<slug>.md), ready for the pages.

import { type CollectionEntry, getCollection } from 'astro:content';

import { DEFAULT_LOCALE } from '../../i18n';
import { type BookFacts, type Category, compareBooks, fold, LEVELS } from './filter';

export type BookEntry = CollectionEntry<'library'>;

/** Cover colour: listening books are info, reading and kanji accent, the rest ink (image 09). */
export type CoverTone = 'ink' | 'accent' | 'info';

export interface Book extends BookFacts {
  entry: BookEntry;
  /** Easiest level, shown on the cover ("N5", "Kana"). */
  coverLevel: string;
  tone: CoverTone;
}

export function coverTone(categories: readonly Category[]): CoverTone {
  if (categories.includes('listening')) return 'info';
  if (categories.includes('reading') || categories.includes('kanji')) return 'accent';
  return 'ink';
}

export function slugOf(entry: BookEntry): string {
  return entry.id.slice(DEFAULT_LOCALE.length + 1);
}

/** Every English entry, in the recommended order. */
export async function getBooks(): Promise<Book[]> {
  const entries = await getCollection('library', (entry) =>
    entry.id.startsWith(`${DEFAULT_LOCALE}/`),
  );
  const books = entries.map((entry): Book => {
    const { data } = entry;
    const levels = [...data.level].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b));
    return {
      entry,
      slug: slugOf(entry),
      title: data.title,
      levels,
      categories: data.categories,
      audio: data.resources.audio,
      exercises: data.resources.exercises,
      editions: data.editions,
      featured: data.featured,
      text: fold([data.title, data.author, ...data.categories, entry.body ?? ''].join(' ')),
      coverLevel: levels[0] === 'kana' ? 'Kana' : (levels[0] ?? ''),
      tone: coverTone(data.categories),
    };
  });
  return books.sort(compareBooks('recommended'));
}

/** Up to `count` other books that share a level and a category, recommended order. */
export function relatedBooks(book: Book, all: readonly Book[], count = 3): Book[] {
  return all
    .filter(
      (other) =>
        other.slug !== book.slug &&
        other.levels.some((level) => book.levels.includes(level)) &&
        other.categories.some((category) => book.categories.includes(category)),
    )
    .slice(0, count);
}
