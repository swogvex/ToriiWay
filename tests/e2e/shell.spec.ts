import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('desktop shell', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('skip link is the first stop and moves focus to main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('rail marks Home and expands with labels that persist', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByRole('navigation', { name: 'Main' });
    await expect(rail.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

    const toggle = rail.getByRole('button', { name: 'Show labels' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(rail.getByText('Kana Rush', { exact: true }).first()).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-rail', 'expanded');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('the expanded rail fits the gutter without moving the column', async ({ page }) => {
    await page.goto('/');
    const column = page.locator('main .column').first();
    const left = () => column.evaluate((el) => el.getBoundingClientRect().left);
    const before = await left();
    await page.getByRole('button', { name: 'Show labels' }).click();
    expect(await left()).toBe(before);
    const railRight = await page
      .getByRole('navigation', { name: 'Main' })
      .evaluate((el) => el.getBoundingClientRect().right);
    expect(before).toBeGreaterThanOrEqual(railRight);
  });

  test('rail tooltip shows on focus', async ({ page }) => {
    await page.goto('/');
    const learn = page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Learn' });
    await learn.focus();
    await expect(learn.locator('.rail__tip')).toHaveCSS('opacity', '1');
  });

  test('theme toggles by button and T, and is stored', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const toggle = page.locator('header').getByRole('button', { name: 'Dark theme' });
    const startDark = (await toggle.getAttribute('aria-pressed')) === 'true';

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', startDark ? 'light' : 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', String(!startDark));

    await page.locator('body').press('t');
    await expect(html).toHaveAttribute('data-theme', startDark ? 'dark' : 'light');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', startDark ? 'dark' : 'light');
  });

  test('search opens with Ctrl K, filters in any script and opens with Enter', async ({ page }) => {
    // Sections only: page results from Pagefind are covered in search.spec.ts.
    await page.route('**/pagefind/pagefind.js', (route) => route.abort());
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('combobox', { name: 'Search the site' });
    await expect(input).toBeFocused();

    await input.fill('まなぶ');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('option', { name: /Learn/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(dialog.getByRole('status')).toHaveText('1 result');

    await input.fill('zzz');
    await expect(dialog.getByRole('option')).toHaveCount(0);
    await expect(dialog.getByText('No results for “zzz”.')).toBeVisible();

    await input.fill('biblioteca');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/library$/);
  });

  test('search closes with Escape and returns focus to its button', async ({ page }) => {
    await page.goto('/');
    const opener = page.locator('header').getByRole('button', { name: /Search kana/ });
    await opener.click();
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('? opens the shortcuts dialog and L explains Spanish is coming', async ({ page }) => {
    await page.goto('/');
    await page.locator('body').press('Shift+?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('body').press('l');
    await expect(page.locator('[data-toast-region]')).toHaveText(
      'The Spanish version is coming soon.',
    );
  });

  test('single-key shortcuts do not fire while typing', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const before = await page.locator('html').getAttribute('data-theme');
    await page.getByRole('combobox').pressSequentially('tl');
    await expect(page.getByRole('combobox')).toHaveValue('tl');
    expect(await page.locator('html').getAttribute('data-theme')).toBe(before);
  });

  test('home and dialogs have no axe violations', async ({ page }) => {
    await page.goto('/');
    await expectNoAxeViolations(page);
    await page.keyboard.press('Control+k');
    await expectNoAxeViolations(page);
  });

  test('secondary fonts load after the page, off the critical path', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.fonts]
            .filter((face) => face.status === 'loaded')
            .map((face) => `${face.family.replaceAll('"', '')} ${face.weight}`),
        ),
      )
      .toEqual(
        expect.arrayContaining([
          'IBM Plex Mono 400',
          'Schibsted Grotesk 500',
          'Zen Kaku Gothic New Display 700',
        ]),
      );
  });

  test('home exposes structured data, canonical and hreflang', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    const jsonLd = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    );
    expect(jsonLd).toMatchObject({ '@type': 'WebSite', name: 'ToriiWay' });
  });

  test('external links open in a new tab and say so', async ({ page }) => {
    await page.goto('/');
    const external = page.locator('a[href^="http"]');
    expect(await external.count()).toBeGreaterThanOrEqual(6);
    for (const link of await external.all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener');
      await expect(link).toContainText('(opens in a new tab)');
    }
  });
});

