import {
  DIFFICULTIES,
  type Difficulty,
  GAME_SCRIPTS,
  type GameScript,
  type Mode,
  MODES,
  TEXT_SIZES,
  type TextSize,
} from './config';
import { KEYBOARD_LAYOUTS, type KeyboardLayout } from './keyboard';

export interface PlaySettings {
  script: GameScript;
  difficulty: Difficulty;
  mode: Mode;
  layout: KeyboardLayout;
  /** Show the romaji under a bubble after the first wrong key on it. */
  hint: boolean;
  /** Show the meaning in the "+1" note on pop. */
  meaning: boolean;
  /** Sound effects (off unless set to 1). */
  sound: boolean;
  /** Reduced motion: forced on or off, or null to follow the system setting. */
  reduce: boolean | null;
  /** Extra shape cues for colour-blind players (off unless set to 1). */
  cues: boolean;
  /** Bubble text size. */
  size: TextSize;
  /** Fixed seed for reproducible runs (tests); random otherwise. */
  seed: number | null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

/**
 * Settings from `?script=hiragana&difficulty=normal&mode=challenge&layout=ansi&hint=0&meaning=0&seed=1`.
 * Hint and meaning are on unless set to 0; sound and cues are off unless set to 1;
 * reduce follows the system unless sent.
 */
export function readSettings(search: string): PlaySettings {
  const params = new URLSearchParams(search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  // The setup form sends a hidden "0" before each checkbox, so the last value wins.
  const last = (name: string) => params.getAll(name).at(-1);
  const on = (name: string) => last(name) !== '0';
  const reduce = last('reduce');
  return {
    script: oneOf(params.get('script'), GAME_SCRIPTS, 'hiragana'),
    difficulty: oneOf(params.get('difficulty'), DIFFICULTIES, 'normal'),
    mode: oneOf(params.get('mode'), MODES, 'challenge'),
    layout: oneOf(params.get('layout'), KEYBOARD_LAYOUTS, 'ansi'),
    hint: on('hint'),
    meaning: on('meaning'),
    sound: last('sound') === '1',
    reduce: reduce === undefined ? null : reduce === '1',
    cues: last('cues') === '1',
    size: oneOf(params.get('size'), TEXT_SIZES, 'm'),
    seed: Number.isFinite(seed) ? seed : null,
  };
}

/** "Hiragana · Normal · Challenge", from labels the page renders per locale. */
export function modeLabel(
  settings: Pick<PlaySettings, 'script' | 'difficulty' | 'mode'>,
  labels: Readonly<Record<string, string>>,
): string {
  return [settings.script, settings.difficulty, settings.mode]
    .map((key) => labels[key] ?? key)
    .join(' · ');
}
