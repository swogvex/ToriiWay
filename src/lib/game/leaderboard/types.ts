// Kana Rush leaderboard records (08-spec-game: "Public leaderboard").

import type { Difficulty, GameScript, Mode } from '../../../game/config';

/** One script × difficulty × mode: the unit a name holds one entry in. */
export interface Combo {
  script: GameScript;
  difficulty: Difficulty;
  mode: Mode;
}

/** A run handed out at the countdown; single use (anti-cheat). */
export interface GameRunRecord extends Combo {
  id: string;
  seed: number;
  /** Epoch milliseconds. */
  serverStart: number;
  usedAt: number | null;
}

/** Owner of a name: only the browser with that token can submit or delete under it. */
export interface GameNameRecord {
  nameNormalized: string;
  submitterHash: string;
  blocked: boolean;
  createdAt: number;
}

export type ScoreStatus = 'visible' | 'hidden';

export interface ScoreRecord extends Combo {
  id: string;
  runId: string;
  name: string;
  nameNormalized: string;
  submitterHash: string;
  cleared: boolean;
  /** Seconds played (whole seconds, rounded). */
  durationS: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  popped: number;
  missed: number;
  /** WPM over time, ≤ 120 evenly spaced points ending at `durationS`. */
  series: number[];
  /** Seconds that had at least one wrong key. */
  errors: number[];
  status: ScoreStatus;
  reports: number;
  createdAt: number;
}

/** What the public API shows: no hashes, no run IDs. */
export type PublicScore = Omit<
  ScoreRecord,
  'runId' | 'nameNormalized' | 'submitterHash' | 'status' | 'reports'
> & {
  rank: number;
};

export type ReportReason = 'name' | 'score';

export interface GameReport {
  id: string;
  scoreId: string;
  reason: ReportReason;
  status: 'open' | 'resolved';
  createdAt: number;
}

/** The numbers ranking needs. */
export type RankKey = Pick<ScoreRecord, 'cleared' | 'wpm' | 'accuracy' | 'durationS' | 'createdAt'>;

export type SortOrder = 'longest' | 'shortest';

/** Leaderboard filters; `null` means "All". */
export interface BoardFilter {
  script: GameScript | null;
  difficulty: Difficulty | null;
  mode: Mode | null;
  /** Only used when mode is endless. */
  sort: SortOrder;
}
