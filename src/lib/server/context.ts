// Builds the API dependencies for the current request.

import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import {
  DATABASE_URL,
  IP_HASH_SALT,
  JLPT_MEMORY_STORE,
  RESEND_API_KEY,
  TURNSTILE_SECRET_KEY,
} from 'astro:env/server';

import { type Difficulty, type GameScript } from '../../game/config';
import { getGameItems } from '../game/items';
import { type GameStore, memoryGameStore } from '../game/leaderboard/store';
import { reachablePools } from '../game/leaderboard/verify';
import type { BankMondai } from '../jlpt/paper';
import { memoryStore, type RunStore } from '../jlpt/store';
import { type CounterDeps, type CounterStore, memoryCounterStore } from './counters';
import { sendWithResend, type EmailMessage } from './email';
import { hashIp, HttpError } from './http';
import { secretFor, verifyTurnstile } from './turnstile';
import { type DictionaryDetailStore, memoryDetailStore } from '../dictionary/detail';
import { type DictionaryStore, memoryDictionaryStore } from '../dictionary/store';
import type { DictionaryDeps } from './dictionary-api';
import type { GameDeps } from './game-api';
import type { JlptDeps } from './jlpt-api';

let store: RunStore | undefined;
let bank: BankMondai[] | undefined;
let gameStore: GameStore | undefined;
let counterStore: CounterStore | undefined;
let dictionaryStore: DictionaryStore | undefined;
let detailStore: DictionaryDetailStore | undefined;
let counterKeys: Promise<Set<string>> | undefined;
/** Item texts per game list, loaded once per server instance. */
const itemTexts = new Map<string, Promise<Set<string>>>();

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

async function getCounterStore(): Promise<CounterStore> {
  if (counterStore) return counterStore;
  if (DATABASE_URL) {
    const { drizzleCounterStore } = await import('../../db/counter-store');
    counterStore = drizzleCounterStore(DATABASE_URL);
  } else if (JLPT_MEMORY_STORE || import.meta.env.DEV) {
    counterStore = memoryCounterStore();
  } else {
    throw new HttpError('unavailable', 503, 'DATABASE_URL is not set');
  }
  return counterStore;
}

/** `library:<slug>` for every book: the only keys /api/counters accepts. */
function allowedCounterKeys(): Promise<Set<string>> {
  counterKeys ??= getCollection('library', (entry) => entry.id.startsWith('en/')).then(
    (entries) => new Set(entries.map((entry) => `library:${entry.id.slice(3)}`)),
  );
  return counterKeys;
}

async function getDictionaryStore(): Promise<DictionaryStore> {
  if (dictionaryStore) return dictionaryStore;
  if (DATABASE_URL) {
    const { drizzleDictionaryStore } = await import('../../db/dictionary-store');
    dictionaryStore = drizzleDictionaryStore(DATABASE_URL);
  } else if (JLPT_MEMORY_STORE || import.meta.env.DEV) {
    dictionaryStore = memoryDictionaryStore();
  } else {
    throw new HttpError('unavailable', 503, 'DATABASE_URL is not set');
  }
  return dictionaryStore;
}

export async function getDictionaryDetailStore(): Promise<DictionaryDetailStore> {
  if (detailStore) return detailStore;
  if (DATABASE_URL) {
    const { drizzleDictionaryDetailStore } = await import('../../db/dictionary-detail-store');
    detailStore = drizzleDictionaryDetailStore(DATABASE_URL);
  } else if (JLPT_MEMORY_STORE || import.meta.env.DEV) {
    detailStore = memoryDetailStore();
  } else {
    throw new HttpError('unavailable', 503, 'DATABASE_URL is not set');
  }
  return detailStore;
}

export async function dictionaryDeps(context: RequestContext): Promise<DictionaryDeps> {
  const limits = await getStore();
  return {
    store: await getDictionaryStore(),
    clientKey: () => hashIp(clientIp(context), salt()),
    rateLimit: (key, limit, windowMs) => limits.rateLimit(key, limit, windowMs, Date.now()),
  };
}

export async function counterDeps(context: RequestContext): Promise<CounterDeps> {
  const limits = await getStore();
  return {
    store: await getCounterStore(),
    site: context.site ?? new URL(context.request.url),
    now: () => Date.now(),
    clientKey: () => hashIp(clientIp(context), salt()),
    rateLimit: (key, limit, windowMs) => limits.rateLimit(key, limit, windowMs, Date.now()),
    allowed: allowedCounterKeys,
  };
}

async function getGameStore(): Promise<GameStore> {
  if (gameStore) return gameStore;
  if (DATABASE_URL) {
    const { drizzleGameStore } = await import('../../db/game-store');
    gameStore = drizzleGameStore(DATABASE_URL);
  } else if (JLPT_MEMORY_STORE || import.meta.env.DEV) {
    gameStore = memoryGameStore();
  } else {
    throw new HttpError('unavailable', 503, 'DATABASE_URL is not set');
  }
  return gameStore;
}

function listTexts(script: GameScript, difficulty: Difficulty): Promise<Set<string>> {
  const key = `${script}/${difficulty}`;
  let texts = itemTexts.get(key);
  if (!texts) {
    texts = getGameItems(script, difficulty).then(
      (items) => new Set(items.map((item) => item.text)),
    );
    itemTexts.set(key, texts);
  }
  return texts;
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

/** Resend in production; elsewhere without a key, the email is only logged. */
async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (RESEND_API_KEY) return sendWithResend(RESEND_API_KEY, message);
  if (import.meta.env.DEV || JLPT_MEMORY_STORE) {
    console.info(
      `[email] (not sent, no RESEND_API_KEY) to=${message.to} subject=${message.subject}`,
    );
    return true;
  }
  return false;
}

export async function jlptDeps(context: RequestContext): Promise<JlptDeps> {
  return {
    store: await getStore(),
    bank: await getBank(),
    site: context.site ?? new URL(context.request.url),
    now: () => Date.now(),
    clientKey: () => hashIp(clientIp(context), salt()),
    newId: () => crypto.randomUUID(),
    newSeed: () => crypto.getRandomValues(new Int32Array(1))[0] ?? 0,
    verifyHuman: (token) =>
      verifyTurnstile(
        token,
        secretFor(process.env.VERCEL_ENV, TURNSTILE_SECRET_KEY),
        clientIp(context),
      ),
    sendEmail,
  };
}

export async function gameDeps(context: RequestContext): Promise<GameDeps> {
  const limits = await getStore();
  return {
    store: await getGameStore(),
    site: context.site ?? new URL(context.request.url),
    now: () => Date.now(),
    clientKey: () => hashIp(clientIp(context), salt()),
    newId: () => crypto.randomUUID(),
    newSeed: () => crypto.getRandomValues(new Int32Array(1))[0] ?? 0,
    verifyHuman: (token) =>
      verifyTurnstile(
        token,
        secretFor(process.env.VERCEL_ENV, TURNSTILE_SECRET_KEY),
        clientIp(context),
      ),
    rateLimit: (key, limit, windowMs) => limits.rateLimit(key, limit, windowMs, Date.now()),
    items: async (combo, duration) => {
      const lists = await Promise.all(
        reachablePools(combo, duration).map((difficulty) => listTexts(combo.script, difficulty)),
      );
      return new Set(lists.flatMap((texts) => [...texts]));
    },
  };
}
