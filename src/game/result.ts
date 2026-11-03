import type { GameResult } from '../lib/progress/game';
import { accuracy, wpm } from './metrics';
import type { Run } from './run';
import type { PlaySettings } from './settings';

/** A finished run as stored in progress (rounded numbers, local date). */
export function runResult(
  run: Pick<Run, 'stats' | 'elapsed' | 'level'>,
  settings: Pick<PlaySettings, 'script' | 'difficulty' | 'mode'>,
  status: GameResult['status'],
  now = new Date(),
): GameResult {
  const { stats, elapsed, level } = run;
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return {
    script: settings.script,
    difficulty: settings.difficulty,
    mode: settings.mode,
    status,
    wpm: Math.round(wpm(stats.correctKeys, elapsed)),
    accuracy: Math.round(accuracy(stats.correctKeys, stats.wrongKeys)),
    popped: stats.popped,
    time: Math.round(elapsed),
    level,
    date,
  };
}
