import {
  DIFFICULTIES,
  type Difficulty,
  GAME_SCRIPTS,
  type GameScript,
  type Mode,
  MODES,
} from './config';
import { KEYBOARD_LAYOUTS, type KeyboardLayout } from './keyboard';

export interface PlaySettings {
  script: GameScript;
  difficulty: Difficulty;
  mode: Mode;
  layout: KeyboardLayout;
  /** Fixed seed for reproducible runs (tests); random otherwise. */
  seed: number | null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

/** Settings from `?script=hiragana&difficulty=normal&mode=challenge&layout=ansi&seed=1`. */
export function readSettings(search: string): PlaySettings {
  const params = new URLSearchParams(search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return {
    script: oneOf(params.get('script'), GAME_SCRIPTS, 'hiragana'),
    difficulty: oneOf(params.get('difficulty'), DIFFICULTIES, 'normal'),
    mode: oneOf(params.get('mode'), MODES, 'challenge'),
    layout: oneOf(params.get('layout'), KEYBOARD_LAYOUTS, 'ansi'),
    seed: Number.isFinite(seed) ? seed : null,
  };
}

/** "Hiragana · Normal · Challenge", from labels the page renders per locale. */
export function modeLabel(
  settings: PlaySettings,
  labels: Readonly<Record<string, string>>,
): string {
  return [settings.script, settings.difficulty, settings.mode]
    .map((key) => labels[key] ?? key)
    .join(' · ');
}
