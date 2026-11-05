import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * Jumps every finite animation and transition to its end state. Dialogs fade in and out;
 * on a slow CI runner axe could measure one half transparent and report its text at ~1:1
 * contrast (seen on the JLPT finalize dialog). Finishing them, rather than waiting, also
 * works under page.clock, where time does not move on its own. Infinite animations (Home
 * clouds) cannot finish and are left alone.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
    }
  });
}

/** axe with the project's WCAG 2.2 AA tags, after animations have settled. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
