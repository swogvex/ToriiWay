import { accuracy, consistency, kpm, wpm } from './metrics';
import type { GameItem, KanaTime, LogEntry, Run, Sample } from './run';

/** The numbers on the results screen, rounded for display. */
export interface RunSummary {
  wpm: number;
  raw: number;
  accuracy: number;
  consistency: number;
  kpm: number;
  /** Whole seconds played. */
  time: number;
  popped: number;
  missed: number;
}

/** Raw WPM of each full second (all keys), the series consistency is measured on. */
export function rawPerSecond(samples: readonly Sample[]): number[] {
  return samples
    .filter((sample) => sample.seconds >= 1)
    .map((sample) => wpm(sample.correct + sample.wrong, sample.seconds));
}

export function summarize(run: Pick<Run, 'stats' | 'elapsed' | 'samples'>): RunSummary {
  const { stats, elapsed, samples } = run;
  return {
    wpm: Math.round(wpm(stats.correctKeys, elapsed)),
    raw: Math.round(wpm(stats.correctKeys + stats.wrongKeys, elapsed)),
    accuracy: Math.round(accuracy(stats.correctKeys, stats.wrongKeys)),
    consistency: Math.round(consistency(rawPerSecond(samples))),
    kpm: Math.round(kpm(stats.kana, elapsed)),
    time: Math.round(elapsed),
    popped: stats.popped,
    missed: stats.missed,
  };
}

/** WPM so far at the end of each sample: the line on the results chart. */
export function wpmSeries(samples: readonly Sample[]): number[] {
  let keys = 0;
  let seconds = 0;
  return samples.map((sample) => {
    keys += sample.correct;
    seconds += sample.seconds;
    return wpm(keys, seconds);
  });
}

/** Sample indexes (seconds) with at least one wrong key: the × marks on the chart. */
export function errorSeconds(samples: readonly Sample[]): number[] {
  return samples.flatMap((sample, index) => (sample.wrong > 0 ? [index] : []));
}

const KANA = /[ぁ-ゖァ-ヺ]/u;

/**
 * The kana that took longest on average, slowest first. Units without a kana of
 * their own (a lone ー) are skipped; ties keep the order they were first typed.
 */
export function slowestKana(times: readonly KanaTime[], count = 3): string[] {
  const totals = new Map<string, { sum: number; n: number }>();
  for (const { kana, seconds } of times) {
    if (!KANA.test(kana)) continue;
    const total = totals.get(kana) ?? { sum: 0, n: 0 };
    total.sum += seconds;
    total.n += 1;
    totals.set(kana, total);
  }
  return [...totals]
    .map(([kana, { sum, n }]) => ({ kana, average: sum / n }))
    .sort((a, b) => b.average - a.average)
    .slice(0, count)
    .map(({ kana }) => kana);
}

export interface WordEntry {
  item: GameItem;
  /** Times it was popped. */
  popped: number;
  /** Times it reached the far edge. */
  missed: number;
}

/** Each item once, in the order it first left the field. */
export function wordList(log: readonly LogEntry[]): WordEntry[] {
  const words = new Map<string, WordEntry>();
  for (const { item, popped } of log) {
    const key = `${item.text}\u0000${item.reading}`;
    const word = words.get(key) ?? { item, popped: 0, missed: 0 };
    if (popped) word.popped += 1;
    else word.missed += 1;
    words.set(key, word);
  }
  return [...words.values()];
}
