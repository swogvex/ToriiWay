// What the results screen sends to the leaderboard about a finished run. The server
// recomputes every metric from these counters (src/lib/game/leaderboard/verify.ts).

import type { RunClaim } from '../lib/game/leaderboard/verify';
import type { Run, RunStatus } from './run';
import type { PlaySettings } from './settings';
import { summarize } from './summary';

/** A run handed out by the server at the countdown. */
export interface ServerRun {
  runId: string;
  seed: number;
}

/** Runs that can be offered for the leaderboard: cleared or failed, at normal speed. */
export function canSubmit(status: RunStatus, reducedMotion: boolean): boolean {
  return (status === 'cleared' || status === 'failed') && !reducedMotion;
}

export function buildClaim(
  run: Pick<Run, 'stats' | 'elapsed' | 'samples' | 'log'>,
  settings: Pick<PlaySettings, 'script' | 'difficulty' | 'mode'>,
  status: 'cleared' | 'failed',
  runId: string,
): RunClaim {
  const summary = summarize(run);
  const popped = [...new Set(run.log.filter((entry) => entry.popped).map((e) => e.item.text))];
  return {
    runId,
    script: settings.script,
    difficulty: settings.difficulty,
    mode: settings.mode,
    status,
    duration: run.elapsed,
    samples: run.samples.map((sample) => [sample.correct, sample.wrong] as const),
    correctKeys: run.stats.correctKeys,
    wrongKeys: run.stats.wrongKeys,
    popped: run.stats.popped,
    missed: run.stats.missed,
    items: popped,
    wpm: summary.wpm,
    rawWpm: summary.raw,
    accuracy: summary.accuracy,
    consistency: summary.consistency,
  };
}

/**
 * Random numbers for a run that starts before the server seed arrives: the first call
 * uses the server seed if it is there by then, otherwise the local fallback. The first
 * call happens at the first spawn, after the 3-second countdown.
 */
export function lazySeededRandom(
  server: () => number | null,
  fallback: () => number,
  seeded: (seed: number) => () => number,
): () => number {
  let source: (() => number) | null = null;
  return () => {
    if (!source) {
      const seed = server();
      source = seed === null ? fallback : seeded(seed);
    }
    return source();
  };
}
