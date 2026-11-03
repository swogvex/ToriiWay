import { describe, expect, it } from 'vitest';

import { accuracy, consistency, kpm, wpm } from './metrics';

describe('metrics', () => {
  it('counts five keystrokes as one word', () => {
    expect(wpm(250, 60)).toBe(50);
    expect(wpm(50, 30)).toBe(20);
    expect(wpm(10, 0)).toBe(0);
  });

  it('computes accuracy over all keystrokes', () => {
    expect(accuracy(94, 6)).toBe(94);
    expect(accuracy(0, 0)).toBe(100);
    expect(accuracy(0, 3)).toBe(0);
  });

  it('computes kana per minute', () => {
    expect(kpm(30, 30)).toBe(60);
    expect(kpm(5, 0)).toBe(0);
  });

  it('scores a steady pace as fully consistent', () => {
    expect(consistency([40, 40, 40])).toBe(100);
    expect(consistency([])).toBe(0);
    expect(consistency([0, 0])).toBe(0);
  });

  it('lowers consistency as the pace varies, never below 0', () => {
    expect(consistency([30, 50])).toBeCloseTo(75);
    expect(consistency([0, 0, 0, 100])).toBe(0);
  });
});
