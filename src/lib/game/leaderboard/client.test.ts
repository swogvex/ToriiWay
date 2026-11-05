import { describe, expect, it } from 'vitest';

import { clock, DEFAULT_FILTER, filterFromSearch, searchFromFilter } from './client';

describe('leaderboard filters in the URL', () => {
  it('leaves defaults out and round-trips every filter', () => {
    expect(searchFromFilter(DEFAULT_FILTER)).toBe('');
    const search = '?script=katakana&difficulty=hard&mode=endless&sort=shortest';
    expect(searchFromFilter(filterFromSearch(search))).toBe(search);
  });

  it('ignores sort outside Endless and unknown values', () => {
    expect(filterFromSearch('?mode=challenge&sort=shortest')).toEqual({
      ...DEFAULT_FILTER,
      mode: 'challenge',
    });
    expect(filterFromSearch('?script=latin&difficulty=insane&mode=x')).toEqual(DEFAULT_FILTER);
  });
});

describe('clock', () => {
  it('formats survival time as mm:ss', () => {
    expect(clock(0)).toBe('00:00');
    expect(clock(754)).toBe('12:34');
    expect(clock(1213.4)).toBe('20:13');
  });
});