test.describe('home hero typewriter', () => {
  for (const width of [1440, 1024, 390, 320]) {
    test(`types new phrases without moving the page at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      // Screen readers get the stable title; the typed copy is hidden from them.
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
        'Learn Japanese one keystroke at a time.',
      );
      const typed = page.locator('[data-typed]');
      const button = page.getByRole('link', { name: 'Start with hiragana' });
      const top = (await button.boundingBox())?.y;
      const first = await typed.textContent();
      await expect.poll(() => typed.textContent(), { timeout: 8_000 }).not.toBe(first);
      for (let i = 0; i < 10; i += 1) {
        expect((await button.boundingBox())?.y).toBe(top);
        await page.waitForTimeout(150);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }

  test('stays still with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const typed = page.locator('[data-typed]');
    await page.waitForTimeout(2500);
    await expect(typed).toHaveText('Japanese one keystroke at a time.');
  });
});

test.describe('mobile shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('menu button opens the full-screen menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('home follows artboard 03 and has no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Play Kana Rush' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Start with hiragana' })).toBeVisible();
    await expect(page.getByText('Desktop', { exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expectNoAxeViolations(page);
  });
});

/** Waits until a 404 glyph lies flat on the ground line. */
async function waitForRest(page: Page, glyph: Locator): Promise<void> {
  const field = page.locator('[data-lost-field]');
  await expect
    .poll(
      async () => {
        const [box, area] = await Promise.all([glyph.boundingBox(), field.boundingBox()]);
        const ground = (area?.y ?? 0) + (area?.height ?? 0) - 1;
        const gap = Math.abs(ground - ((box?.y ?? 0) + (box?.height ?? 0)));
        const tilt = Math.abs((box?.width ?? 0) - (box?.height ?? 0));
        return gap <= 2 && tilt <= 2;
      },
      { timeout: 8000 },
    )
    .toBe(true);
}

test.describe('404 playground', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('glyphs are buttons that move with the keyboard', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    const glyph = page.getByRole('button', { name: /^迷/ });
    await expect(glyph).toBeVisible();

    // The glyphs fall on their own, tumble and settle flat on the ground line...
    await waitForRest(page, glyph);

    // ...and Space throws one back up: track its highest point for a moment.
    const before = await glyph.boundingBox();
    await glyph.focus();
    const [highest] = await Promise.all([
      glyph.evaluate(
        (el) =>
          new Promise<number>((resolve) => {
            let min = Infinity;
            const start = performance.now();
            const sample = () => {
              min = Math.min(min, el.getBoundingClientRect().top);
              if (performance.now() - start < 800) requestAnimationFrame(sample);
              else resolve(min);
            };
            sample();
          }),
      ),
      page.keyboard.press('Space'),
    ]);
    expect(highest).toBeLessThan((before?.y ?? 0) - 50);
    await expect(page.locator('[data-lost-hint]')).toHaveAttribute('data-hidden', '');
  });

  test('a mouse press moves a glyph without drawing the focus ring', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    const glyph = page.getByRole('button', { name: /^子/ });
    await waitForRest(page, glyph);
    const box = await glyph.boundingBox();
    const x = (box?.x ?? 0) + (box?.width ?? 0) * 0.15;
    const y = (box?.y ?? 0) + (box?.height ?? 0) * 0.15;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 120, y - 160, { steps: 8 });
    await page.mouse.up();
    expect(await glyph.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
    await expect(page.locator('[data-lost-hint]')).toHaveAttribute('data-hidden', '');
    // Grabbed off-centre, the glyph turns as it is dragged.
    expect(await glyph.evaluate((el) => el.style.transform)).toMatch(/rotate\((?!0rad)/);
  });

  test('has no header or footer and fits one screen', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.locator('header, footer')).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(overflow).toBe(0);
  });

  test('reduced motion keeps the glyphs still', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/this-page-does-not-exist');
    const glyph = page.getByRole('button', { name: /^迷/ });
    const before = await glyph.boundingBox();
    await glyph.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect(await glyph.boundingBox()).toEqual(before);
    await expect(page.locator('[data-lost-hint]')).toBeHidden();
    await context.close();
  });

  test('links to every section', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    const links = page.getByRole('navigation', { name: 'Try one of these instead:' });
    await expect(links.getByRole('link')).toHaveCount(6);
  });
});
