// Browser side of the leaderboard: filters ↔ URL, the submitter token and the entries this
// browser submitted. Storage can be blocked: every access is wrapped and falls back to memory.

import { DIFFICULTIES, GAME_SCRIPTS, MODES } from '../../../game/config';
import type { BoardFilter, PublicScore } from './types';

export const SUBMITTER_KEY = 'tw:v1:submitter';
export const MINE_KEY = 'tw:v1:leaderboard-mine';
export const NAME_KEY = 'tw:v1:leaderboard-name';

/** 3–16 letters, digits, _ and - (the server also filters offensive words). */
export const NAME_PATTERN = /^[A-Za-z0-9_-]{3,16}$/;

export const DEFAULT_FILTER: BoardFilter = {
  script: null,
  difficulty: null,
  mode: null,
  sort: 'longest',
};

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** Filters from a query string; unknown values fall back to "All". */
export function filterFromSearch(search: string): BoardFilter {
  const params = new URLSearchParams(search);
  const mode = pick(params.get('mode'), MODES);
  return {
    script: pick(params.get('script'), GAME_SCRIPTS),
    difficulty: pick(params.get('difficulty'), DIFFICULTIES),
    mode,
    sort: mode === 'endless' && params.get('sort') === 'shortest' ? 'shortest' : 'longest',
  };
}

/** Query string for the page URL and the API; defaults are left out. */
export function searchFromFilter(filter: BoardFilter): string {
  const params = new URLSearchParams();
  if (filter.script) params.set('script', filter.script);
  if (filter.difficulty) params.set('difficulty', filter.difficulty);
  if (filter.mode) params.set('mode', filter.mode);
  if (filter.mode === 'endless' && filter.sort === 'shortest') params.set('sort', 'shortest');
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** 754 → "12:34". */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export interface BoardPage {
  entries: PublicScore[];
  next: string | null;
  total: number;
}

const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    storage()?.setItem(key, value);
  } catch {
    // Blocked storage: the value lives for this visit only.
  }
}

/** This browser's token, if it ever submitted a run. */
export function submitterToken(): string | null {
  const token = read(SUBMITTER_KEY);
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null;
}

/** The token, created on first use: 256 random bits as hex. */
export function ensureSubmitterToken(): string {
  const existing = submitterToken();
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  write(SUBMITTER_KEY, token);
  return token;
}

/** IDs of entries this browser submitted (to offer "Remove my run"). */
export function myEntries(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(read(MINE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function rememberEntry(id: string): void {
  const ids = myEntries();
  ids.add(id);
  write(MINE_KEY, JSON.stringify([...ids].slice(-200)));
}

export function forgetEntry(id: string): void {
  const ids = myEntries();
  ids.delete(id);
  write(MINE_KEY, JSON.stringify([...ids]));
}
