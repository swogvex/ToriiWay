import { expect, test, type Page } from '@playwright/test';

import { MAX_DESCRIPTION, MAX_TITLE } from '../../src/lib/seo';
import { expectNoAxeViolations } from './axe';
import { SITE_ROUTES } from './routes';

// 15-quality: axe on every route in both themes (one Playwright project per theme), plus
// the structure every page shares and no sideways scroll on a small phone.

async function answerCommunity(page: Page): Promise<void> {
  await page.route('**/api/community', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"discord":null,"videos":[]}' }),
  );
}

test.describe('site audit', () => {
  for (const route of SITE_ROUTES) {
    test(`${route} passes axe and the page basics`, async ({ page }) => {
      await answerCommunity(page);
      await page.goto(route);
      const locale = route === '/es' || route.startsWith('/es/') ? 'es' : 'en';
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      // Game and exam pages swap whole screens, each with its own h1; one is shown at a time.
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main');

      expect((await page.title()).length, 'title ≤ 60').toBeLessThanOrEqual(MAX_TITLE);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description?.length ?? 0, 'description').toBeGreaterThan(0);
      expect(description?.length ?? 0, 'description ≤ 160').toBeLessThanOrEqual(MAX_DESCRIPTION);

      await expectNoAxeViolations(page);
    });
  }
});

test.describe('site audit on a small phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  test.skip(({ colorScheme }) => colorScheme === 'dark', 'layout does not depend on the theme');

  for (const route of SITE_ROUTES) {
    test(`${route} has no sideways scroll at 360 px`, async ({ page }) => {
      await answerCommunity(page);
      await page.goto(route);
      await page.waitForLoadState('load');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
