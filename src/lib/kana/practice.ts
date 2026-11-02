/** The fields of a kana a practice prompt needs. */
export interface PracticeKana {
  char: string;
  romaji: string;
  variants: string[];
}

export interface Prompt<T extends PracticeKana = PracticeKana> {
  kana: T;
  /** Four romaji options for multiple choice, the right one included, in random order. */
  choices: string[];
}

export const MIN_PROMPTS = 10;
export const MAX_PROMPTS = 20;
const CHOICES = 4;

/** Fisher–Yates shuffle with an injectable random source (tests pass a seeded one). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

/**
 * A practice round over the chosen kana: 10–20 prompts (one per kana, repeated when
 * fewer than 10 are chosen, never the same kana twice in a row when avoidable). Wrong
 * choices come from the chosen kana first, so a row tests ka against ki, ku…, and then
 * from `distractors`; never another spelling of the answer (じ and ぢ are both "ji").
 */
export function buildRound<T extends PracticeKana>(
  pool: readonly T[],
  distractors: readonly PracticeKana[],
  random: () => number = Math.random,
): Prompt<T>[] {
  if (pool.length === 0) return [];
  const count = Math.min(MAX_PROMPTS, Math.max(MIN_PROMPTS, pool.length));
  const order: T[] = [];
  while (order.length < count) {
    let batch = shuffle(pool, random);
    if (batch.length > 1 && batch[0] === order.at(-1)) batch = [...batch.slice(1), batch[0] as T];
    order.push(...batch);
  }

  const romajiOf = (items: readonly PracticeKana[]) => [
    ...new Set(items.map((item) => item.romaji)),
  ];
  return order.slice(0, count).map((kana) => {
    const allowed = (romaji: string) => !kana.variants.includes(romaji);
    const near = shuffle(romajiOf(pool).filter(allowed), random);
    const far = shuffle(
      romajiOf(distractors).filter((romaji) => allowed(romaji) && !near.includes(romaji)),
      random,
    );
    const wrong = [...near, ...far].slice(0, CHOICES - 1);
    return { kana, choices: shuffle([kana.romaji, ...wrong], random) };
  });
}

/** Whether typed romaji matches the kana: any accepted spelling, case and spaces ignored. */
export function isCorrect(answer: string, kana: PracticeKana): boolean {
  const typed = answer.trim().toLowerCase().replace(/\s+/g, '');
  return typed.length > 0 && kana.variants.includes(typed);
}
