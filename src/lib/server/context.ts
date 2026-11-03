// Builds the API dependencies for the current request.

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { DATABASE_URL, IP_HASH_SALT, JLPT_MEMORY_STORE } from 'astro:env/server';

import type { BankMondai } from '../jlpt/paper';
import { memoryStore, type RunStore } from '../jlpt/store';
import { hashIp, HttpError } from './http';
import type { JlptDeps } from './jlpt-api';

let store: RunStore | undefined;
let bank: BankMondai[] | undefined;

async function getStore(): Promise<RunStore> {
  if (store) return store;
  if (DATABASE_URL) {
    const { drizzleStore } = await import('../../db/jlpt-store');
    store = drizzleStore(DATABASE_URL);
  } else if (JLPT_MEMORY_STORE || import.meta.env.DEV) {
    store = memoryStore();
  } else {
    throw new HttpError('unavailable', 503, 'DATABASE_URL is not set');
  }
  return store;
}

async function getBank(): Promise<BankMondai[]> {
  bank ??= (await getCollection('jlpt')).map((entry) => entry.data);
  return bank;
}

function salt(): string {
  if (IP_HASH_SALT) return IP_HASH_SALT;
  if (import.meta.env.DEV || JLPT_MEMORY_STORE) return 'local-development';
  throw new HttpError('unavailable', 503, 'IP_HASH_SALT is not set');
}

function clientIp(context: RequestContext): string {
  try {
    return context.clientAddress;
  } catch {
    return 'unknown';
  }
}

/** What an API route or a server-rendered page provides. */
type RequestContext = Pick<APIContext, 'site' | 'request' | 'clientAddress'>;

export async function jlptDeps(context: RequestContext): Promise<JlptDeps> {
  return {
    store: await getStore(),
    bank: await getBank(),
    site: context.site ?? new URL(context.request.url),
    now: () => Date.now(),
    clientKey: () => hashIp(clientIp(context), salt()),
    newId: () => crypto.randomUUID(),
    newSeed: () => crypto.getRandomValues(new Int32Array(1))[0] ?? 0,
  };
}
