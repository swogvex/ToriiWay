import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const K_ROW: Record<string, string> = { か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko' };

/** Replaces speechSynthesis with a fake that has the given voices and records what it says. */
async function fakeSpeech(page: Page, voices: { lang: string; name: string }[]): Promise<void> {
  await page.addInitScript((list) => {
    const spoken: string[] = [];
    Object.assign(window, { spoken });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => list,
        speak: (utterance: { text: string }) => spoken.push(utterance.text),
        cancel: () => undefined,
        addEventListener: () => undefined,
      },
    });
    Object.assign(window, {
      SpeechSynthesisUtterance: class {
        constructor(public text: string) {}
      },
    });
  }, voices);
}

test.use({ viewport: { width: 1440, height: 1000 } });

test.describe('listen', () => {
  test('says the chosen kana with a Japanese voice', async ({ page }) => {
    await fakeSpeech(page, [
      { lang: 'en-US', name: 'Samantha' },
      { lang: 'ja-JP', name: 'Kyoko' },
    ]);
    await page.goto('/learn/hiragana');
    await page.getByRole('button', { name: 'か ka' }).click();
    const listen = page.locator('#kana-panel').getByRole('button', { name: 'Listen' });
    await expect(listen).toBeVisible();
    await listen.click();
    await expect
      .poll(() => page.evaluate(() => (window as { spoken?: string[] }).spoken))
      .toEqual(['か']);
  });

  test('hides Listen and explains why, once, without a Japanese voice', async ({ page }) => {
    await fakeSpeech(page, [{ lang: 'en-US', name: 'Samantha' }]);
    await page.goto('/learn/hiragana');
    await expect(page.getByText('Your browser has no Japanese voice')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listen' })).toBeHidden();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Replay strokes' })).toBeVisible();
    await expect(page.getByText('Your browser has no Japanese voice')).toBeHidden();
  });
});

test.describe('learned', () => {
  test('marking a kana shows a check, updates the count and persists', async ({ page }) => {
    await page.goto('/learn/hiragana');
    await expect(page.getByText('0 of 104 learned')).toBeVisible();
    await page.getByRole('button', { name: 'か ka' }).click();

    const toggle = page.locator('#kana-panel').getByRole('button', { name: 'Mark as learned' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'か ka (learned)' })).toHaveAttribute(
      'data-learned',
    );
    await expect(page.getByText('1 of 104 learned')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'か ka (learned)' })).toBeVisible();
    await page.goto('/learn/kana/か');
    await expect(page.getByRole('button', { name: 'Mark as learned' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Mark as learned' }).click();
    await page.goto('/learn/hiragana');
    await expect(page.getByText('0 of 104 learned')).toBeVisible();
  });
});

test.describe('practice', () => {
  async function openRow(page: Page, kana: string) {
    await page.goto('/learn/hiragana');
    await page.getByRole('button', { name: kana, exact: true }).click();
    await page.locator('#kana-panel').getByRole('button', { name: 'Test this row' }).click();
    const dialog = page.getByRole('dialog', { name: 'Practice' });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('runs a multiple-choice round on the chosen row, offline', async ({ page, context }) => {
    const dialog = await openRow(page, 'か ka');
    await expect(dialog.getByRole('checkbox', { name: /k か き く け こ/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { checked: true })).toHaveCount(1);

    // The data arrived with the page, so the round needs no network.
    await context.setOffline(true);
    await dialog.getByRole('button', { name: 'Start' }).click();

    for (let index = 1; index <= 10; index++) {
      await expect(dialog.getByText(`${index} of 10`)).toBeVisible();
      const kana = (await dialog.locator('[data-practice-kana]').textContent()) ?? '';
      const romaji = K_ROW[kana] ?? '';
      const choices = dialog.getByRole('group', { name: 'How do you read this kana?' });
      await expect(choices.getByRole('button')).toHaveCount(4);
      if (index === 1) {
        expect(
          (await new AxeBuilder({ page }).include('#kana-practice').withTags(AXE_TAGS).analyze())
            .violations,
        ).toEqual([]);
      }
      await choices.getByRole('button', { name: romaji, exact: true }).click();
      await expect(dialog.getByRole('status')).toHaveText(`Correct: ${kana} is ${romaji}.`);
      await dialog.getByRole('button', { name: index === 10 ? 'See results' : 'Next' }).click();
    }

    await expect(dialog.getByText('10 of 10 correct')).toBeVisible();
    await expect(dialog.getByText('No mistakes. Well done!')).toBeVisible();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('nnt:v1:kana') ?? '{}'),
    );
    expect(stored.results).toEqual([
      expect.objectContaining({
        script: 'hiragana',
        mode: 'choice',
        rows: ['gojuon:k'],
        correct: 10,
        total: 10,
      }),
    ]);
  });

  test('typing mode accepts other spellings and lists the misses', async ({ page }) => {
    const dialog = await openRow(page, 'し shi');
    await dialog.getByRole('radio', { name: 'Typing romaji' }).check();
    await dialog.getByRole('button', { name: 'Start' }).click();

    const input = dialog.getByRole('textbox', { name: 'Type the romaji' });
    await expect(input).toBeFocused();
    const first = (await dialog.locator('[data-practice-kana]').textContent()) ?? '';
    await input.fill('zz');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('status')).toHaveText(new RegExp(`^Not quite: ${first} is `));

    const spellings: Record<string, string> = { さ: 'sa', し: 'si', す: 'su', せ: 'se', そ: 'so' };
    for (let index = 2; index <= 10; index++) {
      await page.keyboard.press('Enter');
      await expect(dialog.getByText(`${index} of 10`)).toBeVisible();
      const kana = (await dialog.locator('[data-practice-kana]').textContent()) ?? '';
      await input.fill(spellings[kana] ?? '');
      await page.keyboard.press('Enter');
      await expect(dialog.getByRole('status')).toHaveText(/^Correct/);
    }
    await page.keyboard.press('Enter');

    await expect(dialog.getByText('9 of 10 correct')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'To review' })).toBeVisible();
    await expect(dialog.locator('[data-practice-misses] li')).toHaveCount(1);
    await expect(dialog.locator('[data-practice-misses]')).toContainText(first);
  });

  test('asks for at least one row', async ({ page }) => {
    const dialog = await openRow(page, 'か ka');
    await dialog.getByRole('checkbox', { name: /k か き く け こ/ }).uncheck();
    await dialog.getByRole('button', { name: 'Start' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Choose at least one row.');
  });
});
