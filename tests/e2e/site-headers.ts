import { readFileSync } from 'node:fs';

import type { BrowserContext, Page } from '@playwright/test';

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

/** The headers vercel.json sends on every route, keyed by lower-case name. */
export function siteHeaders(): Record<string, string> {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
  return Object.fromEntries(
    vercel.headers
      .filter((rule) => rule.source === '/(.*)')
      .flatMap((rule) => rule.headers)
      .map((header) => [header.key.toLowerCase(), header.value]),
  );
}

/**
 * `astro preview` sends none of the vercel.json headers, so add them to every same-origin
 * response, the CSP included. `upgrade-insecure-requests` is dropped here only: the preview
 * runs on plain http://localhost and Chromium would upgrade its own subresources to https.
 */
export async function serveWithSiteHeaders(context: BrowserContext): Promise<void> {
  const headers = siteHeaders();
  const csp = (headers['content-security-policy'] ?? '')
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && directive !== 'upgrade-insecure-requests')
    .join('; ');
  await context.route(/^http:\/\/localhost:\d+\//, async (route) => {
    // A busy preview server can reset a proxied request once; try it a second time.
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), ...headers, 'content-security-policy': csp },
        });
        return;
      } catch (error) {
        // A request still in flight when the test ends (prefetch, analytics): nothing to serve.
        if (/Test ended|closed|disposed/i.test(String(error))) return;
        if (attempt >= 2 || !/ECONNRESET|socket hang up/i.test(String(error))) throw error;
      }
    }
  });
}

/** Collects CSP violations from the page and every page it navigates to. */
export async function recordCspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const store = window as unknown as { cspViolations?: string[] };
      store.cspViolations ??= [];
      store.cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { cspViolations?: string[] }).cspViolations ?? []);
}
