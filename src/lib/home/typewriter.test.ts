import { describe, expect, it } from 'vitest';

import { DELETE_MS, GAP_MS, HOLD_MS, step, TYPE_MS, type TypeState } from './typewriter';

describe('step', () => {
  it('holds a full phrase, deletes it, then types the next one and wraps around', () => {
    const lengths = [2, 1];
    let state: TypeState = { phrase: 0, shown: 2, deleting: false };
    const seen: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      const { next, delay } = step(state, lengths);
      seen.push(`${next.phrase}:${next.shown}${next.deleting ? 'd' : ''}@${delay}`);
      state = next;
    }
    expect(seen).toEqual([
      `0:2d@${HOLD_MS}`,
      `0:1d@${DELETE_MS}`,
      `0:0d@${DELETE_MS}`,
      `1:0@${GAP_MS}`,
      `1:1@${TYPE_MS}`,
      `1:1d@${HOLD_MS}`,
      `1:0d@${DELETE_MS}`,
      `0:0@${GAP_MS}`,
      `0:1@${TYPE_MS}`,
    ]);
  });
});
