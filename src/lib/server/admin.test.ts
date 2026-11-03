import { beforeAll, describe, expect, it } from 'vitest';

import { memoryStore } from '../jlpt/store';
import { ADMIN_MAX_FAILURES, adminDenied, checkAdmin } from './admin';
import { hashPassword } from './password';

let passwordHash = '';
beforeAll(async () => {
  passwordHash = await hashPassword('a-very-long-password');
});

const request = (user?: string, password?: string) =>
  new Request('https://toriiway.xyz/admin', {
    headers: user === undefined ? {} : { authorization: `Basic ${btoa(`${user}:${password}`)}` },
  });

describe('checkAdmin', () => {
  it('lets the right user in and asks everyone else to log in', async () => {
    const store = memoryStore();
    const creds = { user: 'owner', passwordHash };
    expect(await checkAdmin(request('owner', 'a-very-long-password'), creds, store, 'ip', 0)).toBe(
      'ok',
    );
    expect(await checkAdmin(request(), creds, store, 'ip', 0)).toBe('unauthorized');
    expect(await checkAdmin(request('owner', 'nope'), creds, store, 'ip', 0)).toBe('unauthorized');
    expect(
      await checkAdmin(request('someone', 'a-very-long-password'), creds, store, 'ip', 0),
    ).toBe('unauthorized');
  });

  it('blocks an IP after five failures, even with the right password', async () => {
    const store = memoryStore();
    const creds = { user: 'owner', passwordHash };
    for (let index = 0; index < ADMIN_MAX_FAILURES; index += 1) {
      await checkAdmin(request('owner', 'nope'), creds, store, 'ip', 1000);
    }
    expect(
      await checkAdmin(request('owner', 'a-very-long-password'), creds, store, 'ip', 1000),
    ).toBe('blocked');
    expect(
      await checkAdmin(request('owner', 'a-very-long-password'), creds, store, 'other', 1000),
    ).toBe('ok');
    const later = 1000 + 16 * 60 * 1000;
    expect(
      await checkAdmin(request('owner', 'a-very-long-password'), creds, store, 'ip', later),
    ).toBe('ok');
  });

  it('is closed until both variables exist', async () => {
    const store = memoryStore();
    expect(
      await checkAdmin(
        request('owner', 'x'),
        { user: 'owner', passwordHash: undefined },
        store,
        'ip',
        0,
      ),
    ).toBe('unconfigured');
  });

  it('answers with the right status and headers', () => {
    const unauthorized = adminDenied('unauthorized');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('www-authenticate')).toContain('Basic');
    expect(unauthorized.headers.get('cache-control')).toBe('no-store');
    expect(adminDenied('blocked').status).toBe(429);
    expect(adminDenied('unconfigured').status).toBe(503);
  });
});
