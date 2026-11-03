// Cloudflare Turnstile (13-security: bot protection on reports and emails).

/** The production widget only accepts toriiway.xyz; the site key is public by design. */
export const PRODUCTION_SITE_KEY = '0x4AAAAAAFx6dELet7JOsq2i';

/**
 * Cloudflare's official test keys (always pass). Previews and local builds use them
 * because their hostnames are not on the production widget.
 */
export const TEST_SITE_KEY = '1x00000000000000000000AA';
export const TEST_SECRET = '1x0000000000000000000000000000000AA';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Site key for a build: production keys only on Vercel production. */
export function siteKeyFor(vercelEnv: string | undefined): string {
  return vercelEnv === 'production' ? PRODUCTION_SITE_KEY : TEST_SITE_KEY;
}

/** Secret for a runtime: the real one only on Vercel production. */
export function secretFor(vercelEnv: string | undefined, secret: string | undefined): string {
  return vercelEnv === 'production' ? (secret ?? '') : TEST_SECRET;
}

/** Asks Cloudflare whether a widget token is valid. Never throws: failures are false. */
export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string | null,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!token || !secret) return false;
  // Cloudflare's test secret passes every token: no need to call out (dev, e2e, previews).
  if (secret === TEST_SECRET) return true;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const response = await fetcher(VERIFY_URL, { method: 'POST', body });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
