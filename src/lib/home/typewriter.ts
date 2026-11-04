// Home hero typewriter (components/home/Hero.astro): types the rest of each phrase after
// the fixed first word, holds it, deletes it and moves on. The whole phrase is laid out
// from the start (the untyped part is invisible), so words never jump lines mid-typing.

export const TYPE_MS = 45;
export const DELETE_MS = 22;
export const HOLD_MS = 1700;
export const GAP_MS = 300;

export interface TypeState {
  phrase: number;
  /** Characters of the phrase that are visible. */
  shown: number;
  deleting: boolean;
}

/** The next state and how long to wait before showing it. */
export function step(
  state: TypeState,
  lengths: readonly number[],
): { next: TypeState; delay: number } {
  const length = lengths[state.phrase] ?? 0;
  if (!state.deleting) {
    if (state.shown < length) return { next: { ...state, shown: state.shown + 1 }, delay: TYPE_MS };
    return { next: { ...state, deleting: true }, delay: HOLD_MS };
  }
  if (state.shown > 0) return { next: { ...state, shown: state.shown - 1 }, delay: DELETE_MS };
  return {
    next: { phrase: (state.phrase + 1) % lengths.length, shown: 0, deleting: false },
    delay: GAP_MS,
  };
}

/** Starts the loop on `[data-typewriter]`; does nothing with reduced motion. */
export function initTypewriter(root: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const typed = root.querySelector<HTMLElement>('[data-typed]');
  const rest = root.querySelector<HTMLElement>('[data-rest]');
  const phrases = (JSON.parse(root.dataset.phrases ?? '[]') as string[]).map((p) => Array.from(p));
  if (!typed || !rest || phrases.length === 0) return;
  let state: TypeState = { phrase: 0, shown: phrases[0]?.length ?? 0, deleting: false };
  const lengths = phrases.map((p) => p.length);
  const tick = () => {
    const { next, delay } = step(state, lengths);
    window.setTimeout(() => {
      state = next;
      const chars = phrases[state.phrase] ?? [];
      typed.textContent = chars.slice(0, state.shown).join('');
      rest.textContent = chars.slice(state.shown).join('');
      tick();
    }, delay);
  };
  tick();
}
