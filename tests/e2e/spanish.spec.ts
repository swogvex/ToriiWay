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

  test('the Spanish home shows the Spanish copy', async ({ page }) => {
    await page.goto('/es');
    await expect(page).toHaveTitle('ToriiWay · Aprende japonés tecla a tecla');
    await expect(page.locator('[data-untranslated]')).toHaveCount(0);
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

  test('Spanish pages are published with hreflang in both directions', async ({ page }) => {
    await page.goto('/es/learn/hiragana');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/es\/learn\/hiragana$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      /[^s]\/learn\/hiragana$/,
    );
    await expect(page.locator('[data-pagefind-body]')).toHaveCount(1);

    await page.goto('/learn/hiragana');
    await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
      'href',
      /\/es\/learn\/hiragana$/,
    );
    await expect(page.locator('[data-lang-link="es"]').first()).toHaveAttribute(
      'href',
      '/es/learn/hiragana',
    );
  });

  test('the sitemap lists Spanish pages with their English alternates', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    expect(sitemap).toMatch(/<loc>[^<]*\/es\/learn\/hiragana<\/loc>/);
    expect(sitemap).toMatch(/hreflang="es"[^>]*\/es\/learn\/hiragana"/);
    expect(sitemap).not.toMatch(/<loc>[^<]*\/es\/learn<\/loc>/);
  });

  test('the Spanish kana chart loads Spanish panel data', async ({ page }) => {
    const data = page.waitForResponse((response) =>
      response.url().endsWith('/data/kana/es/hiragana.json'),
    );
    await page.goto('/es/learn/hiragana');
    expect((await data).ok()).toBe(true);
  });

  test('guides are in Spanish', async ({ page }) => {
    await page.goto('/es/learn/guide/what-is-hiragana');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('¿Qué es el hiragana?');
    await expect(page.locator('[data-untranslated]')).toHaveCount(0);
    await expect(page.locator('article.guide')).not.toHaveAttribute('lang', 'en');
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
    '/es/learn',
    '/es/learn/hiragana',
    '/es/learn/katakana',
    '/es/learn/kana/%E3%81%8B',
    '/es/learn/guide/what-is-katakana',
    '/es/learn/search',
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

  test('books show their Spanish text and title', async ({ page }) => {
    await page.goto('/es/library/irodori');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Irodori: japonés para la vida en Japón',
    );
    await expect(page.locator('.book__text')).toContainText('situaciones cotidianas');
    await expect(page.locator('[data-untranslated]')).toHaveCount(0);

    await page.goto('/library/irodori');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Irodori: Japanese for Life in Japan',
    );
  });

  test('the Spanish library search matches Spanish text', async ({ page }) => {
    await page.goto('/es/library?q=cotidianas');
    await expect(page.locator('a[href="/es/library/irodori"]').first()).toBeVisible();
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
