import { getCollection } from 'astro:content';

import type { Difficulty } from '../../game/config';
import { getKana } from '../kana/data';

export type GameScript = 'hiragana' | 'katakana' | 'kanji';

/** One bubble's content. Single kana have no meaning to show on pop. */
export interface GameItem {
  text: string;
  reading: string;
  en?: string;
  es?: string;
}

/**
 * Items for a script and difficulty, or an empty list when none exist yet.
 * Easy kana are the basic 46 from the kana collection, not a separate list.
 */
export async function getGameItems(
  script: GameScript,
  difficulty: Difficulty,
): Promise<GameItem[]> {
  if (script !== 'kanji' && difficulty === 'easy') {
    const kana = await getKana(script);
    return kana
      .filter((item) => item.group === 'gojuon')
      .map((item) => ({ text: item.char, reading: item.char }));
  }
  const lists = await getCollection(
    'game',
    (entry) => entry.data.script === script && entry.data.difficulty === difficulty,
  );
  return lists.flatMap((entry) =>
    entry.data.items.map(({ text, reading, en, es }) => ({ text, reading, en, ...(es && { es }) })),
  );
}
