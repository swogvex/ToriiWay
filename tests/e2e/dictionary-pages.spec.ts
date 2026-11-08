import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './axe';

const KANJI = '/learn/kanji/一';
const WORD = '/learn/word/1160790';

test.describe('kanji page', () => {
  test('shows the entry and tells the CDN to keep it', async ({ page }) => {
    const response = await page.goto(KANJI);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toContain('s-maxage');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('一');
    await expect(page).toHaveTitle(/一 — kanji meaning “one/);
    await expect(page.getByRole('main')).toContainText('JLPT N5');
    await expect(page.getByRole('main')).toContainText('ES: uno');
    await expect(page.getByRole('link', { name: '一つ' })).toHaveAttribute(
      'href',
      '/learn/word/1160790',
    );
  });

  test('links each sentence to Tatoeba and credits the data', async ({ page }) => {
    await page.goto(KANJI);
    await expect(page.locator('.dict-sentences ruby').first()).toContainText('一');
    await expect(page.getByRole('link', { name: /Tatoeba #1/ })).toHaveAttribute(
      'href',
      'https://tatoeba.org/sentences/show/1',
    );
    await expect(page.getByRole('main').getByRole('link', { name: /KanjiVG/ })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /JMdict/ })).toBeVisible();
  });

  test('has stroke controls that replay and stay in range', async ({ page }) => {
    await page.goto(KANJI);
    await expect(page.getByRole('img', { name: /Stroke order of 一/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay strokes' })).toBeVisible();
    // One stroke: nothing to step through.
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  for (const path of ['/learn/kanji/二', '/learn/kanji/abc', '/learn/kanji/%E4%B8%80%E4%BA%8C']) {
    test(`answers 404 and is not cached: ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      expect(response?.headers()['cache-control']).toBe('no-store');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not in the dictionary');
    });
  }
});

test.describe('word page', () => {
  test('shows the reading, the meanings in both languages and the kanji', async ({ page }) => {
    const response = await page.goto(WORD);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('一');
    const main = page.getByRole('main');
    await expect(main).toContainText('いち');
    await expect(main).toContainText('Numeric');
    await expect(main).toContainText('one');
    await expect(main.getByRole('heading', { name: 'In Spanish' })).toBeVisible();
    await expect(main).toContainText('uno');
    await expect(main.getByRole('link', { name: '一', exact: true })).toHaveAttribute(
      'href',
      '/learn/kanji/%E4%B8%80',
    );
  });

  for (const path of ['/learn/word/2', '/learn/word/abc', '/learn/word/0']) {
    test(`answers 404: ${path}`, async ({ page }) => {
      expect((await page.goto(path))?.status()).toBe(404);
    });
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`detail pages have no axe violations in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const path of [KANJI, WORD, '/learn/kanji/二']) {
      await page.goto(path);
      await expectNoAxeViolations(page);
    }
  });
}

for (const width of [360, 768, 1920]) {
  test(`detail pages do not scroll sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of [KANJI, WORD]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    }
  });
}
