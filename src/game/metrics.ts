// Game metrics as defined in the concepts doc (Monkeytype-compatible "words" of 5 keystrokes).

/** Words per minute: keystrokes ÷ 5 ÷ minutes. Zero before any time has passed. */
export function wpm(keystrokes: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return keystrokes / 5 / (seconds / 60);
}

/** Correct keystrokes as a percentage of all keystrokes; 100 before the first key. */
export function accuracy(correct: number, wrong: number): number {
  const total = correct + wrong;
  return total === 0 ? 100 : (correct / total) * 100;
}

/** Kana produced per minute. */
export function kpm(kana: number, seconds: number): number {
  return seconds <= 0 ? 0 : kana / (seconds / 60);
}

/**
 * 100 − coefficient of variation of per-second WPM, clamped to 0–100
 * (the Monkeytype formula). An empty or all-zero series counts as 0.
 */
export function consistency(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  if (mean === 0) return 0;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return Math.min(100, Math.max(0, 100 - (Math.sqrt(variance) / mean) * 100));
}
