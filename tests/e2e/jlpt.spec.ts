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

  test('the run page without a run points back to the start page', async ({ page }) => {
    await page.goto('/jlpt/run');
    await expect(page.getByRole('heading', { name: 'No simulation in progress' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the JLPT page' })).toBeVisible();
  });
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
  });
});
