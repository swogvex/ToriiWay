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

  const PAGES = [
    '/es/game',
    '/es/game/play',
    '/es/game/leaderboard',
    '/es/jlpt',
    '/es/jlpt/run',
    '/es/community',
    '/es/library',
    '/es/library/kanji-para-recordar-1',
    '/es/credits',
  ];

  for (const url of PAGES) {
    test(`${url} is served in Spanish`, async ({ page }) => {
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    });
  }

  test('flows and lists stay in Spanish', async ({ page }) => {
    await page.goto('/es/jlpt');
    await expect(page.locator('[data-run-url]').first()).toHaveAttribute(
      'data-run-url',
      '/es/jlpt/run',
    );
    await page.goto('/es/library');
    await expect(page.locator('a[href="/es/library/kanji-para-recordar-1"]').first()).toBeVisible();
  });

  test('a book that is not translated says so', async ({ page }) => {
    await page.goto('/es/library/kanji-para-recordar-1');
    await expect(page.locator('[data-untranslated]')).toContainText('Aún no traducido');
  });

  test('an unknown Spanish path is a Spanish 404', async ({ page }) => {
    const response = await page.goto('/es/no-existe');
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.omikuji').first()).toBeVisible();
  });

  test('a missing report is a Spanish 404 and is never indexed', async ({ page }) => {
    const response = await page.goto('/es/jlpt/r/no-existe');
    expect(response?.status()).toBe(404);
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  // Runs in light and dark through the Playwright projects.
  for (const url of ['/es', '/es/help/japanese-voice', ...PAGES, '/es/no-existe']) {
    test(`${url} has no axe violations`, async ({ page }) => {
      await page.goto(url);
      await expectNoAxeViolations(page);
    });
  }
});
