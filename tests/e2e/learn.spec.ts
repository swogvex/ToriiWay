import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('kana chart', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('shows the guide intro, the chart and the panel without axe violations', async ({
    page,
  }) => {
    await page.goto('/learn/hiragana');
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hiragana', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { name: 'What is hiragana?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Basic 46' })).toHaveAttribute(
      'href',
      '/learn/guide/what-is-hiragana#basic-46',
    );

    const basic = page.getByRole('tabpanel', { name: 'Basic 46' });
    await expect(basic.getByRole('button')).toHaveCount(46);
    await expect(page.locator('#kana-panel')).toContainText('あ');
    await expectNoAxeViolations(page);
  });

  test('choosing a kana fills the panel', async ({ page }) => {
    await page.goto('/learn/hiragana');
    const ka = page.getByRole('button', { name: 'か ka' });
    await ka.click();
    await expect(ka).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'あ a' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const panel = page.locator('#kana-panel');
    await expect(panel.getByRole('heading', { level: 3 })).toHaveText(/か\s*ka/);
    await expect(panel).toContainText('Hiragana · K-row · 3 strokes');
    await expect(panel).toContainText('かさ kasa — umbrella / paraguas');
    await expect(panel.getByRole('img', { name: 'Stroke order of か' })).toBeVisible();
    await expect(panel.locator('.strokes__ink path')).toHaveCount(3);
    await expect(panel.getByRole('link', { name: 'More about か' })).toHaveAttribute(
      'href',
      '/learn/kana/か',
    );
    await expect(panel.getByRole('status')).toHaveText('ka. Hiragana · K-row · 3 strokes');

    // A yōon draws both glyphs: き (4) + ゃ (3).
    await page.getByRole('tab', { name: 'Combinations' }).click();
    await page.getByRole('button', { name: 'きゃ kya' }).click();
    await expect(panel.locator('.strokes__ink path')).toHaveCount(7);
    await expect(panel).not.toContainText('A blade with a spark');
  });

  test('on desktop the panel stays in view next to the chart', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/learn/hiragana');
    // ん is in the last row: clicking it scrolls the chart, the pinned panel follows.
    await page.getByRole('button', { name: 'ん n' }).click();
    await expect(page.locator('#kana-panel')).toContainText('ん');
    await expect(page.locator('#kana-panel')).toBeInViewport({ ratio: 0.9 });
  });

  test('on a phone a tap brings the panel under the chart into view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/learn/hiragana');
    await page.getByRole('button', { name: 'か ka' }).click();
    await expect(page.locator('#kana-panel')).toBeInViewport({ ratio: 0.5 });
  });

  test('arrow keys move between cells and skip the gaps', async ({ page }) => {
    await page.goto('/learn/hiragana');
    const cell = (name: string) => page.getByRole('button', { name, exact: true });

    await cell('あ a').focus();
    await page.keyboard.press('ArrowDown');
    await expect(cell('か ka')).toBeFocused();
    await expect(cell('か ka')).toHaveAttribute('tabindex', '0');
    await expect(cell('あ a')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(cell('こ ko')).toBeFocused();

    await cell('や ya').focus();
    await page.keyboard.press('ArrowRight');
    await expect(cell('ゆ yu')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cell('る ru')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#kana-panel')).toContainText('Hiragana · R-row · 1 stroke');
  });

  test('/learn shows hiragana but points search engines to /learn/hiragana', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/learn\/hiragana$/,
    );
    await expect(page.locator('main')).not.toHaveAttribute('data-pagefind-body');
    await expect(page.getByRole('tabpanel', { name: 'Basic 46' }).getByRole('button')).toHaveCount(
      46,
    );

    const sitemap = await (await page.request.get('/sitemap-0.xml')).text();
    expect(sitemap).toContain('/learn/hiragana</loc>');
    expect(sitemap).not.toContain('/learn</loc>');
  });

  test('katakana has its own chart', async ({ page }) => {
    await page.goto('/learn/katakana');
    await expect(page.getByRole('heading', { name: 'What is katakana?' })).toBeVisible();
    await page.getByRole('button', { name: 'ツ tsu' }).click();
    await expect(page.locator('#kana-panel')).toContainText('Katakana · T-row · 3 strokes');
  });

  test('replay is hidden when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/learn/hiragana');
    await expect(page.getByRole('button', { name: 'Replay strokes' })).toBeHidden();
  });
});

test.describe('kana pages', () => {
  test('a kana page has its strokes, examples, structured data and neighbours', async ({
    page,
  }) => {
    await page.goto('/learn/kana/ふ');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ふ\s*fu/);
    await expect(page).toHaveTitle('ふ (fu) — hiragana stroke order · Nihongo No Torii');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/learn\/kana\/%E3%81%B5$/,
    );
    await expect(page.getByRole('img', { name: 'Stroke order of ふ' })).toBeVisible();
    await expect(page.getByText('ふね')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mnemonic' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Other kana' });
    await expect(nav.getByRole('link', { name: /Previous/ })).toHaveAttribute(
      'href',
      '/learn/kana/ひ',
    );
    await expect(nav.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/learn/kana/へ');

    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    );
    const term = jsonLd['@graph'].find(
      (node: { '@type': string }) => node['@type'] === 'DefinedTerm',
    );
    expect(term).toMatchObject({ name: 'ふ', alternateName: 'fu', inLanguage: 'ja' });
    await expectNoAxeViolations(page);
  });

  test('a rare kana says it has no examples', async ({ page }) => {
    await page.goto('/learn/kana/ヅ');
    await expect(page.getByText('No common word uses this kana')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mnemonic' })).toHaveCount(0);
  });
});

test.describe('guides', () => {
  test('every "In this guide" link lands on a heading of the guide', async ({ page }) => {
    await page.goto('/learn/hiragana');
    const links = page.getByRole('navigation', { name: 'In this guide' }).getByRole('link');
    const hrefs = await links.evaluateAll((items) =>
      items.map((item) => (item as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    expect(hrefs).toHaveLength(4);

    await page.goto('/learn/guide/what-is-hiragana');
    await expect(page.getByRole('heading', { level: 1, name: 'What is hiragana?' })).toBeVisible();
    for (const href of hrefs) {
      const id = decodeURIComponent(href.split('#')[1] ?? '');
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
    await expect(page.getByRole('link', { name: 'Open the hiragana chart' })).toHaveAttribute(
      'href',
      '/learn/hiragana',
    );
    await expectNoAxeViolations(page);
  });
});

test.describe('search', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('kana pages appear in their own group', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await dialog.getByRole('combobox').fill('fune');
    const kana = dialog.getByRole('group', { name: 'Kana' });
    await expect(kana.getByRole('option', { name: /ふ \(fu\)/ })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/learn\/kana\/(%E3%81%B5|ふ)$/);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('the chart fits without horizontal scroll and has no axe violations', async ({ page }) => {
    await page.goto('/learn/katakana');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const cell = await page.getByRole('button', { name: 'ア a' }).boundingBox();
    expect(cell?.width).toBeGreaterThanOrEqual(44);
    expect(cell?.height).toBeGreaterThanOrEqual(44);
    await expectNoAxeViolations(page);
  });
});
