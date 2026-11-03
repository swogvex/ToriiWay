import { describe, expect, it } from 'vitest';

import { hashPassword, sameText, verifyPassword } from './password';
import { secretFor, siteKeyFor, TEST_SECRET, TEST_SITE_KEY, verifyTurnstile } from './turnstile';

describe('password hashes', () => {
  it('verifies the right password only', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
    expect(await hashPassword('correct horse')).not.toBe(stored);
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$c2FsdA==$aGFzaA==')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$16384$8$1$c2FsdA==$c2hvcnQ=')).toBe(false);
  });

  it('compares names in constant time', () => {
    expect(sameText('admin', 'admin')).toBe(true);
    expect(sameText('admin', 'admi')).toBe(false);
  });
});

describe('turnstile', () => {
  it('uses test keys outside production', () => {
    expect(siteKeyFor('preview')).toBe(TEST_SITE_KEY);
    expect(siteKeyFor('production')).not.toBe(TEST_SITE_KEY);
    expect(secretFor(undefined, 'real')).toBe(TEST_SECRET);
    expect(secretFor('production', 'real')).toBe('real');
  });

  it('accepts only a successful verification', async () => {
    const reply = (body: unknown, ok = true) =>
      (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as typeof fetch;
    expect(await verifyTurnstile('token', 'secret', '1.2.3.4', reply({ success: true }))).toBe(
      true,
    );
    expect(await verifyTurnstile('token', 'secret', null, reply({ success: false }))).toBe(false);
    expect(await verifyTurnstile('token', 'secret', null, reply({}, false))).toBe(false);
    expect(await verifyTurnstile('', 'secret', null, reply({ success: true }))).toBe(false);
    expect(
      await verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', TEST_SECRET, null, reply({}, false)),
    ).toBe(true);
    const broken = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await verifyTurnstile('token', 'secret', null, broken)).toBe(false);
  });
});
