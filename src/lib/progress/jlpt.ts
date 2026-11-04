/**
 * The JLPT run in progress, kept in this browser so a reload or a closed tab can resume
 * it (09-spec-jlpt: the timer keeps running on the server). The email never leaves the
 * browser until the player asks for their results by email.
 */
import { JLPT_LEVELS } from '../jlpt/levels';
import type { JlptLevel } from '../jlpt/types';

export const JLPT_KEY = 'tw:v1:jlpt';

export interface StoredAnswer {
  choice: number | null;
  /** Server time of the choice (client time + offset). */
  at: number;
}

export interface StoredRun {
  id: string;
  level: JlptLevel;
  email: string | null;
  /** Server clock minus client clock, in milliseconds. */
  offset: number;
  /** Answers of the current section, by question ID. */
  answers: Record<string, StoredAnswer>;
  /** Flagged question IDs of the current section. */
  flags: string[];
  /** The section the answers and flags belong to. */
  section: number;
  /** Times each listening clip of the current section has been played. */
  plays?: Record<string, number>;
}

let memory: string | null = null;

function read(): string | null {
  try {
    return localStorage.getItem(JLPT_KEY);
  } catch {
    return memory;
  }
}

function write(value: string | null): void {
  memory = value;
  try {
    if (value === null) localStorage.removeItem(JLPT_KEY);
    else localStorage.setItem(JLPT_KEY, value);
  } catch {
    // Storage is blocked: the in-memory copy still covers this page.
  }
}

function isRun(value: unknown): value is StoredRun {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Partial<StoredRun>;
  return (
    typeof run.id === 'string' &&
    JLPT_LEVELS.includes(run.level as JlptLevel) &&
    (run.email === null || typeof run.email === 'string') &&
    typeof run.offset === 'number' &&
    typeof run.section === 'number' &&
    typeof run.answers === 'object' &&
    run.answers !== null &&
    Array.isArray(run.flags)
  );
}

export function loadRun(): StoredRun | null {
  const raw = read();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRun(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRun(run: StoredRun): void {
  write(JSON.stringify(run));
}

export function clearRun(): void {
  write(null);
}
