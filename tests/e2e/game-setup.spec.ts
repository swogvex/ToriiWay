import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { toRomaji } from 'wanakana';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const STORAGE_KEY = 'nnt:v1:game';

test.use({ viewport: { width: 1440, height: 1000 } });

const start = (page: Page) => page.getByRole('button', { name: /^Start · / });

test.describe('Kana Rush setup', () => {
  test('defaults to Hiragana Normal Challenge with no axe violations', async ({ page }) => {
    await page.goto('/game');
    await expect(page.getByRole('heading', { level: 1, name: 'Kana Rush' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Hiragana/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Normal' })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Challenge/ })).toBeChecked();
    await expect(page.getByText('Normal: words of 2–4 kana')).toBeVisible();
    await expect(page.getByText('Survive 2:30 to clear it')).toBeVisible();
    await expect(start(page)).toHaveText(/Start · Hiragana Normal/);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('follows the choice and blocks lists that are not ready', async ({ page }) => {
    await page.goto('/game');
    await page.getByRole('radio', { name: 'Hard' }).check();
    await expect(page.locator('.choice__note[data-note="hard"]')).toHaveText(
      'Survive 3:00 to clear it',
    );
    await expect(page.locator('.choice__note[data-note="hard"]')).toBeVisible();
    await expect(page.getByText('Normal: words of 2–4 kana')).toBeHidden();
    await page.getByRole('radio', { name: /Katakana/ }).check();
    await expect(start(page)).toBeDisabled();
    await expect(page.getByText('Coming soon', { exact: true }).first()).toBeVisible();
    await page.getByRole('radio', { name: 'Easy' }).check();
    await expect(start(page)).toBeEnabled();
    await expect(start(page)).toHaveText(/Start · Katakana Easy/);
  });

  test('starts the chosen run and remembers the setup', async ({ page }) => {
    await page.goto('/game');
    await page.getByRole('radio', { name: 'Extreme' }).check();
    await page.getByRole('radio', { name: /Endless/ }).check();
    await page.getByLabel('Show romaji hint on first miss').uncheck();
    await page.getByRole('radio', { name: 'Spanish (ñ)' }).check();
    await start(page).click();
    await expect(page).toHaveURL(/\/game\/play\?/);
    const params = new URL(page.url()).searchParams;
    expect(params.get('difficulty')).toBe('extreme');
    expect(params.get('mode')).toBe('endless');
    expect(params.getAll('hint').at(-1)).toBe('0');
    await expect(page.getByText('Hiragana · Extreme · Endless')).toBeVisible();
    await expect(page.locator('[data-key="ñ"]')).toBeVisible();

    await page.goto('/game');
    await expect(page.getByRole('radio', { name: 'Extreme' })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Endless/ })).toBeChecked();
    await expect(page.getByLabel('Show romaji hint on first miss')).not.toBeChecked();
  });

  test('shows bests and cleared challenges from this browser', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          bests: {
            'hiragana/normal/challenge': {
              wpm: 42,
              accuracy: 94,
              popped: 41,
              time: 150,
              level: 1,
              date: '2026-11-03',
            },
          },
          cleared: ['hiragana/easy', 'hiragana/normal'],
        }),
      );
    }, STORAGE_KEY);
    await page.goto('/game');
    await expect(page.locator('[data-best]')).toHaveText('42');
    await expect(page.locator('[data-cleared-count]')).toHaveText('2');
    await expect(page.locator('[data-challenge="hiragana/normal"]')).toHaveText(/Cleared/);
    await expect(page.locator('[data-challenge="hiragana/hard"]')).toHaveText(/Not yet/);
  });
});

/** Types every bubble on screen every two seconds, so a run survives as long as needed. */
async function autoplay(page: Page, seconds: number): Promise<void> {
  for (let second = 0; second < seconds; second += 2) {
    await page.clock.runFor(2000);
    const readings = await page
      .locator('.bubble:not([hidden]):not(.is-popping):not(.is-missed)')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset['reading'] ?? ''));
    for (const reading of readings) await page.keyboard.type(toRomaji(reading));
  }
}

test.describe('Kana Rush endless', () => {
  test('levels up every two minutes and shows the level', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await page.goto('/game/play?script=hiragana&difficulty=easy&mode=endless&seed=3');
    await expect(page.locator('[data-game]')).toHaveAttribute('data-status', 'countdown');
    await page.clock.runFor(3400);
    await expect(page.locator('[data-game]')).toHaveAttribute('data-status', 'playing');
    await expect(page.locator('[data-time]')).toHaveText(/^Level 1 · 00:\d\d$/);
    await autoplay(page, 121);
    await expect(page.locator('[data-time]')).toHaveText(/^Level 2 · 02:\d\d$/);
    await expect(page.locator('[data-level-toast]')).toHaveText('Level 2');
    await expect(page.locator('[data-game]')).toHaveAttribute('data-status', 'playing');
  });

  test('a finished run is saved as a new best', async ({ page }) => {
    await page.clock.install();
    await page.goto('/game/play?script=hiragana&difficulty=normal&mode=challenge&seed=1');
    await expect(page.locator('[data-game]')).toHaveAttribute('data-status', 'countdown');
    await page.clock.runFor(3400);
    await expect(page.locator('[data-game]')).toHaveAttribute('data-status', 'playing');
    await page.clock.runFor(30_000);
    await page.clock.runFor(30_000);
    await expect(page.locator('[data-game]')).toHaveAttribute('data-status', 'failed');
    await expect(page.locator('[data-results] [data-new-best]')).toBeVisible();
    await page.getByRole('link', { name: 'Change settings' }).first().click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.locator('[data-best]')).toHaveText('0');
  });
});
