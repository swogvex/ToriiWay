import { describe, expect, it, vi } from 'vitest';

import { memoryDictionaryStore } from '../dictionary/store';
import { dictionarySearchHandler, type DictionaryDeps } from './dictionary-api';
import { HttpError } from './http';

const deps = (overrides: Partial<DictionaryDeps> = {}): DictionaryDeps => ({
  store: memoryDictionaryStore(),
  clientKey: () => Promise.resolve('client'),
  rateLimit: () => Promise.resolve(true),
  ...overrides,
});

const url = (query: string) => new URL(`https://example.test/api/dictionary/search?${query}`);

async function rejected(promise: Promise<Response>): Promise<HttpError> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpError);
  return error as HttpError;
}

describe('dictionarySearchHandler', () => {
  it('returns results for a valid query', async () => {
    const response = await dictionarySearchHandler(url('q=uno&lang=es'), deps());
    const body = (await response.json()) as { kanji: { literal: string }[] };
    expect(response.status).toBe(200);
    expect(body.kanji[0]?.literal).toBe('一');
  });

  it.each(['', 'q=', 'q=%20', `q=${'a'.repeat(65)}`, 'q=a&lang=fr', 'q=a&extra=1'])(
    'rejects the query "%s"',
    async (query) => {
      expect((await rejected(dictionarySearchHandler(url(query), deps()))).status).toBe(400);
    },
  );

  it('counts each search against the client limit', async () => {
    const rateLimit = vi.fn(() => Promise.resolve(true));
    await dictionarySearchHandler(url('q=uno'), deps({ rateLimit }));
    expect(rateLimit).toHaveBeenCalledWith('dictionary-search:client', 60, 60_000);
  });

  it('answers 429 once the limit is reached and does not search', async () => {
    const search = vi.fn();
    const error = await rejected(
      dictionarySearchHandler(
        url('q=uno'),
        deps({ store: { search }, rateLimit: () => Promise.resolve(false) }),
      ),
    );
    expect(error.status).toBe(429);
    expect(search).not.toHaveBeenCalled();
  });

  it('skips the database when nothing is searchable', async () => {
    const search = vi.fn();
    const response = await dictionarySearchHandler(url('q=(%20)'), deps({ store: { search } }));
    expect(await response.json()).toEqual({ kanji: [], words: [], counts: { kanji: 0, words: 0 } });
    expect(search).not.toHaveBeenCalled();
  });
});
