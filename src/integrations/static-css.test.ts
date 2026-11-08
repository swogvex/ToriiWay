import { describe, expect, it } from 'vitest';

import { keepOnlySheet, linkedSheets } from './static-css';

const page =
  '<head><link rel="stylesheet" href="/_astro/style.big.css"><link rel="stylesheet" href="/_astro/style.server.css"><link rel="stylesheet" href="/_astro/dictionary.x.css"></head>';

describe('static page stylesheets', () => {
  it('finds only the bundled stylesheets', () => {
    expect(linkedSheets(page)).toEqual(['/_astro/style.big.css', '/_astro/style.server.css']);
  });

  it('keeps the chosen sheet and any page-only stylesheet', () => {
    expect(keepOnlySheet(page, '/_astro/style.big.css')).toBe(
      '<head><link rel="stylesheet" href="/_astro/style.big.css"><link rel="stylesheet" href="/_astro/dictionary.x.css"></head>',
    );
  });
});
