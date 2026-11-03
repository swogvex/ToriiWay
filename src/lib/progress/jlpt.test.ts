import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRun, JLPT_KEY, loadRun, saveRun, type StoredRun } from './jlpt';

const items = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => items.get(key) ?? null,
  setItem: (key: string, value: string) => items.set(key, value),
  removeItem: (key: string) => items.delete(key),
  clear: () => items.clear(),
});

const run: StoredRun = {
  id: '6f1c2f9e-3b5a-4d8e-9c1a-2b3c4d5e6f70',
  level: 'N5',
  email: null,
  offset: 120,
  answers: { 'n5-voc-1-0001': { choice: 2, at: 1000 } },
  flags: ['n5-voc-1-0003'],
  section: 0,
};

describe('JLPT run storage', () => {
  beforeEach(() => localStorage.clear());

  it('saves, loads and clears the run in progress', () => {
    expect(loadRun()).toBeNull();
    saveRun(run);
    expect(loadRun()).toEqual(run);
    clearRun();
    expect(loadRun()).toBeNull();
  });

  it('ignores stored data with the wrong shape', () => {
    localStorage.setItem(JLPT_KEY, '{not json');
    expect(loadRun()).toBeNull();
    localStorage.setItem(JLPT_KEY, JSON.stringify({ ...run, level: 'N9' }));
    expect(loadRun()).toBeNull();
  });
});
