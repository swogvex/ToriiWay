import { expect, type Page, test } from '@playwright/test';

import { expectNoAxeViolations } from './axe';

// The omikuji 404 (07-spec-shell, images 17a–17c).
const RANKS = ['大凶', '凶', '末吉', '小吉', '吉', '中吉'];
const PATH_OF: Record<string, string> = {
  大凶: 'Home',
  凶: 'Learn hiragana',
  末吉: 'Kana Rush',
  小吉: 'Library',
  吉: 'JLPT simulation',
  中吉: 'Community',
};

const status = (page: Page) => page.locator('[data-omikuji-status]');
const paper = (page: Page) => page.getByRole('article', { name: 'Your fortune' });
const rankOf = async (page: Page) =>
  (await paper(page).locator('[data-fortune="rank"]').textContent()) ?? '';

test.describe('404 omikuji', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('answers 404, is not indexed and keeps the site shell', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page wandered off.');
    await expect(page.getByRole('img', { name: '404, read yon maru yon' })).toBeVisible();
    await expect(page.locator('header').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeVisible();
  });

  test('shake, draw, mark the lucky path and tie the fortune', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(paper(page)).toBeHidden();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Shake the omikuji' }).click();
    await expect(status(page)).toHaveText('Shaking the box…');
    await expect(paper(page)).toBeVisible();

    const rank = await rankOf(page);
    expect(RANKS).toContain(rank);
    await expect(status(page)).toContainText(`You drew ${rank} (`);
    const lucky = page.getByRole('link', { name: `${PATH_OF[rank]} (your lucky path)` });
    await expect(lucky).toBeVisible();
    await expect(page.locator('[data-omikuji-path][data-lucky]')).toHaveCount(1);
    await expectNoAxeViolations(page);

    const tie = rank.includes('凶') ? 'Tie it to the rope' : 'Tie it anyway';
    await page.getByRole('button', { name: tie }).click();
    await expect(status(page)).toHaveText('Fortune tied to the rope.');
    await expect(paper(page)).toBeHidden();
    await expect(page.getByRole('heading', { name: /Tied to the rope/ })).toBeVisible();
    await expect(page.locator('[data-fortune="tied"]')).toHaveText([...rank].at(-1) ?? '');
    await expect(lucky).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draw another fortune' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a new fortune never repeats the last one', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/this-page-does-not-exist');
    await page.getByRole('button', { name: 'Shake the omikuji' }).click();
    let previous = await rankOf(page);
    for (let draw = 0; draw < 8; draw++) {
      await page.getByRole('button', { name: 'Draw again' }).click();
      const next = await rankOf(page);
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  test('reduced motion opens the paper at once and focus follows the main action', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/this-page-does-not-exist');
    const shake = page.getByRole('button', { name: 'Shake the omikuji' });
    await shake.focus();
    await page.keyboard.press('Enter');
    await expect(paper(page)).toBeVisible();
    await expect(status(page)).toContainText('You drew');
    // The shake button went away, so focus moved to the tie button instead of the body.
    await expect(page.getByRole('button', { name: /^Tie it/ })).toBeFocused();
  });

  test('without JavaScript the paths still work and the shake button stays hidden', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('button', { name: 'Shake the omikuji' })).toBeHidden();
    const paths = page.getByRole('region', { name: 'Pick a path' });
    await expect(paths.getByRole('link')).toHaveCount(6);
    await expect(paths.getByRole('link', { name: 'Learn hiragana' })).toHaveAttribute(
      'href',
      '/learn/hiragana',
    );
    await context.close();
  });
});

test.describe('404 omikuji on phones', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('fits the width and stays accessible with the paper open', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/this-page-does-not-exist');
    await page.getByRole('button', { name: 'Shake the omikuji' }).click();
    await expect(paper(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expectNoAxeViolations(page);
  });
});
