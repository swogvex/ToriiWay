import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { toRomaji } from 'wanakana';

import { recordCspViolations, serveWithSiteHeaders } from './site-headers';

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
    // One read: the installed clock keeps flowing, so a bubble can cross between two reads.
    const counts = await game(page).evaluate((el) => ({
      lives: Number(el.dataset['lives']),
      missed: Number(el.dataset['missed']),
      lost: el.querySelectorAll('[data-life-bar] .is-lost').length,
    }));
    expect(counts.missed).toBeGreaterThan(0);
    expect(counts.lives).toBe(5 - counts.missed);
    expect(counts.lost).toBe(counts.missed);

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

  test('with sound on, the countdown starts (after a key if audio is blocked)', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto(`${PLAY}&sound=1`);
    await expect(game(page)).toHaveAttribute('data-status', 'countdown');
    await page.clock.runFor(500);
    const press = page.locator('[data-press-key]');
    if (await press.isVisible()) await page.keyboard.press('Space');
    await page.clock.runFor(COUNTDOWN_MS + 500);
    await expect(game(page)).toHaveAttribute('data-status', 'playing');
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
    const chartBox = await results.locator('.chart').boundingBox();
    const wordsBox = await results.locator('.words').boundingBox();
    expect(Math.abs((chartBox?.height ?? 0) - (wordsBox?.height ?? 0))).toBeLessThan(2);
    // A long list: "Show all" opens every word in a dialog that scrolls inside, and the
    // results layout does not change.
    await results.locator('[data-words]').evaluate((list) => {
      for (let index = 0; index < 200; index += 1) {
        list.append(Object.assign(document.createElement('li'), { textContent: `word ${index}` }));
      }
    });
    // A width change refits the card (ResizeObserver), which reveals "Show all".
    await page.setViewportSize({ width: 900, height: 1000 });
    const showAll = results.getByRole('button', { name: /Show all \(201\)/ });
    await expect(showAll).toBeVisible();
    const narrowChart = await results.locator('.chart').boundingBox();
    await showAll.click();
    const dialog = page.getByRole('dialog', { name: /Words/ });
    await expect(dialog).toBeVisible();
    const all = dialog.locator('[data-words-all]');
    await expect(all.locator('li')).toHaveCount(201);
    expect(await all.evaluate((list) => list.scrollHeight > list.clientHeight)).toBe(true);
    const openChart = await results.locator('.chart').boundingBox();
    expect(Math.abs((openChart?.height ?? 0) - (narrowChart?.height ?? 0))).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(showAll).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 1000 });
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

  test('a list that cannot be loaded says so', async ({ page }) => {
    await page.route('**/data/game/kanji/extreme.json', (route) => route.fulfill({ status: 404 }));
    await page.goto('/game/play?script=kanji&difficulty=extreme');
    await expect(page.getByText('This list could not be loaded.')).toBeVisible();
    await expect(game(page)).toHaveAttribute('data-status', 'unavailable');
  });

  test('runs under the site CSP enforced', async ({ context, page }) => {
    await serveWithSiteHeaders(context);
    const violations = await recordCspViolations(page);
    await startRun(page);
    await page.clock.runFor(3_000);
    // The fake clock keeps flowing while expect polls, so check that bubbles exist, not how many.
    await expect(bubbles(page).first()).toBeVisible();
    const transform = await bubbles(page)
      .first()
      .evaluate((el) => el.style.transform);
    expect(transform).toMatch(/^translate3d\(/);
    expect(await violations()).toEqual([]);
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

test.describe('Kana Rush on a laptop screen', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the whole game fits the window with no scroll', async ({ page }) => {
    await startRun(page);
    await expect(page.locator('.hints')).toBeInViewport({ ratio: 1 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('large bubbles never overlap on a short field', async ({ page }) => {
    await startRun(page, `${PLAY}&size=l`);
    await page.clock.runFor(12_000);
    const pills = await page
      .locator('.bubble:not([hidden]):not(.is-popping):not(.is-missed) .bubble__pill')
      .evaluateAll((els) =>
        els.map((el) => {
          const { top, bottom } = el.getBoundingClientRect();
          return { top, bottom };
        }),
      );
    expect(pills.length).toBeGreaterThan(1);
    for (const [i, a] of pills.entries()) {
      for (const b of pills.slice(i + 1)) {
        expect(a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
  });
});

test.describe('Kana Rush lists', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  for (const script of ['katakana', 'kanji']) {
    test(`${script} bubbles pop when their hint is typed`, async ({ page }) => {
      await startRun(page, `/game/play?script=${script}&difficulty=hard&mode=challenge&seed=5`);
      await page.clock.runFor(1500);
      // The hint is in the DOM before it shows; typing it must pop the bubble.
      const hint = await bubbles(page).first().locator('[data-hint]').textContent();
      expect(hint).toMatch(/^[a-z'-]+$/);
      await page.keyboard.type(hint ?? '');
      await expect(game(page)).toHaveAttribute('data-popped', '1');
    });
  }
});
