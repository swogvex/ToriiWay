import { describe, expect, it } from 'vitest';

import { fill, formatTime } from './results';

describe('results helpers', () => {
  it('formats run time as m:ss', () => {
    expect(formatTime(150)).toBe('2:30');
    expect(formatTime(59.6)).toBe('1:00');
    expect(formatTime(0)).toBe('0:00');
  });

  it('fills named placeholders and keeps unknown ones', () => {
    expect(fill('{count} popped · {x}', { count: 41 })).toBe('41 popped · {x}');
  });
});
