import { type APIRequestContext, expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './axe';

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
  test('lists runs, expands a row, keeps filters in the URL, and moderation hides a reported run', async ({
    page,
    request,
    browser,
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

    await expectNoAxeViolations(page);

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

    // Report the slow run (Turnstile stubbed), then hide it from /admin/leaderboard.
    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w1";},reset:()=>{}};',
      }),
    );
    await rows.nth(1).click();
    await page.locator('[data-row-details]:not([hidden]) [data-row-report]').click();
    const dialog = page.getByRole('dialog', { name: 'Report this entry' });
    await dialog.getByRole('radio', { name: 'Suspicious score' }).check();
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog.getByText('Thanks. We will review it.')).toBeVisible();

    expect((await page.request.get('/admin/leaderboard')).status()).toBe(401);
    const admin = await browser.newContext({
      httpCredentials: { username: 'e2e-admin', password: 'e2e-admin-password' },
    });
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/leaderboard');
    const item = adminPage.getByRole('listitem').filter({ hasText: `Slow_${tag}` });
    await expect(item).toContainText('1 open report: 1× score');
    await item.getByRole('button', { name: 'Hide' }).click();
    await expect(adminPage.getByRole('listitem').filter({ hasText: `Slow_${tag}` })).toContainText(
      'hidden',
    );
    await admin.close();

    await page.reload();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText(`Fast_${tag}`);
  });

  test('pages of 50 with numbered navigation kept in the URL', async ({ page }) => {
    const cursors: string[] = [];
    // A fake API with 120 entries, so paging needs no real submissions.
    await page.route('**/api/game/leaderboard?*', (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      cursors.push(String(offset));
      const entries = Array.from({ length: Math.min(50, 120 - offset) }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(offset + index).padStart(12, '0')}`,
        rank: offset + index + 1,
        name: `Player_${offset + index + 1}`,
        script: 'hiragana',
        difficulty: 'normal',
        mode: 'challenge',
        cleared: true,
        durationS: 150,
        wpm: 200 - offset - index,
        rawWpm: 200,
        accuracy: 99,
        consistency: 90,
        popped: 50,
        missed: 0,
        series: [10, 20, 30],
        errors: [],
        createdAt: 0,
      }));
      return route.fulfill({
        json: { entries, next: offset + 50 < 120 ? String(offset + 50) : null, total: 120 },
      });
    });
    await page.goto('/game/leaderboard?mode=challenge');
    const rows = page.locator('[data-row-toggle]');
    await expect(rows).toHaveCount(50);
    const pages = page.getByRole('navigation', { name: 'Leaderboard pages' });
    await expect(pages.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(pages.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await pages.getByRole('button', { name: 'Page 3' }).click();
    await expect(page).toHaveURL(/mode=challenge&page=3/);
    await expect(rows).toHaveCount(20);
    await expect(rows.first()).toContainText('Player_101');
    await expect(pages.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(cursors).toContain('100');

    // Changing a filter goes back to page 1.
    await page.getByRole('radio', { name: 'Normal' }).check({ force: true });
    await expect(page).not.toHaveURL(/page=/);
    await page.goBack();
    await expect(page).toHaveURL(/page=3/);
    await expect(rows.first()).toContainText('Player_101');
  });

  test('shows the empty state and passes axe on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/game/leaderboard?script=kanji&difficulty=easy&mode=endless');
    await expect(page.getByText(/No runs here yet/)).toBeVisible();
    await expect(page.locator('[data-board-summary]')).toHaveText(
      /^0 runs · Kanji · Easy · Endless/,
    );
    await expectNoAxeViolations(page);
  });

  test('moves your names to another browser with a code', async ({ browser }) => {
    const mine = 'a1'.repeat(32);
    const other = 'b2'.repeat(32);

    // Browser 1 already posted runs: it shows its code and copies it.
    const first = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    await first.addInitScript((token) => localStorage.setItem('tw:v1:submitter', token), mine);
    const one = await first.newPage();
    await one.goto('/game/leaderboard?script=kanji&difficulty=easy&mode=endless');
    await one.getByRole('button', { name: 'Show my code' }).click();
    const show = one.getByRole('dialog', { name: 'Your code' });
    const code = show.locator('[data-board-code-value]');
    await expect(code).toHaveText(/^(a1a1a1a1 ){7}a1a1a1a1$/);
    await show.getByRole('button', { name: 'Copy code' }).click();
    await expect(show.getByRole('status')).toHaveText('Code copied.');
    expect(await one.evaluate(() => navigator.clipboard.readText())).toBe(await code.innerText());
    await expectNoAxeViolations(one);
    await first.close();

    // Browser 2 has its own token: a bad code is refused, the right one replaces it.
    const second = await browser.newContext();
    await second.addInitScript((token) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('tw:v1:submitter', token);
        localStorage.setItem('tw:v1:leaderboard-mine', '["old-entry"]');
        sessionStorage.setItem('seeded', '1');
      }
    }, other);
    const two = await second.newPage();
    await two.goto('/game/leaderboard?script=kanji&difficulty=easy&mode=endless');
    const opener = two.getByRole('button', { name: 'Enter a code' });
    await opener.click();
    const enter = two.getByRole('dialog', { name: 'Enter your code' });
    await expect(enter.getByText(/already has its own code/)).toBeVisible();
    const field = enter.getByLabel('Code from your other browser');
    await field.fill('not a code');
    await enter.getByRole('button', { name: 'Use this code' }).click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(enter.getByRole('status')).toHaveText(/not valid/);
    await expectNoAxeViolations(two);

    await field.fill(`  ${'A1A1A1A1-'.repeat(7)}A1A1A1A1 `);
    await enter.getByRole('button', { name: 'Use this code' }).click();
    await expect(enter.getByRole('status')).toHaveText(/can now post under your names/);
    await expect(enter).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await two.evaluate(() => localStorage.getItem('tw:v1:submitter'))).toBe(mine);
    expect(await two.evaluate(() => localStorage.getItem('tw:v1:leaderboard-mine'))).toBe('[]');

    // A fresh browser has no code to show.
    const third = await browser.newPage();
    await third.goto('/es/game/leaderboard');
    await third.getByRole('button', { name: 'Mostrar mi código' }).click();
    await expect(third.getByText(/aún no ha enviado ninguna partida/)).toBeVisible();
    await expect(third.getByRole('button', { name: 'Copiar código' })).toBeHidden();
    await third.context().close();
    await second.close();
  });
});
