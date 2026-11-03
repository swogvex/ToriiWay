import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The preview server keeps runs in memory (JLPT_MEMORY_STORE in playwright.config.ts).
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test.use({ viewport: { width: 1440, height: 1000 } });

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** Starts an N5 run from the start page and waits for the first question. */
async function startN5(page: Page) {
  await page.goto('/jlpt');
  await page.getByRole('button', { name: /Start N5 simulation/ }).click();
  const tips = page.getByRole('dialog', { name: 'Before you start' });
  await expect(tips).toBeVisible();
  await tips.getByRole('button', { name: /Start now/ }).click();
  await expect(page).toHaveURL(/\/jlpt\/run$/);
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 10_000 });
}

const mapItem = (page: Page, number: number) =>
  page.getByRole('navigation', { name: 'Questions' }).getByRole('button', {
    name: new RegExp(`^Question ${number}(,|$)`),
  });

test.describe('JLPT start page', () => {
  test('shows N5 by default with its sections and no axe violations', async ({ page }) => {
    await page.goto('/jlpt');
    await expect(page.getByRole('heading', { level: 1, name: 'JLPT simulation' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'N5' })).toBeChecked();
    await expect(page.getByRole('heading', { name: 'N5 sections' })).toBeVisible();
    await expect(page.getByText('20 min')).toBeVisible();
    await expect(page.getByText('Start · N5 · 90 min total')).toBeVisible();
    await expect(page.getByText(/Not affiliated with, endorsed by/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('levels without a question bank cannot start yet', async ({ page }) => {
    await page.goto('/jlpt');
    await page.getByRole('radio', { name: 'N4' }).check();
    await expect(page.getByRole('heading', { name: 'N4 sections' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Start N4 simulation/ })).toBeDisabled();
    await expect(page.getByText(/N4 question bank is being written/)).toBeVisible();
    await page.getByRole('radio', { name: 'Kana' }).check();
    await expect(page.getByRole('button', { name: /Start Kana simulation/ })).toBeEnabled();
    await expect(page.getByText(/Kana is a site-only level/)).toBeVisible();
  });

  test('without a Japanese voice, Test audio explains how to add one', async ({ page }) => {
    // Headless Chromium has no Japanese voice.
    await page.goto('/jlpt');
    await page.getByRole('button', { name: 'Test audio' }).click();
    await expect(page.getByText(/This browser has no Japanese voice/)).toBeVisible();
    await page.getByRole('button', { name: 'How to add a Japanese voice' }).click();
    const help = page.getByRole('dialog', { name: 'Add a Japanese voice' });
    await expect(help).toBeVisible();
    await expect(
      help.getByText('Your system', { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(help.getByText(/Quickest fix/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('an unknown result answers 404 with a way back', async ({ page }) => {
    const response = await page.goto('/jlpt/r/6f1c2f9e-3b5a-4d8e-9c1a-2b3c4d5e6f70');
    expect(response?.status()).toBe(404);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.getByRole('heading', { level: 1, name: 'Result not found' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('the run page without a run points back to the start page', async ({ page }) => {
    await page.goto('/jlpt/run');
    await expect(page.getByRole('heading', { name: 'No simulation in progress' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the JLPT page' })).toBeVisible();
  });
});

test('the Japanese voice help page has no axe violations', async ({ page }) => {
  await page.goto('/help/japanese-voice');
  await expect(page.getByRole('heading', { level: 1, name: 'Add a Japanese voice' })).toBeVisible();
  await page.getByText('macOS').click();
  await expect(page.getByText(/Manage Voices…/)).toBeVisible();
  await expectNoAxeViolations(page);
});

test.describe('JLPT exam', () => {
  test('answers with the keyboard, flags, resumes after a reload and finalizes', async ({
    page,
  }) => {
    await startN5(page);
    const steps = page.getByRole('list', { name: 'Sections' });
    await expect(steps.getByRole('listitem').first()).toHaveText(/1 Vocabulary 0\/21/);
    await expect(steps.getByRole('listitem').nth(1)).toHaveText(/40:00/);
    await expect(mapItem(page, 21)).toBeVisible();
    await expect(mapItem(page, 22)).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(4);
    await expectNoAxeViolations(page);

    await page.keyboard.press('2');
    await expect(page.locator('[data-choices] input[value="2"]')).toBeChecked();
    await page.keyboard.press('f');
    await expect(mapItem(page, 1)).toHaveAccessibleName('Question 1, answered, flagged');
    await page.keyboard.press('ArrowRight');
    await expect(mapItem(page, 2)).toHaveAttribute('aria-current', 'true');

    await page.reload();
    await expect(mapItem(page, 1)).toHaveAccessibleName('Question 1, answered, flagged');

    await page.getByRole('button', { name: 'Finalize section' }).click();
    const confirm = page.getByRole('dialog', { name: 'Finalize this section?' });
    await expect(confirm).toContainText('You have 20 unanswered questions and');
    await confirm.getByRole('button', { name: 'Finalize', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: 'Vocabulary done. Take a breath.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue in/ })).toBeDisabled();
    await expect(page.locator('[data-summary]').getByText(/^1\/21 · /)).toBeVisible();
    await page.getByRole('button', { name: 'Hard' }).click();
    await expect(page.getByText('Thanks, noted.')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a full N5 run reaches the score', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'light', 'Real two-minute breaks: run once.');
    test.setTimeout(300_000);
    await startN5(page);
    for (const [section, count] of [
      ['Vocabulary', 21],
      ['Grammar · Reading', 22],
      ['Listening', 24],
    ] as const) {
      await expect(page.getByRole('timer')).toBeVisible({ timeout: 15_000 });
      for (let index = 0; index < count; index += 1) {
        await page.keyboard.press('1');
        if (index < count - 1) await page.keyboard.press('ArrowRight');
      }
      await expect(mapItem(page, count)).toHaveAccessibleName(`Question ${count}, answered`);
      await page.getByRole('button', { name: 'Finalize section' }).click();
      await page
        .getByRole('dialog', { name: 'Finalize this section?' })
        .getByRole('button', { name: 'Finalize', exact: true })
        .click();
      if (section === 'Listening') break;
      await expect(
        page.getByRole('heading', { name: `${section} done. Take a breath.` }),
      ).toBeVisible();
      const next = page.getByRole('button', { name: 'Continue', exact: true });
      await expect(next).toBeEnabled({ timeout: 70_000 });
      await next.click();
    }
    await expect(page.getByText('N5 · Simulation complete')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Total' })).toBeVisible();
    await expect(page.getByRole('cell', { name: / \/ 180$/ })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByLabel('Name on your report (optional)').fill('  Ana  ');
    await page.getByRole('button', { name: 'See my score report' }).click();
    await expect(page).toHaveURL(/\/jlpt\/r\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Well done, Ana.' })).toBeVisible();
    const card = page.getByRole('article', { name: '日本語能力試験 模擬テスト' });
    await expect(card.getByText('Not enough data yet')).toBeVisible();
    await expect(card.getByRole('columnheader', { name: /Total/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Breakdown by question type' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review your mistakes' })).toBeVisible();
    await expectNoAxeViolations(page);

    const download = page.getByRole('link', { name: 'Download PNG' });
    const imagePath = await download.getAttribute('href');
    expect(imagePath).toMatch(/^\/api\/og\/jlpt\/[0-9a-f-]{36}\.png$/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\.png$/);
    const image = await page.request.get(imagePath ?? '');
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    expect([...(await image.body()).subarray(0, 4)]).toEqual([137, 80, 78, 71]);
  });
});
