// Pure helpers for the exam screen: question text markup, clocks and the voice script.

export interface StemPart {
  text: string;
  /** `underline`: the word the question is about. `star`: the ★ slot of sentence composition. */
  mark?: 'underline' | 'star';
}

/** Splits a stem on `__word__` (underlined) and ★. */
export function parseStem(stem: string): StemPart[] {
  const parts: StemPart[] = [];
  for (const [index, chunk] of stem.split('__').entries()) {
    if (index % 2 === 1) {
      parts.push({ text: chunk, mark: 'underline' });
      continue;
    }
    for (const [starIndex, piece] of chunk.split('★').entries()) {
      if (starIndex > 0) parts.push({ text: '★', mark: 'star' });
      if (piece) parts.push({ text: piece });
    }
  }
  return parts.filter((part) => part.text !== '' || part.mark === 'underline');
}

/** "14:12" for milliseconds left (rounded up, so 0:00 means the time is over). */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const MINUTE = 60_000;

/**
 * Whether the time left crossed a point worth announcing to screen readers: every
 * 5 minutes and the last minute (09-spec-jlpt: not every second).
 */
export function crossedAnnouncement(before: number, after: number): number | null {
  if (after <= 0 || after >= before) return null;
  if (before > MINUTE && after <= MINUTE) return 1;
  const mark = Math.floor(before / (5 * MINUTE)) * 5;
  if (mark > 0 && after <= mark * MINUTE && before > mark * MINUTE) return mark;
  return null;
}

export type Role = 'narrator' | 'man' | 'woman';

export interface ScriptLine {
  role: Role;
  text: string;
}

const ROLES: Record<string, Role> = { N: 'narrator', M: 'man', F: 'woman' };

/** `N: …` / `M: …` / `F: …` lines of a listening script. */
export function parseScript(script: string): ScriptLine[] {
  return script
    .split('\n')
    .map((line) => line.match(/^([NMF]):\s*(.*)$/))
    .flatMap((match) =>
      match?.[1] && match[2] ? [{ role: ROLES[match[1]] ?? 'narrator', text: match[2] }] : [],
    );
}
