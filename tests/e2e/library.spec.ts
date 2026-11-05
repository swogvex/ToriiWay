import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test.use({ viewport: { width: 1440, height: 1000 } });

const cards = (page: Page) => page.locator('[data-slug]:not([hidden])');
const noAxeViolations = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations).toEqual([]);
};

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
    await noAxeViolations(page);
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
    await noAxeViolations(page);
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
    await noAxeViolations(page);
  });
});
