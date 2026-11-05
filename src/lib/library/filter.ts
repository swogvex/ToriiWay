// Library filters (11-spec-library): OR within a group, AND across groups; state in the URL.

export const LEVELS = ['kana', 'N5', 'N4', 'N3', 'N2', 'N1'] as const;
export const CATEGORIES = [
  'vocabulary',
  'reading',
  'listening',
  'kanji',
  'grammar',
  'jlpt',
] as const;
export const RESOURCES = ['audio', 'exercises', 'es', 'en'] as const;
export const SORTS = ['recommended', 'az', 'level'] as const;

export type Level = (typeof LEVELS)[number];
export type Category = (typeof CATEGORIES)[number];
export type Resource = (typeof RESOURCES)[number];
export type Sort = (typeof SORTS)[number];

/** What filtering needs to know about a book. */
export interface BookFacts {
  slug: string;
  title: string;
  levels: readonly Level[];
  categories: readonly Category[];
  audio: boolean;
  exercises: boolean;
  editions: readonly string[];
  featured: boolean;
  /** Lowercase, accent-free text searched by the query (title, author, categories, description). */
  text: string;
}

export interface LibraryState {
  levels: Level[];
  categories: Category[];
  resources: Resource[];
  query: string;
  sort: Sort;
}

export const EMPTY_STATE: LibraryState = {
  levels: [],
  categories: [],
  resources: [],
  query: '',
  sort: 'recommended',
};

/** Lowercase without accents, so "japones" finds "japonés". */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function listParam<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  const wanted = value.split(',');
  return allowed.filter((item) => wanted.includes(item));
}

export function stateFromSearch(search: string): LibraryState {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');
  return {
    levels: listParam(params.get('level'), LEVELS),
    categories: listParam(params.get('category'), CATEGORIES),
    resources: listParam(params.get('resources'), RESOURCES),
    query: (params.get('q') ?? '').slice(0, 64),
    sort: SORTS.includes(sort as Sort) ? (sort as Sort) : 'recommended',
  };
}

/** Query string with defaults left out, e.g. `?level=N5,N4&category=grammar`. */
export function searchFromState(state: LibraryState): string {
  const params = new URLSearchParams();
  if (state.levels.length) params.set('level', state.levels.join(','));
  if (state.categories.length) params.set('category', state.categories.join(','));
  if (state.resources.length) params.set('resources', state.resources.join(','));
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.sort !== 'recommended') params.set('sort', state.sort);
  const query = params.toString().replaceAll('%2C', ',');
  return query ? `?${query}` : '';
}

function hasResource(book: BookFacts, resource: Resource): boolean {
  if (resource === 'audio') return book.audio;
  if (resource === 'exercises') return book.exercises;
  return book.editions.includes(resource);
}

export function matches(book: BookFacts, state: LibraryState): boolean {
  if (state.levels.length && !state.levels.some((level) => book.levels.includes(level))) {
    return false;
  }
  if (state.categories.length && !state.categories.some((c) => book.categories.includes(c))) {
    return false;
  }
  // Resources are all required: "With audio" + "Spanish edition" means both.
  if (!state.resources.every((resource) => hasResource(book, resource))) return false;
  const words = fold(state.query).split(/\s+/).filter(Boolean);
  return words.every((word) => book.text.includes(word));
}

const levelRank = (book: BookFacts) => Math.min(...book.levels.map((l) => LEVELS.indexOf(l)));

/** Recommended: featured first, then easiest level, then title. Level: easiest first. */
export function compareBooks(sort: Sort): (a: BookFacts, b: BookFacts) => number {
  const byTitle = (a: BookFacts, b: BookFacts) => a.title.localeCompare(b.title, 'en');
  if (sort === 'az') return byTitle;
  if (sort === 'level') return (a, b) => levelRank(a) - levelRank(b) || byTitle(a, b);
  return (a, b) =>
    Number(b.featured) - Number(a.featured) || levelRank(a) - levelRank(b) || byTitle(a, b);
}
