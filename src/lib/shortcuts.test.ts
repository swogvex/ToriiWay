import { describe, expect, it } from 'vitest';

import { shortcutFor } from './shortcuts';

const key = (value: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({
    key: value,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    typing: false,
    ...extra,
  });

describe('shortcutFor', () => {
  it('maps single keys', () => {
    expect(key('t')).toBe('theme');
    expect(key('T')).toBe('theme');
    expect(key('l')).toBe('language');
    expect(key('?')).toBe('help');
    expect(key('x')).toBeNull();
  });

  it('opens search with ⌘K or Ctrl K, even while typing', () => {
    expect(key('k', { metaKey: true })).toBe('search');
    expect(key('K', { ctrlKey: true, typing: true })).toBe('search');
    expect(key('k')).toBeNull();
  });

  it('ignores single keys while typing or with modifiers', () => {
    expect(key('t', { typing: true })).toBeNull();
    expect(key('t', { ctrlKey: true })).toBeNull();
    expect(key('l', { altKey: true })).toBeNull();
    expect(key('k', { ctrlKey: true, altKey: true })).toBeNull();
  });
});
