// Anti-cheat plausibility checks for a submitted run (08-spec-game: "Anti-cheat").
// Plausibility, not proof: the game runs in the browser. Every failure gives the same
// answer to the client; the reason is only logged on the server.

import {
  DIFFICULTIES,
  DIFFICULTY,
  type Difficulty,
  endlessLevel,
  endlessPool,
  endlessTuning,
} from '../../../game/config';
import { accuracy, consistency, wpm } from '../../../game/metrics';
import { errorSeconds, rawPerSecond, wpmSeries } from '../../../game/summary';
import type { Sample } from '../../../game/types';
import { downsample } from './ranking';
import type { Combo, GameRunRecord } from './types';

/** A run expires this long after the countdown started (single use). */
export const RUN_TTL_MS = 2 * 60 * 60 * 1000;
/** Real time may be this much shorter than the declared duration (clock and network slack). */
export const CLOCK_SLACK_S = 3;
export const MAX_WPM = 250;
/** Declared metrics may differ from the recomputed ones by rounding only. */
const METRIC_SLACK = 1;
/** A trailing sample shorter than this is not recorded (same as the engine). */
const MIN_SAMPLE = 0.05;

/** What the client sends about a finished run. */
export interface RunClaim extends Combo {
  runId: string;
  status: 'cleared' | 'failed';
  /** Seconds played, with decimals. */
  duration: number;
  /** Correct and wrong keys per second of play, oldest first; the last may be partial. */
  samples: readonly (readonly [number, number])[];
  correctKeys: number;
  wrongKeys: number;
  popped: number;
  missed: number;
  /** Text of every item popped (each once). */
  items: readonly string[];
  /** Rounded metrics shown on the results screen. */
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
}

/** The checked numbers that go into the leaderboard. */
export interface VerifiedRun {
  cleared: boolean;
  durationS: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  popped: number;
  missed: number;
  series: number[];
  errors: number[];
}

export type VerifyResult = { ok: true; run: VerifiedRun } | { ok: false; reason: string };

/** Text of the items a run of this combination can show (Endless: every pool it can reach). */
export type ItemLookup = (combo: Combo, duration: number) => Promise<ReadonlySet<string>>;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The difficulties whose lists an endless run of `duration` seconds can reach. */
export function reachablePools(combo: Combo, duration: number): Difficulty[] {
  if (combo.mode === 'challenge') return [combo.difficulty];
  const last = endlessPool(combo.difficulty, endlessLevel(duration));
  return DIFFICULTIES.slice(DIFFICULTIES.indexOf(combo.difficulty), DIFFICULTIES.indexOf(last) + 1);
}

/** Most bubbles the spawner can create in `duration` seconds (one at 0, then one per interval). */
export function maxSpawns(combo: Combo, duration: number): number {
  const config = DIFFICULTY[combo.difficulty];
  const every =
    combo.mode === 'endless'
      ? endlessTuning(config, endlessLevel(duration)).spawnEvery
      : config.spawnEvery;
  return 1 + Math.ceil(duration / every);
}

/** Sample lengths as the engine records them: whole seconds, then the rest if ≥ 0.05 s. */
function sampleLengths(count: number, duration: number): number[] | null {
  const whole = Math.floor(duration);
  const rest = duration - whole;
  if (count === whole) return Array.from({ length: count }, () => 1);
  if (count === whole + 1 && rest >= MIN_SAMPLE - 1e-6) {
    return Array.from({ length: count }, (_, index) => (index < whole ? 1 : rest));
  }
  return null;
}

export function verifyRun(
  claim: RunClaim,
  run: GameRunRecord | null,
  now: number,
  items: ReadonlySet<string>,
): VerifyResult {
  const fail = (reason: string): VerifyResult => ({ ok: false, reason });

  if (!run) return fail('unknown run');
  if (run.usedAt !== null) return fail('run already used');
  if (now - run.serverStart > RUN_TTL_MS) return fail('run expired');
  if (
    run.script !== claim.script ||
    run.difficulty !== claim.difficulty ||
    run.mode !== claim.mode
  ) {
    return fail('combination does not match');
  }

  const { duration } = claim;
  if (!(duration > 0)) return fail('no duration');
  if ((now - run.serverStart) / 1000 < duration - CLOCK_SLACK_S)
    return fail('faster than real time');

  const config = DIFFICULTY[claim.difficulty];
  if (claim.mode === 'challenge') {
    if (claim.status === 'cleared' && Math.abs(duration - config.challengeTime) > 0.5) {
      return fail('cleared before the end');
    }
    if (claim.status === 'failed' && duration >= config.challengeTime) {
      return fail('failed after the end');
    }
  } else if (claim.status !== 'failed') {
    return fail('endless runs end by failing');
  }

  // Lives: a miss costs one, Extreme also one per N wrong keys.
  const penalty = config.wrongKeysPerLife
    ? Math.floor(claim.wrongKeys / config.wrongKeysPerLife)
    : 0;
  const lost = claim.missed + penalty;
  if (claim.status === 'cleared' ? lost >= config.lives : lost < config.lives) {
    return fail('lives do not add up');
  }

  const lengths = sampleLengths(claim.samples.length, duration);
  if (!lengths) return fail('sample count');
  const samples: Sample[] = claim.samples.map(([correct, wrong], index) => ({
    correct,
    wrong,
    seconds: lengths[index] ?? 1,
  }));
  const correct = samples.reduce((sum, sample) => sum + sample.correct, 0);
  const wrong = samples.reduce((sum, sample) => sum + sample.wrong, 0);
  if (correct !== claim.correctKeys || wrong !== claim.wrongKeys) return fail('key counts');

  const computed = {
    wpm: wpm(correct, duration),
    rawWpm: wpm(correct + wrong, duration),
    accuracy: accuracy(correct, wrong),
    consistency: consistency(rawPerSecond(samples)),
  };
  for (const key of ['wpm', 'rawWpm', 'accuracy', 'consistency'] as const) {
    if (Math.abs(computed[key] - claim[key]) > METRIC_SLACK) return fail(`${key} mismatch`);
  }
  if (computed.wpm > MAX_WPM) return fail('wpm limit');

  if (claim.popped + claim.missed > maxSpawns(claim, duration)) return fail('too many bubbles');
  if (claim.popped > correct) return fail('pops without keys');
  if (claim.items.length > claim.popped || (claim.popped > 0 && claim.items.length === 0)) {
    return fail('item count');
  }
  if (claim.items.some((text) => !items.has(text))) return fail('unknown item');

  return {
    ok: true,
    run: {
      cleared: claim.status === 'cleared',
      durationS: Math.round(duration),
      wpm: round2(computed.wpm),
      rawWpm: round2(computed.rawWpm),
      accuracy: round2(computed.accuracy),
      consistency: round2(computed.consistency),
      popped: claim.popped,
      missed: claim.missed,
      series: downsample(wpmSeries(samples).map(Math.round)),
      errors: errorSeconds(samples),
    },
  };
}
