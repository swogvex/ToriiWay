import { describe, expect, it } from 'vitest';

import { crossedAnnouncement, formatClock, parseScript, parseStem } from './format';

const MINUTE = 60_000;

describe('parseStem', () => {
  it('marks underlined words', () => {
    expect(parseStem('きのう　__ともだち__と　えいがを　みました。')).toEqual([
      { text: 'きのう　' },
      { text: 'ともだち', mark: 'underline' },
      { text: 'と　えいがを　みました。' },
    ]);
  });

  it('marks the star of sentence composition', () => {
    expect(parseStem('つくえの　＿＿＿　★　＿＿＿　です。')).toEqual([
      { text: 'つくえの　＿＿＿　' },
      { text: '★', mark: 'star' },
      { text: '　＿＿＿　です。' },
    ]);
  });

  it('keeps plain text as one part', () => {
    expect(parseStem('（１）')).toEqual([{ text: '（１）' }]);
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds, rounding up', () => {
    expect(formatClock(20 * MINUTE)).toBe('20:00');
    expect(formatClock(852_001)).toBe('14:13');
    expect(formatClock(500)).toBe('0:01');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(70 * MINUTE)).toBe('70:00');
  });
});

describe('crossedAnnouncement', () => {
  it('announces every five minutes and the last minute only', () => {
    expect(crossedAnnouncement(15 * MINUTE + 100, 15 * MINUTE - 100)).toBe(15);
    expect(crossedAnnouncement(14 * MINUTE, 13 * MINUTE)).toBeNull();
    expect(crossedAnnouncement(MINUTE + 100, MINUTE - 100)).toBe(1);
    expect(crossedAnnouncement(30_000, 29_000)).toBeNull();
    expect(crossedAnnouncement(1000, 0)).toBeNull();
  });
});

describe('parseScript', () => {
  it('reads one role per line', () => {
    expect(parseScript('N: しつもんです。\nM: こんにちは。\nF: はい。\nnoise')).toEqual([
      { role: 'narrator', text: 'しつもんです。' },
      { role: 'man', text: 'こんにちは。' },
      { role: 'woman', text: 'はい。' },
    ]);
  });
});
