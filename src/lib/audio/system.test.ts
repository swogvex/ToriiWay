import { describe, expect, it } from 'vitest';

import { detectSystem } from './system';

describe('detectSystem', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 15_1) AppleWebKit/605.1.15 Safari/605.1', 'mac'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15', 'ios'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0', 'linux'],
    ['curl/8.0', null],
  ])('%s → %s', (agent, system) => {
    expect(detectSystem(agent)).toBe(system);
  });
});
