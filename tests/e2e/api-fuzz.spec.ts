import { expect, test, type APIResponse } from '@playwright/test';

// 13-security "Other": every endpoint answered with invalid input. Whatever comes in, the
// API answers a 4xx with a generic JSON error: never a 5xx, a stack trace, or CORS for others.
// Runs against the preview server with the in-memory stores (no database).

const RUN = '00000000-0000-4000-8000-000000000000';
const SCORE = '00000000-0000-4000-8000-000000000001';

const BAD_IDS = [
  'not-a-uuid',
  '..%2F..%2Fetc%2Fpasswd',
  "1'%20OR%20'1'%3D'1",
  '%E2%80%AE%F0%9F%98%80',
  'a'.repeat(2000),
];

const POST_ROUTES = [
  '/api/game/runs',
  '/api/game/scores',
  `/api/game/scores/${SCORE}/report`,
  '/api/jlpt/runs',
  `/api/jlpt/runs/${RUN}/continue`,
  `/api/jlpt/runs/${RUN}/email`,
  `/api/jlpt/runs/${RUN}/feedback`,
  `/api/jlpt/runs/${RUN}/name`,
  `/api/jlpt/runs/${RUN}/submit`,
  '/api/reports',
  '/api/counters',
];

/** Bodies no route accepts, sent as JSON. */
const BAD_BODIES: { name: string; data: string; status?: number[] }[] = [
  { name: 'malformed JSON', data: '{"script": "hiragana",' },
  { name: 'null', data: 'null' },
  { name: 'an array', data: '[1,2,3]' },
  { name: 'a string', data: '"hello"' },
  { name: 'a number', data: '12345678901234567890' },
  { name: 'an empty object', data: '{}' },
  { name: 'prototype pollution', data: '{"__proto__":{"admin":true},"constructor":{"x":1}}' },
  { name: 'wrong types', data: '{"script":1,"level":[],"email":{},"name":null,"reason":true}' },
  { name: 'markup and SQL', data: '{"name":"<script>alert(1)</script>","email":"\' OR 1=1--"}' },
  { name: 'deep nesting', data: `${'['.repeat(5000)}${']'.repeat(5000)}` },
  { name: 'a 200 KB body', data: JSON.stringify({ message: 'x'.repeat(200 * 1024) }) },
];

const GET_ROUTES = [
  '/api/dictionary/search?q=',
  `/api/dictionary/search?q=${'あ'.repeat(500)}`,
  '/api/dictionary/search?q=a&q=b&limit=-1',
  '/api/dictionary/search?q=%00%FF',
  '/api/game/leaderboard?script=klingon',
  '/api/game/leaderboard?cursor=99999999',
  '/api/game/leaderboard?cursor=-1&sort=random',
  '/api/game/leaderboard?__proto__=x',
  '/api/game/leaderboard/rank',
  '/api/game/leaderboard/rank?script=hiragana&difficulty=normal&mode=challenge&cleared=maybe&wpm=1e309&accuracy=-5&duration=NaN',
  '/api/jlpt/recent?level=N9',
  '/api/jlpt/recent?limit=100000',
  ...BAD_IDS.flatMap((id) => [`/api/jlpt/runs/${id}`, `/api/jlpt/runs/${id}/paper`]),
  `/api/jlpt/runs/${RUN}`,
  `/api/jlpt/runs/${RUN}/paper`,
  ...BAD_IDS.map((id) => `/api/og/jlpt/${id}.png`),
];

/** The answer is a deliberate refusal: 4xx, generic JSON, nothing leaked. */
async function expectRefusal(response: APIResponse, allowed: number[] = []): Promise<void> {
  const status = response.status();
  const label = `${response.url()} → ${status}`;
  expect(status < 500 || allowed.includes(status), label).toBe(true);
  expect(status, label).toBeGreaterThanOrEqual(400);
  expect(response.headers()['access-control-allow-origin'], label).toBeUndefined();
  const text = await response.text();
  expect(text, label).not.toMatch(/\bat \S+ \(|node_modules|\.ts:\d+|Error:/);
  if (response.headers()['content-type']?.includes('json')) {
    expect(JSON.parse(text), label).toEqual(expect.objectContaining({ error: expect.any(String) }));
  }
}

test.describe('API with invalid input', () => {
  test.skip(({ colorScheme }) => colorScheme === 'dark', 'server behaviour, no theme');

  for (const route of POST_ROUTES) {
    test(`POST ${route} refuses every bad body`, async ({ request }) => {
      for (const body of BAD_BODIES) {
        const response = await request.post(route, {
          data: body.data,
          headers: { 'content-type': 'application/json' },
        });
        await test.step(body.name, () => expectRefusal(response));
      }
      // Not JSON at all, and JSON from another site.
      await expectRefusal(
        await request.post(route, { data: 'a=1', headers: { 'content-type': 'text/plain' } }),
      );
      await expectRefusal(
        await request.post(route, {
          data: '{}',
          headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        }),
      );
      // Wrong methods.
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'] as const) {
        const response = await request.fetch(route, { method });
        expect(response.status(), `${method} ${route}`).toBe(405);
      }
    });
  }

  test('POST routes with a bad id in the path answer 4xx', async ({ request }) => {
    for (const id of BAD_IDS) {
      for (const tail of ['continue', 'email', 'feedback', 'name', 'submit']) {
        await expectRefusal(
          await request.post(`/api/jlpt/runs/${id}/${tail}`, {
            data: '{}',
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      await expectRefusal(
        await request.post(`/api/game/scores/${id}/report`, {
          data: '{"reason":"name","turnstile":"x"}',
          headers: { 'content-type': 'application/json' },
        }),
      );
      await expectRefusal(
        await request.delete(`/api/game/scores/${id}`, {
          headers: { authorization: `Bearer ${'0'.repeat(64)}` },
        }),
      );
    }
  });

  test('DELETE a score refuses missing, malformed and wrong tokens', async ({ request }) => {
    for (const authorization of ['', 'Bearer', 'Bearer xyz', `Basic ${'a'.repeat(64)}`]) {
      await expectRefusal(
        await request.delete(`/api/game/scores/${SCORE}`, { headers: { authorization } }),
      );
    }
    await expectRefusal(
      await request.delete(`/api/game/scores/${SCORE}`, {
        headers: { authorization: `Bearer ${'f'.repeat(64)}` },
      }),
    );
  });

  test('GET routes refuse bad queries and ids', async ({ request }) => {
    for (const route of GET_ROUTES) {
      const response = await request.get(route);
      // A well-formed query may also succeed; only crashes and leaks fail here.
      if (response.status() < 400) continue;
      await expectRefusal(response);
    }
  });

  test('admin and cron refuse anyone without credentials', async ({ request }) => {
    // Missing or unparsable credentials do not count towards the admin lockout, so this
    // test cannot block the admin e2e tests that share the IP.
    for (const route of ['/admin', '/admin/leaderboard', '/admin/library']) {
      expect((await request.get(route)).status()).toBe(401);
      const garbled = await request.get(route, { headers: { authorization: 'Basic !!!' } });
      expect(garbled.status()).toBe(401);
    }
    for (const route of [
      `/api/admin/reports/${SCORE}`,
      `/api/admin/game-scores/${SCORE}`,
      '/api/admin/game-names/kenji',
    ]) {
      expect((await request.post(route, { form: { action: 'delete' } })).status()).toBe(401);
    }
    // The preview has no CRON_SECRET (503); production answers 401. Never 200.
    const cron = await request.get('/api/cron/cleanup', {
      headers: { authorization: 'Bearer guess' },
    });
    expect([401, 503]).toContain(cron.status());
  });
});
