// Books from the `library` collection (src/content/library/en/<slug>.md), ready for the pages.

import { type CollectionEntry, getCollection } from 'astro:content';

import { DEFAULT_LOCALE, type Locale } from '../../i18n';
import { type BookFacts, type Category, compareBooks, fold, LEVELS } from './filter';

export type BookEntry = CollectionEntry<'library'>;
export type BookText = BookEntry | CollectionEntry<'libraryTranslations'>;

/** Cover colour: listening books are info, reading and kanji accent, the rest ink (image 09). */
export type CoverTone = 'ink' | 'accent' | 'info';

export interface Book extends BookFacts {
  entry: BookEntry;
  /** The description in the requested locale, or the English entry when there is no translation. */
  body: BookText;
  /** Whether `text` is in the requested locale. */
  translated: boolean;
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

/** Every book, with its text in `locale` when translated, in the recommended order. */
export async function getBooks(locale: Locale = DEFAULT_LOCALE): Promise<Book[]> {
  const entries = await getCollection('library', (entry) =>
    entry.id.startsWith(`${DEFAULT_LOCALE}/`),
  );
  const translations = new Map(
    (await getCollection('libraryTranslations'))
      .filter((entry) => entry.id.startsWith(`${locale}/`))
      .map((entry) => [entry.id.slice(locale.length + 1), entry]),
  );
  const books = entries.map((entry): Book => {
    const { data } = entry;
    const slug = slugOf(entry);
    const translation = locale === DEFAULT_LOCALE ? undefined : translations.get(slug);
    const title = translation?.data.title ?? data.title;
    const levels = [...data.level].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b));
    return {
      entry,
      body: translation ?? entry,
      translated: locale === DEFAULT_LOCALE || translation !== undefined,
      slug,
      title,
      levels,
      categories: data.categories,
      audio: data.resources.audio,
      exercises: data.resources.exercises,
      editions: data.editions,
      featured: data.featured,
      text: fold(
        [title, data.author, ...data.categories, (translation ?? entry).body ?? ''].join(' '),
      ),
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
