import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The preview server keeps runs in memory (JLPT_MEMORY_STORE in playwright.config.ts).
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test.use({ viewport: { width: 1440, height: 1000 } });

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** Starts a run of the level from the start page and waits for the first question. */
async function startRun(
  page: Page,
  level: 'N5' | 'N4' | 'N3' | 'N2' | 'N1',
  options: { public?: boolean } = {},
) {
  await page.goto('/jlpt');
  await page.getByRole('radio', { name: level }).check();
  if (options.public) await page.getByLabel(/Show my nickname and level/).check();
  await page.getByRole('button', { name: new RegExp(`Start ${level} simulation`) }).click();
  const tips = page.getByRole('dialog', { name: 'Before you start' });
  await expect(tips).toBeVisible();
  await tips.getByRole('button', { name: /Start now/ }).click();
  await expect(page).toHaveURL(/\/jlpt\/run$/);
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 10_000 });
}

/**
 * Answers every question of each section with "1", finalizes it, waits out the real break
 * and continues. In listening it first plays the clip from the stubbed Blob.
 */
async function answerEverySection(page: Page, sections: readonly (readonly [string, number])[]) {
  for (const [section, count] of sections) {
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 15_000 });
    if (section === 'Listening') {
      // Headless Chromium has no Japanese voice: only the file on Blob can play.
      await expect(page.getByText(/This browser has no Japanese voice/)).toBeHidden();
      await page.getByRole('button', { name: 'Play audio' }).click();
      await expect(page.getByText('Plays left: 0')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play audio' })).toBeDisabled();
    }
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
    if (section === 'Listening') return;
    await expect(
      page.getByRole('heading', { name: `${section} done. Take a breath.` }),
    ).toBeVisible();
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(next).toBeEnabled({ timeout: 70_000 });
    await next.click();
  }
}

/** Stand-in for Cloudflare's Turnstile script: renders nothing and hands back the test token. */
async function stubTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w1";},reset:()=>{}};',
    }),
  );
}

