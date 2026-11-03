import { matchRomaji, type RomajiMatch } from './romaji';

export interface TargetCandidate {
  id: number;
  reading: string;
  /** Share of the path already travelled, 0–1. */
  progress: number;
}

export interface Target {
  id: number;
  match: Exclude<RomajiMatch, { status: 'miss' }>;
}

/**
 * Picks the bubble the typed romaji belongs to: one whose reading accepts it;
 * on a tie, the one closest to its exit edge. Null means a wrong key.
 */
export function pickTarget(candidates: readonly TargetCandidate[], typed: string): Target | null {
  let best: { candidate: TargetCandidate; match: Target['match'] } | null = null;
  for (const candidate of candidates) {
    const match = matchRomaji(candidate.reading, typed);
    if (match.status === 'miss') continue;
    if (!best || candidate.progress > best.candidate.progress) best = { candidate, match };
  }
  return best ? { id: best.candidate.id, match: best.match } : null;
}
