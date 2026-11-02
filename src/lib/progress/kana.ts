/**
 * Kana progress: "learned" flags and practice results. v1 keeps them in localStorage
 * (no accounts); the interface lets a synced store replace it later (03-architecture).
 */
export interface PracticeResult {
  script: string;
  mode: 'choice' | 'type';
  rows: string[];
  correct: number;
  total: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
}

export interface KanaProgress {
  learned(): Set<string>;
  setLearned(char: string, learned: boolean): void;
  results(): PracticeResult[];
  addResult(result: PracticeResult): void;
}

export const KANA_STORAGE_KEY = 'nnt:v1:kana';
const MAX_RESULTS = 20;

interface StoredProgress {
  learned: string[];
  results: PracticeResult[];
}

function isResult(value: unknown): value is PracticeResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.script === 'string' &&
    (result.mode === 'choice' || result.mode === 'type') &&
    Array.isArray(result.rows) &&
    typeof result.correct === 'number' &&
    typeof result.total === 'number' &&
    typeof result.date === 'string'
  );
}

/** Reads stored progress, dropping anything malformed instead of failing. */
export function parseProgress(raw: string | null): StoredProgress {
  try {
    const data = JSON.parse(raw ?? '{}') as Partial<Record<keyof StoredProgress, unknown>>;
    return {
      learned: Array.isArray(data.learned)
        ? data.learned.filter((char): char is string => typeof char === 'string')
        : [],
      results: Array.isArray(data.results) ? data.results.filter(isResult) : [],
    };
  } catch {
    return { learned: [], results: [] };
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Progress kept in localStorage. When storage is blocked it still works for the visit,
 * in memory.
 */
export function localKanaProgress(
  storage: StorageLike | undefined = browserStorage(),
): KanaProgress {
  let memory: StoredProgress | undefined;

  function read(): StoredProgress {
    if (memory) return memory;
    try {
      return parseProgress(storage?.getItem(KANA_STORAGE_KEY) ?? null);
    } catch {
      return parseProgress(null);
    }
  }

  function write(data: StoredProgress): void {
    memory = data;
    try {
      storage?.setItem(KANA_STORAGE_KEY, JSON.stringify(data));
      memory = undefined;
    } catch {
      // Blocked or full storage: keep the in-memory copy for this visit.
    }
  }

  return {
    learned: () => new Set(read().learned),
    setLearned(char, learned) {
      const data = read();
      const set = new Set(data.learned);
      if (learned) set.add(char);
      else set.delete(char);
      write({ ...data, learned: [...set] });
    },
    results: () => read().results,
    addResult(result) {
      const data = read();
      write({ ...data, results: [...data.results, result].slice(-MAX_RESULTS) });
    },
  };
}
