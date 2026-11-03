import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { toRomaji } from 'wanakana';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PLAY = '/game/play?script=hiragana&difficulty=normal&mode=challenge&seed=1';
/** 3 · 2 · 1 · 始め! */
const COUNTDOWN_MS = 3300;

const game = (page: Page) => page.locator('[data-game]');
const bubbles = (page: Page) => page.locator('.bubble:not([hidden])');

/** Opens a seeded run on a fake clock and waits out the countdown. */
async function startRun(page: Page, url = PLAY): Promise<void> {
  await page.clock.install();
  await page.goto(url);
  await expect(game(page)).toHaveAttribute('data-status', 'countdown');
  await page.clock.runFor(COUNTDOWN_MS + 100);
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
}

test.describe('Kana Rush play', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('counts down, then shows the HUD with no axe violations', async ({ page }) => {
    await page.clock.install();
    await page.goto(PLAY);
    await expect(page.locator('[data-count]')).toHaveText('3');
    await page.clock.runFor(COUNTDOWN_MS - 300);
    await expect(page.locator('[data-count]')).toHaveText('始め!');
    await page.clock.runFor(400);
    await expect(game(page)).toHaveAttribute('data-status', 'playing');
    await expect(page.getByText('Hiragana · Normal · Challenge')).toBeVisible();
    await expect(page.locator('[data-hud-lives]')).toHaveText('5/5');
    await expect(page.locator('[data-life-bar] span')).toHaveCount(5);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('typing a bubble fills it, lights the keys and pops it', async ({ page }) => {
    await startRun(page);
    await expect(bubbles(page)).toHaveCount(1);
    const reading = (await bubbles(page).first().getAttribute('data-reading')) ?? '';
    const romaji = toRomaji(reading);

    await page.keyboard.type(romaji.slice(0, 2));
    await page.clock.runFor(50);
    await expect(bubbles(page).first()).toHaveClass(/is-target/);
    await expect(bubbles(page).first().locator('.is-filled')).not.toHaveCount(0);
    await expect(page.locator('[data-typed]')).toHaveText(romaji.slice(0, 2));
    await expect(page.locator(`[data-key="${romaji[1]}"]`)).toHaveAttribute(
      'data-state',
      'correct',
    );

    await page.keyboard.type(romaji.slice(2));
    await page.clock.runFor(300);
    await expect(game(page)).toHaveAttribute('data-popped', '1');
    await expect(page.locator('[data-hud-popped]')).toHaveText('1');
    await expect(page.locator('[data-acc]')).toHaveText('100%');
  });

  test('a wrong key is shown, flashed and ignored', async ({ page }) => {
    await startRun(page);
    await page.keyboard.type('q');
    await expect(page.locator('[data-wrong]')).toHaveText('q');
    await expect(page.locator('[data-typed]')).toHaveText('');
    await expect(page.locator('[data-key="q"]')).toHaveAttribute('data-state', 'wrong');
    await expect(page.locator('[data-acc]')).toHaveText('0%');
  });

  test('a bubble that crosses breaks and costs a life; no lives ends the run', async ({ page }) => {
    await startRun(page);
    await page.clock.runFor(12_000);
    const counts = await game(page).evaluate((el) => ({
      lives: Number(el.dataset['lives']),
      missed: Number(el.dataset['missed']),
    }));
    expect(counts.missed).toBeGreaterThan(0);
    expect(counts.lives).toBe(5 - counts.missed);
    await expect(page.locator('[data-life-bar] .is-lost')).toHaveCount(counts.missed);

    await page.clock.runFor(30_000);
    await expect(game(page)).toHaveAttribute('data-status', 'failed');
    await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(game(page)).toHaveAttribute('data-status', 'countdown');
    await page.clock.runFor(COUNTDOWN_MS + 100);
    await expect(game(page)).toHaveAttribute('data-status', 'playing');
    await expect(game(page)).toHaveAttribute('data-lives', '5');
  });

  test('Escape pauses with the field blurred and the timer stopped', async ({ page }) => {
    await startRun(page);
    await page.keyboard.press('Escape');
    await expect(game(page)).toHaveAttribute('data-status', 'paused');
    await expect(page.getByText('Paused')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
    const filter = await page.locator('[data-field]').evaluate((el) => getComputedStyle(el).filter);
    expect(filter).toContain('blur');
    const time = await page.locator('[data-time]').textContent();
    await page.clock.runFor(5_000);
    await expect(page.locator('[data-time]')).toHaveText(time ?? '');

    await page.keyboard.press('Escape');
    await expect(game(page)).toHaveAttribute('data-status', 'playing');
    await expect(page.locator('[data-input]')).toBeFocused();
  });

  test('quitting from pause ends the run', async ({ page }) => {
    await startRun(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Quit run' }).click();
    await expect(game(page)).toHaveAttribute('data-status', 'quit');
    await expect(page.getByRole('heading', { name: 'Run ended' })).toBeVisible();
  });

  test('results show the run with no axe violations and a downloadable card', async ({ page }) => {
    await startRun(page);
    await page.clock.runFor(1500);
    const reading = await bubbles(page)
      .first()
      .evaluate((el) => (el as HTMLElement).dataset['reading'] ?? '');
    await page.keyboard.type('q');
    await page.keyboard.type(toRomaji(reading));
    await expect(game(page)).toHaveAttribute('data-popped', '1');
    await page.clock.runFor(2000);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Quit run' }).click();

    const results = page.locator('[data-results]');
    await expect(results.getByRole('heading', { name: 'Run ended' })).toBeVisible();
    await expect(page.locator('.play')).toBeHidden();
    await expect(results.locator('[data-stat="popped"]')).toHaveText('1');
    await expect(results.locator('[data-stat="accuracy"]')).toHaveText(/^\d+%$/);
    await expect(results.locator('[data-stat="time"]')).toHaveText(/^0:0\d$/);
    await expect(results.locator('[data-words] li').first()).toContainText(reading);
    await expect(results.locator('[data-words-count]')).toHaveText('1 popped');
    await expect(results.locator('[data-chart] .chart__line')).toHaveCount(1);
    await expect(results.locator('[data-chart] .chart__error')).not.toHaveCount(0);
    await expect(results.locator('[data-chart-desc]')).toContainText('Seconds with errors: 1');
    await expect(results.locator('[data-slowest] a').first()).toHaveAttribute(
      'href',
      /\/learn\/kana\//,
    );

    await page.getByLabel('Name on card (optional)').fill('swogvex');
    await expect(results.locator('[data-share-image]')).toHaveAttribute('aria-label', /swogvex/);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG' }).click();
    expect((await download).suggestedFilename()).toMatch(/^kana-rush-\d{4}-\d\d-\d\d\.png$/);

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations).toEqual([]);
  });

  test('hiding the tab pauses the run', async ({ page }) => {
    await startRun(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(game(page)).toHaveAttribute('data-status', 'paused');
  });

  test('Tab then Enter restarts with a new countdown', async ({ page }) => {
    await startRun(page);
    await page.clock.runFor(5_000);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Restart' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(game(page)).toHaveAttribute('data-status', 'countdown');
    await expect(page.locator('[data-time]')).toHaveText('02:30');
  });

  test('the ISO-ES layout shows ñ', async ({ page }) => {
    await page.goto(`${PLAY}&layout=iso-es`);
    await expect(page.locator('[data-key="ñ"]')).toBeVisible();
    await page.goto(PLAY);
    await expect(page.locator('[data-key="ñ"]')).toBeHidden();
  });

  test('a list that does not exist yet says so', async ({ page }) => {
    await page.goto('/game/play?script=kanji&difficulty=extreme');
    await expect(page.getByText('This list is not ready yet.')).toBeVisible();
    await expect(game(page)).toHaveAttribute('data-status', 'unavailable');
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

test.describe('Kana Rush on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('shows the blocked screen instead of the game', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(PLAY);
    await expect(page.getByRole('heading', { name: 'Try Kana Rush on a computer' })).toBeVisible();
    await expect(page.locator('.play')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Play anyway' })).toBeHidden();
    await expect(game(page)).toHaveAttribute('data-status', 'blocked');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: 'Copy link for later' }).click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  });
});

test.describe('Kana Rush in a narrow desktop window', () => {
  test.use({ viewport: { width: 900, height: 900 } });

  test('offers Play anyway, which starts the game', async ({ page }) => {
    await page.goto(PLAY);
    await expect(game(page)).toHaveAttribute('data-status', 'blocked');
    await page.getByRole('button', { name: 'Play anyway' }).click();
    await expect(page.locator('.play')).toBeVisible();
    await expect(game(page)).toHaveAttribute('data-status', 'countdown');
  });
});
