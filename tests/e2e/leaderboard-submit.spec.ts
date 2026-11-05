import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** Endless, so these runs never land on the Challenge boards that leaderboard.spec.ts counts. */
const MODE = 'endless';

test.use({ viewport: { width: 1440, height: 1000 } });

const game = (page: Page) => page.locator('[data-game]');
const panel = (page: Page) => page.locator('[data-submit]');

/** Stand-in for Cloudflare's Turnstile script: renders nothing and hands back a token. */
async function stubTurnstile(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w1";},reset:()=>{}};',
    }),
  );
}

/**
 * Plays Extreme and loses all 3 lives to 15 wrong keys after one second: a real,
 * plausible run that ends at once. Real time on purpose: Turnstile and the submission
 * wait on real timers. Each project uses its own script so the parallel light and dark
 * runs do not share a board.
 */
async function loseQuickly(page: Page, script: string, reduce = false): Promise<void> {
  const options = reduce ? '&reduce=1' : '';
  await page.goto(`/game/play?script=${script}&difficulty=extreme&mode=${MODE}${options}`);
  await expect(game(page)).toHaveAttribute('data-status', 'playing', { timeout: 10_000 });
  await page.waitForTimeout(1000);
  await page.keyboard.type('q'.repeat(15));
  await expect(game(page)).toHaveAttribute('data-status', 'failed');
}

test.describe('Kana Rush leaderboard submission', () => {
  test('a finished run can be submitted and shows up on the board', async ({ page }, info) => {
    const script = info.project.name === 'dark' ? 'katakana' : 'hiragana';
    const name = info.project.name === 'dark' ? 'Submit_D' : 'Submit_L';
    await stubTurnstile(page);
    await loseQuickly(page, script);

    await expect(panel(page)).toHaveAttribute('data-state', 'offer');
    await expect(page.getByRole('heading', { name: /Submit this run/ })).toBeVisible();
    await expect(page.locator('[data-submit-rank]')).toContainText(/rank #\d+ in/);

    const field = page.getByLabel('Name on the leaderboard');
    const send = page.getByRole('button', { name: 'Submit to leaderboard' });
    await field.fill('ab');
    await expect(send).toBeDisabled();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await field.fill(name);
    await expect(send).toBeEnabled();

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations).toEqual([]);

    await send.click();
    await expect(panel(page)).toHaveAttribute('data-state', 'done', { timeout: 10_000 });
    await expect(
      page.getByRole('status').filter({ hasText: 'Your run is on the leaderboard' }),
    ).toContainText(`${name} · #`);
    // The card name follows the leaderboard name.
    await expect(page.locator('[data-share-name]')).toHaveValue(name);

    await page.getByRole('link', { name: /View leaderboard/ }).click();
    await expect(page).toHaveURL(new RegExp(`script=${script}&difficulty=extreme&mode=${MODE}`));
    const row = page.locator('[data-row-toggle]', { hasText: name });
    await expect(row).toBeVisible();
    // This browser submitted it, so it can remove it.
    await row.click();
    await expect(page.locator('[data-row-details]:not([hidden]) [data-row-remove]')).toBeVisible();
  });

  test('"No thanks" keeps the run private until the player changes their mind', async ({
    page,
  }) => {
    await loseQuickly(page, 'kanji');
    await page.getByRole('button', { name: 'No thanks' }).click();
    await expect(panel(page)).toHaveAttribute('data-state', 'declined');
    await expect(page.getByText('This run stays private on this device.')).toBeVisible();
    await page.getByRole('button', { name: /Changed your mind/ }).click();
    await expect(panel(page)).toHaveAttribute('data-state', 'offer');
    await expect(page.getByLabel('Name on the leaderboard')).toBeFocused();
  });

  test('runs with reduced motion are not offered', async ({ page }) => {
    await loseQuickly(page, 'kanji', true);
    await expect(panel(page)).toHaveAttribute('data-state', 'reduced');
    await expect(page.getByText(/reduced motion are slower/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit to leaderboard' })).toBeHidden();
  });

  test('a tampered submission is rejected', async ({ request }) => {
    const run = await request.post('/api/game/runs', {
      data: { script: 'kanji', difficulty: 'extreme', mode: 'challenge' },
    });
    const { runId } = (await run.json()) as { runId: string };
    const response = await request.post('/api/game/scores', {
      data: {
        runId,
        name: 'Cheater',
        submitter: 'c'.repeat(64),
        turnstile: 'test',
        script: 'kanji',
        difficulty: 'extreme',
        mode: 'challenge',
        status: 'cleared',
        duration: 180,
        samples: Array.from({ length: 180 }, () => [20, 0]),
        correctKeys: 3600,
        wrongKeys: 0,
        popped: 80,
        missed: 0,
        items: ['日'],
        wpm: 240,
        rawWpm: 240,
        accuracy: 100,
        consistency: 100,
      },
    });
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ error: 'invalid-run' });
  });
});
