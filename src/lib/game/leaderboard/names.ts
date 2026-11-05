// Leaderboard names (13-security: "Names"): 3–16 [A-Za-z0-9_-], unique case-insensitively,
// offensive-word filter on a folded form where digits count as the letters they look like.

import { NAME_PATTERN } from './client';
import { OFFENSIVE_WORDS } from './offensive-words';

export { NAME_PATTERN };

/** The key a name is owned under: "Kenji_99" and "kenji_99" are the same name. */
export function normalizeName(name: string): string {
  return name.toLowerCase();
}

const LOOKALIKE: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
};

/**
 * Lowercase letters only: look-alike digits become letters, separators go, and
 * runs of the same letter shrink to one ("f_u__u-ck" → "fuck"; "kiiill" → "kil").
 */
export function foldName(name: string): string {
  const letters = [...name.toLowerCase()]
    .map((char) => LOOKALIKE[char] ?? char)
    .filter((char) => char >= 'a' && char <= 'z')
    .join('');
  return letters.replace(/(.)\1+/g, '$1');
}

/** Words folded the same way, so "fuuck" in a name matches "fuck" in the list. */
const FOLDED_WORDS = [...new Set(OFFENSIVE_WORDS.map(foldName))].filter((word) => word.length >= 3);

export function isOffensive(name: string): boolean {
  const folded = foldName(name);
  return FOLDED_WORDS.some((word) => folded.includes(word));
}

export type NameProblem = 'format' | 'offensive';

/** Why a name cannot be used, or null when it is fine. */
export function nameProblem(name: string): NameProblem | null {
  if (!NAME_PATTERN.test(name)) return 'format';
  if (isOffensive(name)) return 'offensive';
  return null;
}
