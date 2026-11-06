import { expect, type Page, test } from '@playwright/test';

import { expectNoAxeViolations } from './axe';

// /community (artboard 10, 12-spec-community). The refresh from /api/community is mocked
// so the cards are the same on every run, whatever the channel posts.
const VIDEOS = Array.from({ length: 8 }, (_, index) => ({
  id: `video${String(index).padStart(6, '0')}`,
  title: `Lesson ${index + 1}`,
  published: `2026-04-${String(20 - index).padStart(2, '0')}T10:00:00+00:00`,
  category: index % 2 === 0 ? 'kana' : 'other',
  featured: false,
  short: index === 1,
}));

async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/community', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ discord: { members: 1234, online: 56 }, videos: VIDEOS }),
    }),
  );
  // The player must never reach YouTube in tests.
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }),
  );
}

const cards = (page: Page) => page.locator('[data-video]:not([hidden])');

test.describe('community', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('loads without any third-party request and passes axe', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(page.url() || 'http://x').origin) {
        external.push(request.url());
      }
    });
    await mockApi(page);
    await page.goto('/community');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Study together');
    await expect(page.getByText('1,234 members')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(external.filter((url) => !url.startsWith('http://localhost'))).toEqual([]);
    await expectNoAxeViolations(page);
  });

  test('links to the Discord server and opens the rules', async ({ page }) => {
    await mockApi(page);
    await page.goto('/community');
    await expect(page.getByRole('link', { name: /Join the server/ })).toHaveAttribute(
      'href',
      /^https:\/\/discord\.gg\//,
    );
    await page.getByRole('link', { name: 'Server rules' }).click();
    await expect(page.locator('#server-rules')).toHaveAttribute('open', '');
    await expect(page.locator('#server-rules li').first()).toBeVisible();
  });

  test('filters by category, keeps it in the URL and shows more', async ({ page }) => {
    await mockApi(page);
    await page.goto('/community');
    await expect(page.locator('[data-video-id="video000007"]')).toHaveCount(1);
    await expect(cards(page)).toHaveCount(6);
    await page.getByRole('button', { name: 'Show more videos' }).click();
    await expect(cards(page)).toHaveCount(8);

    const kana = page.getByRole('radio', { name: 'Kana' });
    test.skip((await kana.count()) === 0, 'the build had videos of one category only');
    await kana.check({ force: true });
    await expect(page).toHaveURL(/\?category=kana$/);
    await expect(cards(page)).toHaveCount(4);
    for (const card of await cards(page).all()) {
      await expect(card).toHaveAttribute('data-category', 'kana');
    }
  });

  test('plays a video in the nocookie player only after a click', async ({ page }) => {
    await mockApi(page);
    await page.goto('/community');
    await expect(page.locator('iframe')).toHaveCount(0);
    const link = page.locator('[data-video-id="video000000"] [data-video-open]');
    await link.click();
    const dialog = page.getByRole('dialog', { name: 'Lesson 1' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/video000000?autoplay=1&rel=0',
    );
    await expect(dialog.locator('iframe')).toHaveAttribute('title', 'Lesson 1');
    await expectNoAxeViolations(page);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(link).toBeFocused();
  });

  test('without JavaScript the videos are links to YouTube', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/community');
    const first = page.locator('[data-video-open]').first();
    test.skip((await first.count()) === 0, 'the build could not read the feed');
    await expect(first).toHaveAttribute(
      'href',
      /^https:\/\/www\.youtube\.com\/(watch\?v=|shorts\/)/,
    );
    await context.close();
  });
});

test.describe('community on phones', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('fits the width and passes axe', async ({ page }) => {
    await mockApi(page);
    await page.goto('/community');
    await expect(cards(page)).toHaveCount(6);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expectNoAxeViolations(page);
  });
});

test.describe('Home community row', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('shows the latest video and the member count, with no third-party request', async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost')) external.push(request.url());
    });
    await mockApi(page);
    await page.goto('/');
    const card = page.locator('[data-home-video]');
    test.skip((await card.count()) === 0, 'the build could not read the feed');
    // Lesson 1 is the newest regular video of the mock (Lesson 2 is a Short).
    await expect(card).toHaveAttribute('data-video-id', 'video000000');
    await expect(card.locator('[data-video-title]')).toHaveText('Lesson 1');
    await expect(page.locator('[data-home-members]')).toHaveText('· 1,234 members');
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);

    await card.click();
    const dialog = page.getByRole('dialog', { name: 'Lesson 1' });
    await expect(dialog.locator('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/video000000?autoplay=1&rel=0',
    );
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(card).toBeFocused();
  });
});
