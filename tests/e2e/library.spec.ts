import { expect, type Page, test } from '@playwright/test';

import { expectNoAxeViolations } from './axe';

test.use({ viewport: { width: 1440, height: 1000 } });

const cards = (page: Page) => page.locator('[data-slug]:not([hidden])');

test.describe('Library', () => {
  test('lists the books with featured ones first, with no axe violations', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    const all = await cards(page).count();
    expect(all).toBeGreaterThanOrEqual(20);
    await expect(cards(page).first()).toContainText('Irodori');
    await expect(page.getByRole('status').filter({ hasText: /books?$/ })).toHaveText(
      `${all} books`,
    );
    await expectNoAxeViolations(page);
  });

  test('filters (OR within a group, AND across groups) live in the URL', async ({ page }) => {
    await page.goto('/library');
    await page.getByRole('checkbox', { name: 'N5' }).check();
    await expect(page).toHaveURL(/level=N5/);
    const n5 = await cards(page).count();
    await page.getByRole('checkbox', { name: 'Spanish edition' }).check();
    await expect(page).toHaveURL(/level=N5&resources=es/);
    const n5Spanish = await cards(page).count();
    expect(n5Spanish).toBeGreaterThan(0);
    expect(n5Spanish).toBeLessThan(n5);
    for (const card of await cards(page).all()) {
      await expect(card.locator('.badge--es')).toBeVisible();
    }

    // Back undoes the last filter; a shared link restores the same view.
    await page.goBack();
    await expect(cards(page)).toHaveCount(n5);
    await page.goto('/library?level=N5&resources=es&sort=az');
    await expect(cards(page)).toHaveCount(n5Spanish);
    await expect(page.getByRole('combobox', { name: 'Sort' })).toHaveValue('az');
    await expect(page.getByRole('checkbox', { name: 'Spanish edition' })).toBeChecked();
  });

  test('search ignores case and accents, and the empty state clears everything', async ({
    page,
  }) => {
    await page.goto('/library');
    const search = page.getByRole('searchbox', { name: 'Search by title, author or topic' });
    await search.fill('HEISIG');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Kanji para recordar');
    await expect(page).toHaveURL(/q=HEISIG/);

    await search.fill('zzzz no such book');
    await expect(page.getByText('No books match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all filters' }).last().click();
    await expect(search).toHaveValue('');
    expect(await cards(page).count()).toBeGreaterThanOrEqual(20);
  });

  test('a book page links to the official site in a new tab', async ({ page }) => {
    await page.goto('/library');
    await page.getByRole('link', { name: /Kanji para recordar/ }).click();
    await expect(page).toHaveURL(/\/library\/kanji-para-recordar-1$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kanji para recordar 1');
    const visit = page.getByRole('link', { name: /Visit official page/ });
    await expect(visit).toHaveAttribute('target', '_blank');
    await expect(visit).toHaveAttribute('rel', /noopener/);
    await expect(visit).toHaveAccessibleName(/opens in a new tab/);
    await expect(page.getByRole('heading', { name: 'Related books' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('phones fold the filters and pass axe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/library');
    const toggle = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('checkbox', { name: 'Kanji' })).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('checkbox', { name: 'Kanji' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe('Library counter', () => {
  test('a visit to the official page is counted once and shows on /admin/library', async ({
    page,
    browser,
  }, info) => {
    // Each project counts a different book, so parallel runs do not share a number.
    const slug = info.project.name === 'dark' ? 'quartet' : 'tobira-beginning';
    await page.goto(`/library/${slug}`);
    // Stay on the page: a second listener cancels the new tab; the page's own listener
    // still sends the beacon.
    await page.evaluate(() =>
      document.addEventListener('click', (event) => event.preventDefault()),
    );
    const visit = page.getByRole('link', { name: /Visit official page/ });
    for (let i = 0; i < 2; i++) {
      const beacon = page.waitForRequest(
        (request) => request.url().endsWith('/api/counters') && request.method() === 'POST',
      );
      await visit.click();
      // Playwright does not expose beacon bodies; /admin/library below checks the key.
      await beacon;
    }

    const admin = await browser.newContext({
      httpCredentials: { username: 'e2e-admin', password: 'e2e-admin-password' },
    });
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin/library');
    const row = adminPage
      .getByRole('row')
      .filter({ has: adminPage.locator(`a[href="/library/${slug}"]`) });
    // Two clicks from the same visitor on the same day count once.
    await expect(row.getByRole('cell')).toHaveText(['1', '1']);
    await admin.close();
  });
});
