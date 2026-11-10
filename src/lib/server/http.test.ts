import { z } from 'astro/zod';
import { describe, expect, it, vi } from 'vitest';

import { assertSameOrigin, handle, hashIp, HttpError, json, readJson } from './http';

const site = new URL('https://toriiway.xyz');
const schema = z.strictObject({ level: z.enum(['N5']) });

function post(body: string, headers: Record<string, string> = {}) {
  return new Request('https://toriiway.xyz/api/x', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('readJson', () => {
  it('parses a valid body', async () => {
    await expect(readJson(post('{"level":"N5"}'), schema)).resolves.toEqual({ level: 'N5' });
  });

  it.each([
    ['unknown fields', post('{"level":"N5","x":1}'), 400],
    ['invalid JSON', post('{level'), 400],
    ['wrong content type', post('{"level":"N5"}', { 'content-type': 'text/plain' }), 415],
    ['a large body', post(JSON.stringify({ level: 'x'.repeat(40_000) })), 413],
    ['a large declared size', post('{"level":"N5"}', { 'content-length': '10000000' }), 413],
  ])('rejects %s', async (_, request, status) => {
    await expect(readJson(request, schema)).rejects.toMatchObject({ status });
  });
});

describe('assertSameOrigin', () => {
  it('accepts no origin or our origin and rejects others', () => {
    expect(() => assertSameOrigin(post('{}'), site)).not.toThrow();
    expect(() =>
      assertSameOrigin(post('{}', { origin: 'https://toriiway.xyz' }), site),
    ).not.toThrow();
    expect(() => assertSameOrigin(post('{}', { origin: 'https://evil.example' }), site)).toThrow(
      HttpError,
    );
  });
});

describe('handle', () => {
  it('turns errors into generic JSON responses', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const known = await handle(async () => {
      throw new HttpError('conflict', 409, 'detail');
    });
    expect(known.status).toBe(409);
    await expect(known.json()).resolves.toEqual({ error: 'conflict' });
    const unknown = await handle(async () => {
      throw new Error('database password in message');
    });
    expect(unknown.status).toBe(500);
    await expect(unknown.text()).resolves.toBe('{"error":"server-error"}');
    quiet.mockRestore();
    warn.mockRestore();
  });

  it('sends no-store JSON', () => {
    const response = json({ ok: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('hashIp', () => {
  it('is stable for a salt and differs between salts', async () => {
    const a = await hashIp('203.0.113.7', 'salt-a');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await hashIp('203.0.113.7', 'salt-a')).toBe(a);
    expect(await hashIp('203.0.113.7', 'salt-b')).not.toBe(a);
  });
});
