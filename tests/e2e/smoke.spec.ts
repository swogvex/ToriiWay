import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const routes = ['/', '/this-page-does-not-exist'];

for (const route of routes) {
  test(`${route} has no axe violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('h1')).toHaveCount(1);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('home has title, description and canonical', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/^ToriiWay/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
});
