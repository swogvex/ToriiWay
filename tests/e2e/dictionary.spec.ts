import { expect, test } from '@playwright/test';

import { expectNoAxeViolations } from './axe';

const API = '**/api/dictionary/search*';

test.describe('dictionary search page', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const query of ['ichi', '一', 'one', 'uno']) {
    test(`"${query}" reaches 一`, async ({ page }) => {
      await page.goto(`/learn/search?q=${encodeURIComponent(query)}`);
      await expect(page.locator('.dict-card__literal').first()).toHaveText('一');
      await expect(page.locator('#dict-heading')).toContainText(query);
    });
  }

  test('shows the kanji card and the word in English with the Spanish below', async ({ page }) => {
    await page.goto('/learn/search?q=uno');
    const card = page.locator('article.dict-card');
    await expect(card).toContainText('JLPT N5');
    await expect(card).toContainText('Jōyō · grade 1');
    await expect(card).toContainText('freq #2');
    await expect(card).toContainText('ES: uno');
    await expect(card).toContainText('イチ');
    await expect(page.locator('.dict-word')).toContainText('いち');
  });

  test('shows only the panel for the current state', async ({ page }) => {
    await page.goto('/learn/search?q=one');
    await expect(page.locator('.dict-card__literal').first()).toBeVisible();
    for (const panel of ['idle', 'loading', 'empty', 'error']) {
      await expect(page.locator(`[data-dict-panel="${panel}"]`)).toBeHidden();
    }
  });

  test('typing searches after a pause and keeps the URL shareable', async ({ page }) => {
    await page.goto('/learn/search');
    await expect(page.getByText('Search for a word or a kanji')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search the dictionary' }).fill('one');
    await expect(page.locator('.dict-card__literal').first()).toHaveText('一');
    await expect(page).toHaveURL(/\?q=one$/);
  });

  test('shows the empty state with suggestions', async ({ page }) => {
    await page.goto('/learn/search?q=zzzz');
    await expect(page.locator('[data-dict-empty]')).toContainText('zzzz');
    await expect(page.getByRole('link', { name: 'water' })).toBeVisible();
  });

  test('shows skeletons while loading, without moving the box', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(API, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/learn/search?q=one');
    await expect(page.locator('[data-dict-panel="loading"]')).toBeVisible();
    await expect(page.locator('[data-dict-region]')).toHaveAttribute('aria-busy', 'true');
    release();
    await expect(page.locator('[data-dict-panel="loading"]')).toBeHidden();
  });

  test('offers a retry when the search fails', async ({ page }) => {
    let fail = true;
    await page.route(API, (route) =>
      fail ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
    );
    await page.goto('/learn/search?q=one');
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    fail = false;
    await retry.click();
    await expect(page.locator('.dict-card__literal').first()).toHaveText('一');
  });

  test('the attribution is on the screen', async ({ page }) => {
    await page.goto('/learn/search?q=one');
    await expect(
      page.getByRole('main').getByRole('link', { name: /JMdict and KANJIDIC2/ }),
    ).toBeVisible();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no axe violations in ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/learn/search?q=one');
      await expect(page.locator('.dict-card__literal').first()).toBeVisible();
      await expectNoAxeViolations(page);
      await page.goto('/learn/search?q=zzzz');
      await expect(page.locator('[data-dict-empty]')).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

for (const width of [360, 768, 1920]) {
  test(`no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/learn/search?q=one');
    await expect(page.locator('.dict-card__literal').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test('search results lead to the kanji and word pages', async ({ page }) => {
  await page.goto('/learn/search?q=one');
  await page.locator('a.dict-card__literal').first().click();
  await expect(page).toHaveURL(/\/learn\/kanji\/%E4%B8%80$/);
  await page.goto('/learn/search?q=one');
  await page.locator('a.dict-word__form').first().click();
  await expect(page).toHaveURL(/\/learn\/word\/1160790$/);
});

test('the Learn box opens the results', async ({ page }) => {
  await page.goto('/learn/hiragana');
  const box = page.getByRole('searchbox', { name: 'Search the dictionary' });
  await box.fill('uno');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/learn\/search\?q=uno$/);
  await expect(page.locator('.dict-card__literal').first()).toHaveText('一');
});

test('the ⌘K dialog lists kanji and words and opens the results', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.getByRole('combobox').fill('ichi');
  const group = dialog.getByRole('group', { name: 'Kanji & words' });
  await expect(group.getByRole('option').first()).toContainText('一');
  await expect(dialog.getByRole('link', { name: /JMdict and KANJIDIC2/ })).toBeVisible();
  await group.getByRole('option').first().click();
  await expect(page).toHaveURL(/\/learn\/kanji\/%E4%B8%80$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('一');
});

test('a single Latin letter does not query the dictionary from the dialog', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/dictionary/')) calls.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const input = page.getByRole('dialog', { name: 'Search' }).getByRole('combobox');
  await input.fill('a');
  await page.waitForTimeout(400);
  expect(calls).toEqual([]);
});
