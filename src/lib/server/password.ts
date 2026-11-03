// Admin password hashes (13-security: ADMIN_PASSWORD_HASH, never the plain password).
// Format: scrypt$N$r$p$<salt base64>$<hash base64>. Create one with `pnpm admin:hash`.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/** Constant-time check of a password against a stored hash; malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  try {
    const key = await derive(
      password,
      Buffer.from(salt, 'base64'),
      Number(n),
      Number(r),
      Number(p),
    );
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** Constant-time comparison of two strings (user names). */
export function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
