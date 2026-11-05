// Pure helpers for `pnpm library:add` (scripts/library/add.ts): slug, list parsing and the
// Markdown file, so the interactive script stays thin and these stay tested.

// .ts extension: scripts/library/add.ts runs this file directly with Node.
import { CATEGORIES, LEVELS } from './filter.ts';

export const EDITIONS = ['ja', 'en', 'es'] as const;
export const DEFAULT_LICENSE = 'All rights reserved — linked to the publisher';

export interface NewBook {
  title: string;
  author: string;
  levels: string[];
  categories: string[];
  audio: boolean;
  exercises: boolean;
  editions: string[];
  url: string;
  license: string;
  coverKanji: string;
  featured: boolean;
  description: string;
}

/** "Kanji para recordar 1 / Remembering…" → "kanji-para-recordar-1-remembering". */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * "n5, N4 kana" → ["kana", "N5", "N4"] in the canonical order. Returns null when a value is
 * not allowed, so the script can ask again.
 */
export function parseList(input: string, allowed: readonly string[]): string[] | null {
  const words = input
    .split(/[\s,]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return null;
  const picked = new Set<string>();
  for (const word of words) {
    const match = allowed.find((value) => value.toLowerCase() === word.toLowerCase());
    if (!match) return null;
    picked.add(match);
  }
  return allowed.filter((value) => picked.has(value));
}

export const parseLevels = (input: string) => parseList(input, LEVELS);
export const parseCategories = (input: string) => parseList(input, CATEGORIES);
export const parseEditions = (input: string) => parseList(input, EDITIONS);

/** "s", "si", "sí", "y", "yes" → true; "n", "no" → false; anything else → null. */
export function parseYesNo(input: string): boolean | null {
  const value = input.trim().toLowerCase();
  if (['s', 'si', 'sí', 'y', 'yes'].includes(value)) return true;
  if (['n', 'no'].includes(value)) return false;
  return null;
}

export function isHttpsUrl(input: string): boolean {
  try {
    return new URL(input).protocol === 'https:';
  } catch {
    return false;
  }
}

/** One visible character (a kanji or kana) for the cover. */
export function isCoverKanji(input: string): boolean {
  return [...input.trim()].length === 1 && /\p{L}/u.test(input.trim());
}

/** Single-quoted YAML (Prettier's style): a quote inside is written twice. */
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** The file src/content/library/en/<slug>.md, in the same format as the seed books. */
export function bookMarkdown(book: NewBook): string {
  return `---
title: ${quote(book.title)}
author: ${quote(book.author)}
level: [${book.levels.join(', ')}]
categories: [${book.categories.join(', ')}]
resources:
  audio: ${book.audio}
  exercises: ${book.exercises}
editions: [${book.editions.join(', ')}]
link:
  kind: official
  url: ${book.url}
license: ${quote(book.license)}
coverKanji: ${book.coverKanji.trim()}
featured: ${book.featured}
---

${book.description.trim()}
`;
}
