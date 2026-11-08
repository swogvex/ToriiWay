// GET /api/dictionary/search?q=&lang=

import { z } from 'astro/zod';

import { isEmptyQuery, parseQuery } from '../dictionary/search';
import type { DictionaryStore } from '../dictionary/store';
import { MAX_TERM_LENGTH } from '../dictionary/normalize';
import { HttpError, json } from './http';

const SEARCH_LIMIT = { max: 60, windowMs: 60_000 };

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

  const key = `dictionary-search:${await deps.clientKey()}`;
  if (!(await deps.rateLimit(key, SEARCH_LIMIT.max, SEARCH_LIMIT.windowMs))) {
    throw new HttpError('too-many-requests', 429);
  }

  const query = parseQuery(parsed.data.q);
  if (isEmptyQuery(query)) return json({ kanji: [], words: [], counts: { kanji: 0, words: 0 } });
  return json(await deps.store.search(query, parsed.data.lang));
}
