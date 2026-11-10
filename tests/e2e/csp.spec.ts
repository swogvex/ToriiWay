import { expect, test } from '@playwright/test';

import { SITE_ROUTES } from './routes';
import { recordCspViolations, serveWithSiteHeaders } from './site-headers';

// Every template under the vercel.json headers, CSP enforced: no violation, no CSP error.
// Theme makes no difference to the policy, so one project is enough.
test.describe('site CSP', () => {
  test.skip(({ colorScheme }) => colorScheme === 'dark', 'the CSP does not depend on the theme');

  for (const route of SITE_ROUTES) {
    test(`${route} loads with 0 violations`, async ({ context, page }) => {
      await serveWithSiteHeaders(context);
      // Home and Community refresh their community row; answer at once (the later route wins).
      await context.route('**/api/community', (r) =>
        r.fulfill({ contentType: 'application/json', body: '{"discord":null,"videos":[]}' }),
      );
      const violations = await recordCspViolations(page);
      const errors: string[] = [];
      page.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) errors.push(message.text());
      });
      await page.goto(route);
      await page.waitForLoadState('load');
      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