/** Serves 0.1 s of silence (WAV) for every listening clip on Vercel Blob. */
async function stubBlobAudio(page: Page) {
  const samples = 2205;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24);
  wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  await page.route('**/*.public.blob.vercel-storage.com/**', (route) =>
    route.fulfill({ body: wav, contentType: 'audio/wav' }),
  );
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

  test('levels with a full bank can start while N1 is being written', async ({ page }) => {
    await page.goto('/jlpt');
    for (const level of ['N4', 'N3', 'N2'] as const) {
      await page.getByRole('radio', { name: level }).check();
      await expect(page.getByRole('heading', { name: `${level} sections` })).toBeVisible();
      await expect(
        page.getByRole('button', { name: new RegExp(`Start ${level} simulation`) }),
      ).toBeEnabled();
    }
    for (const level of ['N1'] as const) {
      await page.getByRole('radio', { name: level }).check();
      await expect(page.getByRole('heading', { name: `${level} sections` })).toBeVisible();
      await expect(
        page.getByRole('button', { name: new RegExp(`Start ${level} simulation`) }),
      ).toBeDisabled();
      await expect(
        page.getByText(new RegExp(`${level} question bank is being written`)),
      ).toBeVisible();
    }
    await page.getByRole('radio', { name: 'Kana' }).check();
    await expect(page.getByRole('button', { name: /Start Kana simulation/ })).toBeEnabled();
    await expect(page.getByText(/Kana is a site-only level/)).toBeVisible();
  });

  test('Test audio plays the pre-generated clip even without a Japanese voice', async ({
    page,
  }) => {
    await stubBlobAudio(page);
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        return play.call(this).then(() => document.documentElement.setAttribute('data-played', ''));
      };
    });
    await page.goto('/jlpt');
    await page.getByRole('button', { name: 'Test audio' }).click();
    await expect(page.locator('html[data-played]')).toHaveCount(1);
    await expect(page.getByText(/This browser has no Japanese voice/)).toBeHidden();
  });

  test('without a Japanese voice, Test audio explains how to add one', async ({ page }) => {
    // Headless Chromium has no Japanese voice, and here the clip on Blob fails too.
    await page.route('**/*.public.blob.vercel-storage.com/**', (route) => route.abort());
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
    await startRun(page, 'N5');
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

  test('a full N2 run reaches the score', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'light', 'Real breaks: run once.');
    test.setTimeout(300_000);
    await stubBlobAudio(page);
    await startRun(page, 'N2');
    await answerEverySection(page, [
      ['Language knowledge · Reading', 75],
      ['Listening', 32],
    ]);
    await expect(page.getByText('N2 · Simulation complete')).toBeVisible();
    await expect(page.getByRole('cell', { name: / \/ 180$/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a full N3 run reaches the score', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'light', 'Real two-minute breaks: run once.');
    test.setTimeout(300_000);
    await stubBlobAudio(page);
    await startRun(page, 'N3');
    await answerEverySection(page, [
      ['Vocabulary', 35],
      ['Grammar · Reading', 39],
      ['Listening', 28],
    ]);
    await expect(page.getByText('N3 · Simulation complete')).toBeVisible();
    await expect(page.getByRole('cell', { name: / \/ 180$/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a full N4 run reaches the score', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'light', 'Real two-minute breaks: run once.');
    test.setTimeout(300_000);
    await stubBlobAudio(page);
    await startRun(page, 'N4');
    await answerEverySection(page, [
      ['Vocabulary', 28],
      ['Grammar · Reading', 29],
      ['Listening', 28],
    ]);
    await expect(page.getByText('N4 · Simulation complete')).toBeVisible();
    await expect(page.getByRole('cell', { name: / \/ 180$/ })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a full N5 run reaches the score', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'light', 'Real two-minute breaks: run once.');
    test.setTimeout(300_000);
    await stubTurnstile(page);
    await stubBlobAudio(page);
    await startRun(page, 'N5', { public: true });
    await answerEverySection(page, [
      ['Vocabulary', 21],
      ['Grammar · Reading', 22],
      ['Listening', 24],
    ]);
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

    const mail = page.locator('[data-email-form]');
    await mail.getByLabel('Your email').fill('ana@example.com');
    await mail.getByRole('button', { name: 'Email my results' }).click();
    await expect(mail.getByText(/Sent! Check your inbox/)).toBeVisible();

    await page.goto('/jlpt');
    const recent = page.getByRole('region', { name: 'Recent runs' });
    await expect(recent.getByRole('listitem').first()).toContainText(
      /\d\d\/\d\d · [A-Z][a-z]+[A-Z][a-z]+/,
    );
    await expect(recent.getByRole('listitem').first()).toContainText(/N5 (Pass|Not yet)/);
    await expectNoAxeViolations(page);
  });
});

test.describe('JLPT exam on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('keeps the top bar and the actions on one row each', async ({ page }) => {
    await startRun(page, 'N5');
    const middle = async (locator: ReturnType<Page['locator']>) => {
      const box = await locator.boundingBox();
      return (box?.y ?? 0) + (box?.height ?? 0) / 2;
    };
    const current = page.getByRole('list', { name: 'Sections' }).locator('li[aria-current="step"]');
    await expect(page.getByRole('list', { name: 'Sections' }).locator('li:visible')).toHaveCount(1);
    const top = await middle(current);
    expect(Math.abs((await middle(page.getByRole('timer'))) - top)).toBeLessThan(6);

    const actions = [
      page.getByRole('button', { name: 'Previous question' }),
      page.getByRole('button', { name: 'Flag for review' }),
      page.getByRole('button', { name: 'Finish' }),
      page.getByRole('button', { name: 'Next' }),
    ];
    const row = await middle(actions[0] as ReturnType<Page['locator']>);
    for (const action of actions) {
      await expect(action).toBeVisible();
      expect(Math.abs((await middle(action)) - row)).toBeLessThan(4);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await expectNoAxeViolations(page);
  });
});

test.describe('JLPT problem reports', () => {
  test('a report goes through Turnstile and appears on the admin page', async ({
    page,
    browser,
  }, testInfo) => {
    const note = `Choice 2 also fits (${testInfo.project.name}).`;
    // Stand-in for Cloudflare's script: renders nothing and hands back the test token.
    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w1";},reset:()=>{}};',
      }),
    );
    await startRun(page, 'N5');
    await page.getByRole('button', { name: 'Report a problem' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report a problem with this question' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: 'Wrong answer' }).check();
    await dialog.getByLabel('Details (optional)').fill(note);
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog.getByText("Thanks! We'll review it.")).toBeVisible();

    const anonymous = await page.request.get('/admin');
    expect(anonymous.status()).toBe(401);
    expect(anonymous.headers()['www-authenticate']).toContain('Basic');

    const admin = await browser.newContext({
      httpCredentials: { username: 'e2e-admin', password: 'e2e-admin-password' },
    });
    const adminPage = await admin.newPage();
    const response = await adminPage.goto('/admin');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    const item = adminPage.getByRole('listitem').filter({ hasText: note });
    await expect(item).toContainText('answer · ');
    await item.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(adminPage.getByRole('listitem').filter({ hasText: note })).toContainText(
      'Resolved',
    );
    await admin.close();
  });
});
