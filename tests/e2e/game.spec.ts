import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { toRomaji } from 'wanakana';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PLAY = '/game/play?script=hiragana&difficulty=normal&mode=challenge&seed=1';

test.use({ viewport: { width: 1440, height: 1000 } });

/** Opens a seeded run on a fake clock and presses Start. */
async function startRun(page: Page): Promise<void> {
  await page.clock.install();
  await page.goto(PLAY);
  await page.getByRole('button', { name: 'Start' }).click();
  await page.clock.runFor(100);
}

const game = (page: Page) => page.locator('[data-game]');
const bubbles = (page: Page) => page.locator('.bubble:not([hidden])');

test.describe('Kana Rush play', () => {
  test('the start screen has no axe violations', async ({ page }) => {
    await page.goto(PLAY);
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('typing a bubble fills it, then pops it', async ({ page }) => {
    await startRun(page);
    await expect(bubbles(page)).toHaveCount(1);
    const reading = (await bubbles(page).first().getAttribute('data-reading')) ?? '';
    const romaji = toRomaji(reading);

    await page.keyboard.type(romaji.slice(0, 2));
    await page.clock.runFor(50);
    await expect(bubbles(page).first()).toHaveClass(/is-target/);
    await expect(bubbles(page).first().locator('.is-filled')).not.toHaveCount(0);
    await expect(page.locator('[data-typed]')).toHaveText(romaji.slice(0, 2));

    await page.keyboard.type(romaji.slice(2));
    await page.clock.runFor(300);
    await expect(game(page)).toHaveAttribute('data-popped', '1');
    await expect(page.locator('[data-popped]').last()).toHaveText('1');
  });

  test('a wrong key is shown and ignored', async ({ page }) => {
    await startRun(page);
    await page.keyboard.type('q');
    await expect(page.locator('[data-wrong]')).toHaveText('q');
    await expect(page.locator('[data-typed]')).toHaveText('');
  });

  test('a bubble that crosses costs a life; no lives ends the run', async ({ page }) => {
    await startRun(page);
    await page.clock.runFor(12_000);
    const counts = await game(page).evaluate((el) => ({
      lives: Number(el.dataset['lives']),
      missed: Number(el.dataset['missed']),
    }));
    expect(counts.missed).toBeGreaterThan(0);
    expect(counts.lives).toBe(5 - counts.missed);

    await page.clock.runFor(30_000);
    await expect(game(page)).toHaveAttribute('data-status', 'failed');
    await expect(page.getByText('Out of lives')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();

    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    await expect(game(page)).toHaveAttribute('data-status', 'playing');
    await expect(game(page)).toHaveAttribute('data-lives', '5');
  });

  test('a list that does not exist yet says so', async ({ page }) => {
    await page.goto('/game/play?script=kanji&difficulty=extreme');
    await expect(page.getByText('This list is not ready yet.')).toBeVisible();
  });

  test('runs under the site CSP enforced', async ({ context, page }) => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: { headers: { key: string; value: string }[] }[];
    };
    const csp = vercel.headers
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === 'Content-Security-Policy-Report-Only')?.value;
    await context.route('**/*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': csp ?? '' },
      });
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { violations: string[] }).violations ??= [];
        (window as unknown as { violations: string[] }).violations.push(event.violatedDirective);
      });
    });
    await startRun(page);
    await page.clock.runFor(3_000);
    await expect(bubbles(page)).toHaveCount(2);
    const transform = await bubbles(page)
      .first()
      .evaluate((el) => el.style.transform);
    expect(transform).toMatch(/^translate3d\(/);
    expect(await page.evaluate(() => (window as { violations?: string[] }).violations)).toBe(
      undefined,
    );
  });
});
