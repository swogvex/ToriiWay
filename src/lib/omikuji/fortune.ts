// Pure omikuji logic for the 404 page (07-spec-shell): drawing, good/bad and the lucky path.
// Shared by the page (build time) and the island (browser), so no astro:content here.

import type { SectionId } from '../nav';

/** One fortune already resolved to the page locale. */
export interface Fortune {
  rank: string;
  reading: string;
  romaji: string;
  meaning: string;
  message: string;
  path: SectionId;
  word: string;
  wordKana: string;
  wordMeaning: string;
}

/** A rank that contains 凶 (misfortune) is tied to the rope; the others are "tied anyway". */
export function isBad(rank: string): boolean {
  return rank.includes('凶');
}

/** The kanji written on the small paper tied to the rope (小吉 → 吉). */
export function tiedGlyph(rank: string): string {
  return [...rank].at(-1) ?? rank;
}

/** Where each path card links (Learn goes straight to the hiragana chart). */
export const PATH_HREF: Readonly<Record<SectionId, string>> = {
  home: '/',
  game: '/game',
  learn: '/learn/hiragana',
  library: '/library',
  jlpt: '/jlpt',
  community: '/community',
};

/** Card glyphs, in the order of the "Pick a path" row (image 17a). */
export const PATH_GLYPH: Readonly<Record<SectionId, string>> = {
  home: '家',
  game: '打',
  learn: '学',
  library: '本',
  jlpt: '試',
  community: '輪',
};

/**
 * Index of the next fortune: random, never the previous one. `random` returns [0, 1).
 * With one fortune there is nothing else to draw, so it comes back.
 */
export function drawIndex(count: number, previous: number | null, random: () => number): number {
  if (count <= 1) return 0;
  if (previous === null || previous < 0 || previous >= count) {
    return Math.min(count - 1, Math.floor(random() * count));
  }
  // Pick among the other count - 1 and skip over the previous one.
  const pick = Math.min(count - 2, Math.floor(random() * (count - 1)));
  return pick >= previous ? pick + 1 : pick;
}
