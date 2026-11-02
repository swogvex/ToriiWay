import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The showcase renders every component twice (light and dark subtrees), so each
// axe run covers both themes.
test.beforeEach(async ({ page }) => {
  await page.goto('/dev/ui');
});

test('showcase has no axe violations and is noindex', async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('tabs follow the WAI-ARIA keyboard pattern', async ({ page }) => {
  const tablist = page.locator('[data-theme="light"] [role="tablist"]');
  const first = tablist.getByRole('tab', { name: 'Hiragana' });
  const second = tablist.getByRole('tab', { name: 'Katakana' });

  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#light-tabs-panel-katakana')).toBeVisible();
  await expect(page.locator('#light-tabs-panel-hiragana')).toBeHidden();

  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
});

test('dialog opens modal, closes with Escape and returns focus', async ({ page }) => {
  const opener = page.locator('[data-theme="light"]').getByRole('button', { name: 'Open dialog' });
  const dialog = page.locator('#light-dialog');

  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Finish the test?' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('toggle chip flips aria-pressed', async ({ page }) => {
  const chip = page.locator('[data-theme="light"]').getByRole('button', { name: 'Katakana' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
});

test('toast announces in the polite live region', async ({ page }) => {
  await page.locator('[data-theme="light"]').getByRole('button', { name: 'Show toast' }).click();
  await expect(page.locator('[data-toast-region]')).toHaveText('Progress saved');
});

test('stored theme is applied before paint', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('nnt:v1:theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
