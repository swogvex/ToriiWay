import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, test } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test.use({ viewport: { width: 1440, height: 1000 } });

/**
 * Submits a plausible Extreme run that failed after 3 s (15 wrong keys = 3 lives), so the
 * real-time check passes without waiting. Submissions are limited to 10 per IP and hour
 * across the whole suite: keep the number of calls small.
 */
async function submit(
  request: APIRequestContext,
  name: string,
  script: 'hiragana' | 'katakana',
  perSecond: number,
): Promise<string> {
  const items = (await (await request.get(`/data/game/${script}/extreme.json`)).json()) as {
    text: string;
  }[];
  const run = await request.post('/api/game/runs', {
    data: { script, difficulty: 'extreme', mode: 'challenge' },
  });
  const { runId } = (await run.json()) as { runId: string };
  const correct = perSecond * 3;
  const wpm = (keys: number) => keys / 5 / (3 / 60);
  const response = await request.post('/api/game/scores', {
    data: {
      runId,
      name,
      submitter: (perSecond % 10).toString().repeat(64),
      turnstile: 'test',
      script,
      difficulty: 'extreme',
      mode: 'challenge',
      status: 'failed',
      duration: 3,
      samples: [
        [perSecond, 5],
        [perSecond, 5],
        [perSecond, 5],
      ],
      correctKeys: correct,
      wrongKeys: 15,
      popped: 1,
      missed: 0,
      items: [items[0]?.text],
      wpm: wpm(correct),
      rawWpm: wpm(correct + 15),
      accuracy: (correct / (correct + 15)) * 100,
      consistency: 100,
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test.describe('Kana Rush leaderboard', () => {
  test('lists submitted runs, expands a row and keeps filters in the URL', async ({
    page,
    request,
  }, info) => {
    // Each project (light, dark) uses its own script, so parallel runs do not mix.
    const script = info.project.name === 'dark' ? 'katakana' : 'hiragana';
    const tag = info.project.name === 'dark' ? 'D' : 'L';
    await submit(request, `Slow_${tag}`, script, 4);
    await submit(request, `Fast_${tag}`, script, 8);

    // Challenge only: leaderboard-submit.spec.ts puts Endless runs on these scripts.
    await page.goto(`/game/leaderboard?script=${script}&difficulty=extreme&mode=challenge`);
    await expect(page.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Extreme' })).toBeChecked();
    const rows = page.locator('[data-row-toggle]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(`Fast_${tag}`);
    await expect(rows.nth(0)).toContainText('96');
    await expect(rows.nth(1)).toContainText(`Slow_${tag}`);
    await expect(page.locator('[data-board-summary]')).toHaveText(/^2 runs · /);

    await rows.nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'true');
    const details = page.locator('[data-row-details]:not([hidden])');
    await expect(details.getByRole('img', { name: /WPM over time/ })).toBeVisible();
    await expect(details.locator('[data-f="stat-wpm"]')).toHaveText('96');
    // Only one row open at a time.
    await rows.nth(1).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'false');

    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations).toEqual([]);

    // Endless shows the survival sort and writes the filter to the URL.
    await page.getByRole('radio', { name: 'Endless' }).check({ force: true });
    await expect(page).toHaveURL(/mode=endless/);
    await expect(page.getByRole('radio', { name: /Longest first/ })).toBeChecked();
    await page.getByRole('radio', { name: /Shortest first/ }).check({ force: true });
    await expect(page).toHaveURL(/sort=shortest/);
    await page.goBack();
    await page.goBack();
    await expect(page.getByRole('radio', { name: 'Challenge' })).toBeChecked();
    await expect(page.locator('[data-board-sort]')).toBeHidden();
    await expect(rows).toHaveCount(2);
  });

  test('shows the empty state and passes axe on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/game/leaderboard?script=kanji&difficulty=easy&mode=endless');
    await expect(page.getByText(/No runs here yet/)).toBeVisible();
    await expect(page.locator('[data-board-summary]')).toHaveText(
      /^0 runs · Kanji · Easy · Endless/,
    );
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(axe.violations).toEqual([]);
  });
});
