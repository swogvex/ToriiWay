// HTTP Basic auth for /admin (13-security: admin page). No cookies; credentials are
// checked on every request, and 5 failures block the IP for 15 minutes.

import type { RunStore } from '../jlpt/store';
import { sameText, verifyPassword } from './password';

const WINDOW = 15 * 60 * 1000;
export const ADMIN_MAX_FAILURES = 5;

export const ADMIN_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export type AdminCheck = 'ok' | 'unauthorized' | 'blocked' | 'unconfigured';

export interface AdminCredentials {
  user: string | undefined;
  passwordHash: string | undefined;
}

function parseBasic(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(header.slice(6).trim()), (char) => char.charCodeAt(0)),
    );
    const split = decoded.indexOf(':');
    if (split < 0) return null;
    return { user: decoded.slice(0, split), password: decoded.slice(split + 1) };
  } catch {
    return null;
  }
}

export async function checkAdmin(
  request: Request,
  credentials: AdminCredentials,
  store: RunStore,
  clientKey: string,
  now: number,
): Promise<AdminCheck> {
  if (!credentials.user || !credentials.passwordHash) return 'unconfigured';
  const failures = `admin-fail:${clientKey}`;
  if ((await store.peekLimit(failures, WINDOW, now)) >= ADMIN_MAX_FAILURES) return 'blocked';
  const given = parseBasic(request.headers.get('authorization'));
  if (!given) return 'unauthorized';
  const userOk = sameText(given.user, credentials.user);
  const passwordOk = await verifyPassword(given.password, credentials.passwordHash);
  if (userOk && passwordOk) return 'ok';
  await store.rateLimit(failures, ADMIN_MAX_FAILURES, WINDOW, now);
  return 'unauthorized';
}

export function adminDenied(check: Exclude<AdminCheck, 'ok'>): Response {
  if (check === 'unauthorized') {
    return new Response('Authentication required.', {
      status: 401,
      headers: {
        ...ADMIN_HEADERS,
        'WWW-Authenticate': 'Basic realm="Nihongo No Torii admin", charset="UTF-8"',
      },
    });
  }
  if (check === 'blocked') {
    return new Response('Too many failed attempts. Try again in 15 minutes.', {
      status: 429,
      headers: { ...ADMIN_HEADERS, 'Retry-After': '900' },
    });
  }
  return new Response('Admin access is not configured.', { status: 503, headers: ADMIN_HEADERS });
}
