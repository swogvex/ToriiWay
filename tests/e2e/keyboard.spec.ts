import { expect, test } from '@playwright/test';

import { SITE_ROUTES } from './routes';

// 15-quality "Keyboard": with Tab alone, every stop is a visible element with a visible
// focus indicator, and focus moves on instead of getting stuck. Both languages share the
// same templates, so the English routes are enough; the indicator is checked in both themes.

const MAX_STOPS = 80;

interface Stop {
  id: number;
  label: string;
  visible: boolean;
  indicator: boolean;
}

/**
 * Runs in the page. Describes the focused element and whether focusing it changes how it,
 * an ancestor (a field wrapper with :focus-within / :has) or the next sibling (a radio's
 * label) looks. The element is blurred and focused again with focusVisible to compare.
 */
function describeFocus(): Stop | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return null;
  const store = window as unknown as { kbIds?: WeakMap<Element, number>; kbNext?: number };
  store.kbIds ??= new WeakMap();
  store.kbNext ??= 0;
  let id = store.kbIds.get(el);
  if (id === undefined) {
    id = store.kbNext++;
    store.kbIds.set(el, id);
  }
  const name =
    el.getAttribute('aria-label') ??
    (el as HTMLInputElement).labels?.[0]?.textContent ??
    el.textContent ??
    '';
  const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name.trim().slice(0, 40)}"`;
  // Focus inside a third-party iframe (Turnstile) is the frame's own business.
  if (el.tagName === 'IFRAME') return { id, label, visible: true, indicator: true };

  const rect = el.getBoundingClientRect();
  const candidates: Element[] = [el];
  for (let node = el.parentElement, i = 0; node && i < 3; node = node.parentElement, i++) {
    candidates.push(node);
  }
  if (el.nextElementSibling) candidates.push(el.nextElementSibling);
  const look = () =>
    candidates.map((node) => {
      const style = getComputedStyle(node);
      return [
        style.outlineStyle,
        style.outlineWidth,
        style.outlineColor,
        style.boxShadow,
        style.borderColor,
        style.backgroundColor,
        style.textDecorationLine,
      ].join('|');
    });
  const focused = look();
  el.blur();
  const blurred = look();
  el.focus({ focusVisible: true } as FocusOptions);
  const indicator = focused.some((value, index) => value !== blurred[index]);
  return { id, label, visible: rect.width > 0 && rect.height > 0, indicator };
}

test.describe('keyboard', () => {
  for (const route of SITE_ROUTES.filter((path) => !path.startsWith('/es'))) {
    test(`${route}: every Tab stop is visible and shows focus`, async ({ page }) => {
      await page.route('**/api/community', (r) =>
        r.fulfill({ contentType: 'application/json', body: '{"discord":null,"videos":[]}' }),
      );
      await page.goto(route);
      await page.waitForLoadState('load');
      // The game focuses its own input on load, so its first Tab starts past the skip link.
      const startsAtTop = await page.evaluate(() => document.activeElement === document.body);

      const seen: Stop[] = [];
      for (let i = 0; i < MAX_STOPS; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(describeFocus);
        if (!stop) break; // Focus left the page: the whole cycle was walked.
        expect(stop.visible, `${stop.label} is visible when focused`).toBe(true);
        expect(stop.indicator, `${stop.label} shows that it has focus`).toBe(true);
        const previous = seen.at(-1);
        expect(stop.id, `focus moved on from ${previous?.label ?? ''}`).not.toBe(previous?.id);
        seen.push(stop);
        if (seen.length > 1 && stop.id === seen[0]?.id) break; // Back at the start.
      }
      expect(seen.length, 'the page has controls').toBeGreaterThan(0);
      if (startsAtTop) expect(seen[0]?.label, 'the skip link comes first').toMatch(/^a /);
    });
  }
});
