import { describe, expect, it } from 'vitest';

import { nicknameFor } from './nickname';

describe('nicknameFor', () => {
  it('is stable for a run and varies between runs', () => {
    const id = '6f1c2f9e-3b5a-4d8e-9c1a-2b3c4d5e6f70';
    expect(nicknameFor(id)).toBe(nicknameFor(id));
    expect(nicknameFor(id)).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
    const names = new Set(Array.from({ length: 200 }, () => nicknameFor(crypto.randomUUID())));
    expect(names.size).toBeGreaterThan(100);
  });
});
