// GET /api/dictionary/search?q=&lang=

import { z } from 'astro/zod';

import { isEmptyQuery, parseQuery } from '../dictionary/search';
import type { DictionaryStore } from '../dictionary/store';
import { MAX_TERM_LENGTH } from '../dictionary/normalize';
import { HttpError, json } from './http';

const SEARCH_LIMIT = { max: 60, windowMs: 60_000 };
/** Results only change with the monthly import; the CDN keeps the common searches. */
const SEARCH_CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800';

const searchQuery = z.strictObject({
  q: z.string().trim().min(1).max(MAX_TERM_LENGTH),
  lang: z.enum(['en', 'es']).default('en'),
});

export interface DictionaryDeps {
  store: DictionaryStore;
  clientKey: () => Promise<string>;
  rateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
}

export async function dictionarySearchHandler(url: URL, deps: DictionaryDeps): Promise<Response> {
  const parsed = searchQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new HttpError('bad-request', 400, parsed.error.message);

  const query = parseQuery(parsed.data.q);
  if (isEmptyQuery(query)) return json({ kanji: [], words: [], counts: { kanji: 0, words: 0 } });

  // Together, to save a round trip to the database on every search. A rejected caller costs
  // one bounded query, and repeat queries are answered by the CDN.
  const key = `dictionary-search:${await deps.clientKey()}`;
  const [allowed, result] = await Promise.all([
    deps.rateLimit(key, SEARCH_LIMIT.max, SEARCH_LIMIT.windowMs),
    deps.store.search(query, parsed.data.lang),
  ]);
  if (!allowed) throw new HttpError('too-many-requests', 429);

  const response = json(result);
  response.headers.set('Cache-Control', SEARCH_CACHE);
  return response;
}
