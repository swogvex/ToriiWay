import { describe, expect, it } from 'vitest';

import {
  adoptSubmitterToken,
  boardSearch,
  clock,
  DEFAULT_FILTER,
  ensureSubmitterToken,
  filterFromSearch,
  formatCode,
  myEntries,
  pageFromSearch,
  pageList,
  parseCode,
  rememberEntry,
  searchFromFilter,
  submitterToken,
} from './client';

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

describe('leaderboard pages', () => {
  it('reads the page from the URL and leaves page 1 out', () => {
    expect(pageFromSearch('?mode=endless&page=3')).toBe(3);
    expect(pageFromSearch('?page=0')).toBe(1);
    expect(pageFromSearch('?page=x')).toBe(1);
    expect(boardSearch({ ...DEFAULT_FILTER, mode: 'challenge' }, 1)).toBe('?mode=challenge');
    expect(boardSearch({ ...DEFAULT_FILTER, mode: 'challenge' }, 4)).toBe('?mode=challenge&page=4');
  });

  it('lists every page when there are few, and gaps around the current one otherwise', () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(1, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
    expect(pageList(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageList(20, 20)).toEqual([1, 'gap', 17, 18, 19, 20]);
  });
});

describe('code to use your names on another device', () => {
  const token = '0123456789abcdef'.repeat(4);

  it('shows the token in 8 groups and reads it back however it was pasted', () => {
    const code = formatCode(token);
    expect(code).toBe('01234567 89abcdef 01234567 89abcdef 01234567 89abcdef 01234567 89abcdef');
    expect(parseCode(code)).toBe(token);
    expect(
      parseCode(`  ${code.toUpperCase().replaceAll(' ', '-')}
`),
    ).toBe(token);
  });

  it('rejects codes that are short, long or not hex', () => {
    expect(parseCode('')).toBeNull();
    expect(parseCode(token.slice(1))).toBeNull();
    expect(parseCode(`${token}0`)).toBeNull();
    expect(parseCode(`${token.slice(1)}g`)).toBeNull();
  });

  it('replaces this browser token and forgets the entries of the old one', () => {
    const own = ensureSubmitterToken();
    rememberEntry('entry-1');
    adoptSubmitterToken(own);
    expect(myEntries().has('entry-1')).toBe(true);

    adoptSubmitterToken(token);
    expect(submitterToken()).toBe(token);
    expect(ensureSubmitterToken()).toBe(token);
    expect(myEntries().size).toBe(0);
  });

  it('ignores a token that is not valid', () => {
    adoptSubmitterToken(token);
    adoptSubmitterToken('nope');
    expect(submitterToken()).toBe(token);
  });
});
