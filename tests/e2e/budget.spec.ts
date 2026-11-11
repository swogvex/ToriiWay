import { gzipSync } from 'node:zlib';

import { expect, test } from '@playwright/test';

import { SITE_ROUTES } from './routes';

// 15-quality "Targets": gzip JS and CSS that each page loads, measured in the browser.
const KB = 1024;
const JS_BUDGET = 30 * KB;
/** The game engine has its own allowance (35 KB + shared). */
const GAME_JS_BUDGET = 35 * KB;
const CSS_BUDGET = 20 * KB;
/**
 * Known exception, owner to decide: on-demand pages link the static bundle and a second
 * bundle Astro builds for them, which repeats the shell (~8 KB). Neither one alone styles
 * every on-demand page. Kept at today's size so it cannot grow unnoticed.
 */
const ON_DEMAND_CSS_CEILING = 28 * KB;
// The English 404 is static; the Spanish one renders on demand.
const ON_DEMAND = /^((\/es)?\/(learn\/(kanji|word|search)|credits)|\/es\/this-page-does-not-exist)/;

test.describe('page weight', () => {
  test.skip(({ colorScheme }) => colorScheme === 'dark', 'weight does not depend on the theme');

  for (const route of SITE_ROUTES) {
    test(`${route} stays within the JS and CSS budgets`, async ({ page }) => {
      const sizes = { script: 0, stylesheet: 0 };
      const pending: Promise<void>[] = [];
      page.on('response', (response) => {
        const type = response.request().resourceType();
        if ((type !== 'script' && type !== 'stylesheet') || !response.url().includes('/_astro/')) {
          return;
        }
        pending.push(
          response
            .body()
            .then((body) => {
              sizes[type] += gzipSync(body).length;
            })
            .catch(() => {}),
        );
      });
      await page.route('**/api/community', (r) =>
        r.fulfill({ contentType: 'application/json', body: '{"discord":null,"videos":[]}' }),
      );
      await page.goto(route);
      await page.waitForLoadState('load');
      await Promise.all(pending);

      const isGame = /\/game\/play$/.test(route);
      const isOnDemand = ON_DEMAND.test(route);
      expect(sizes.script, 'JS gzip').toBeLessThan(isGame ? GAME_JS_BUDGET : JS_BUDGET);
      expect(sizes.stylesheet, 'CSS gzip').toBeLessThan(
        isOnDemand ? ON_DEMAND_CSS_CEILING : CSS_BUDGET,
      );
    });
  }
});
