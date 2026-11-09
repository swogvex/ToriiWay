import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './axe';

test.describe('Spanish routes', () => {
  test('the Spanish home is in Spanish and links stay under /es', async ({ page }) => {
    await page.goto('/es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.skip-link')).toHaveText('Saltar al contenido');
    await expect(page.locator('a.hero__play, .hero__play').first()).toHaveAttribute(
      'href',
      '/es/game',
    );
  });

  test('content that falls back to English says so', async ({ page }) => {
    await page.goto('/es');
    await expect(page.locator('[data-untranslated]')).toContainText('Aún no traducido');
  });

  test('the English home has no notice and keeps its canonical', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-untranslated]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });

  test('the switch on a Spanish page goes to the same page in English', async ({ page }) => {
    await page.goto('/es/help/japanese-voice');
    await expect(page.locator('[data-lang-link="en"]').first()).toHaveAttribute(
      'href',
      '/help/japanese-voice',
    );
  });

  test('unpublished Spanish pages stay out of search engines', async ({ page, request }) => {
    await page.goto('/es');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    await expect(page.locator('[data-pagefind-body]')).toHaveCount(0);

    await page.goto('/');
    await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveCount(0);

    const sitemap = await request.get('/sitemap-0.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).not.toMatch(/<loc>[^<]*\/es(\/|<)/);
  });

  // Runs in light and dark through the Playwright projects.
  for (const url of ['/es', '/es/help/japanese-voice']) {
    test(`${url} has no axe violations`, async ({ page }) => {
      await page.goto(url);
      await expectNoAxeViolations(page);
    });
  }
});
