import { DIFFICULTIES, type Difficulty, type GameScript } from './config';
import type { GameItem } from './types';

/** Items of one list, or an empty list when it does not exist yet. */
export async function loadItems(script: GameScript, difficulty: Difficulty): Promise<GameItem[]> {
  try {
    const response = await fetch(`/data/game/${script}/${difficulty}.json`);
    if (!response.ok) return [];
    return (await response.json()) as GameItem[];
  } catch {
    return [];
  }
}

/** Endless: the lists after the chosen difficulty, for the pool shifts. */
export async function loadLongerPools(
  script: GameScript,
  difficulty: Difficulty,
): Promise<Partial<Record<Difficulty, GameItem[]>>> {
  const longer = DIFFICULTIES.slice(DIFFICULTIES.indexOf(difficulty) + 1);
  const lists = await Promise.all(longer.map((next) => loadItems(script, next)));
  return Object.fromEntries(longer.map((next, index) => [next, lists[index] ?? []]));
}
