import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { THEME_PREPAINT_SCRIPT } from './prepaint';

describe('theme pre-paint script', () => {
  it('is allowed by its hash in the CSP', () => {
    const hash = createHash('sha256').update(THEME_PREPAINT_SCRIPT).digest('base64');
    const vercel = readFileSync('vercel.json', 'utf8');
    expect(vercel).toContain(`'sha256-${hash}'`);
  });
});
