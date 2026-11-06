import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PAGEFIND = '**/pagefind/pagefind.js';

// A stand-in for the Pagefind browser API with fixed results, so the dialog can be tested
// before the site has pages beyond the sections. `/` duplicates the Home section option.
const FAKE_PAGEFIND = `
const pages = [
  { url: '/', excerpt: 'the <mark>torii</mark> gate', meta: { title: 'ToriiWay' } },
  { url: '/learn/hiragana/', excerpt: 'the <mark>hiragana</mark> chart &amp; strokes', meta: { title: 'Hiragana chart' } },
];
export async function options() {}
export async function init() {}
export async function search(query) {
  const hits = pages.filter((page) => page.excerpt.includes(query.toLowerCase()));
  return { results: hits.map((page) => ({ data: async () => page })) };
}
`;

async function openSearch(page: Page) {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await expect(dialog).toBeVisible();
  return { dialog, input: dialog.getByRole('combobox', { name: 'Search the site' }) };
}

/** Queries the real built index through the Pagefind browser API and returns the URLs. */
function searchBuiltIndex(page: Page, query: string): Promise<string[]> {
  return page.evaluate(
    async ([url, q]) => {
      const api = (await import(/* @vite-ignore */ url)) as {
        search(query: string): Promise<{ results: { data(): Promise<{ url: string }> }[] }>;
      };
      const { results } = await api.search(q);
      return Promise.all(results.map(async (result) => (await result.data()).url));
    },
    ['/pagefind/pagefind.js', query] as const,
  );
}

test.describe('search with Pagefind', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the built index loads only when the dialog opens', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/pagefind/')) requests.push(request.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(requests).toEqual([]);

    const { input } = await openSearch(page);
    await input.fill('torii');
    await expect
      .poll(() => requests.some((url) => url.endsWith('/pagefind/pagefind.js')))
      .toBe(true);

    // The real index answers: Home is indexed (and hidden in the dialog as a section page).
    const urls = await searchBuiltIndex(page, 'torii');
    expect(urls).toContain('/');
  });

  test('the Kana Rush leaderboard is in the built index', async ({ page }) => {
    await openSearch(page);
    const urls = await searchBuiltIndex(page, 'leaderboard');
    expect(urls.some((url) => url.startsWith('/game/leaderboard'))).toBe(true);
  });

  test('the index runs under the site CSP enforced', async ({ context, page }) => {
    // `astro preview` sends no headers, so serve every response with the CSP from
    // vercel.json switched from report-only to enforcing.
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: { headers: { key: string; value: string }[] }[];
    };
    const csp = vercel.headers
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === 'Content-Security-Policy-Report-Only')?.value;
    expect(csp).toBeDefined();
    await context.route('**/*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': csp ?? '' },
      });
    });
    // Home refreshes its community row on load; answer at once so no request is left
    // half-proxied when the test ends (the later route wins).
    await context.route('**/api/community', (route) =>
      route.fulfill({ contentType: 'application/json', body: '{"discord":null,"videos":[]}' }),
    );
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { violations: string[] }).violations ??= [];
        (window as unknown as { violations: string[] }).violations.push(event.violatedDirective);
      });
    });
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await openSearch(page);
    const urls = await searchBuiltIndex(page, 'torii');
    expect(urls).toContain('/');
    expect(await page.evaluate(() => (window as { violations?: string[] }).violations)).toBe(
      undefined,
    );
    expect(errors).toEqual([]);
  });

  test('page results join the sections, skip section pages and open with Enter', async ({
    page,
  }) => {
    await page.route(PAGEFIND, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_PAGEFIND }),
    );
    const { dialog, input } = await openSearch(page);

    await input.fill('hiragana');
    const result = dialog.getByRole('option', { name: /Hiragana chart/ });
    await expect(result).toBeVisible();
    await expect(result).toContainText('the hiragana chart & strokes');
    await expect(result.locator('mark')).toHaveText('hiragana');
    // The Learn section matches "hiragana" too and stays first.
    await expect(dialog.getByRole('option')).toHaveCount(2);
    await expect(dialog.getByRole('option').first()).toHaveAccessibleName(/Learn/);
    await expect(dialog.getByRole('status')).toHaveText('2 results');

    // "/" is the Home section's page, so Pagefind does not list it again.
    await input.fill('torii');
    await expect(dialog.getByRole('option')).toHaveCount(0);

    await input.fill('hiragana');
    await expect(result).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(result).toHaveAttribute('aria-selected', 'true');
    expect(
      (await new AxeBuilder({ page }).include('#search-dialog').withTags(AXE_TAGS).analyze())
        .violations,
    ).toEqual([]);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/learn\/hiragana$/);
  });

  test('sections still work when Pagefind cannot load', async ({ page }) => {
    await page.route(PAGEFIND, (route) => route.abort());
    const { dialog, input } = await openSearch(page);

    await input.fill('biblioteca');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('status')).toHaveText('1 result');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/library$/);
  });
});
