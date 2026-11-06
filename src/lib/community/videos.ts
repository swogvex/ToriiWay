// Pure helpers for the video lessons on /community (12-spec-community): category order and
// cover glyphs, the category tabs, filtering and links. Shared by the page and the island.

import type { Category } from './source';

/** Tab order; only categories with videos get a tab (plus "all"). */
export const CATEGORIES: readonly Category[] = ['kana', 'grammar', 'jlpt', 'vocabulary', 'other'];

/** The kanji on each typographic thumbnail (owner, 2026-11-06: kept on thumbnails). */
export const CATEGORY_GLYPH: Readonly<Record<Category, string>> = {
  kana: 'あ',
  grammar: 'は',
  jlpt: '試',
  vocabulary: '語',
  other: '話',
};

export type Filter = Category | 'all';

export interface VideoFacts {
  id: string;
  category: Category;
}

/** "all" first, then the categories that have at least one video, in tab order. */
export function tabsFor(videos: readonly VideoFacts[]): Filter[] {
  const present = new Set(videos.map((video) => video.category));
  return ['all', ...CATEGORIES.filter((category) => present.has(category))];
}

/** The filter from ?category=, falling back to "all" for anything unknown. */
export function readFilter(value: string | null, tabs: readonly Filter[]): Filter {
  return tabs.find((tab) => tab === value) ?? 'all';
}

export function matches(video: VideoFacts, filter: Filter): boolean {
  return filter === 'all' || video.category === filter;
}

/** The video on YouTube (the link without JavaScript, and "watch on YouTube"). */
export const watchUrl = (id: string, short = false) =>
  short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;

/** Privacy-enhanced embed, created only when the visitor presses play. */
export const embedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;

/** "Apr 20, 2026" / "20 abr 2026"; empty for a missing or broken date. */
export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
