import { describe, expect, it, vi } from 'vitest';

import { buildResultEmail, FROM, sendWithResend } from './email';

const input = {
  to: 'ana@example.com',
  name: '<Ana>',
  level: 'N5',
  passed: true,
  total: 122,
  max: 180,
  url: 'https://toriiway.xyz/jlpt/r/6f1c2f9e-3b5a-4d8e-9c1a-2b3c4d5e6f70',
};

describe('buildResultEmail', () => {
  it('builds text and HTML with the result, the link and the privacy note', () => {
    const message = buildResultEmail(input);
    expect(message).toMatchObject({ from: FROM, to: 'ana@example.com' });
    expect(message.subject).toBe('Your JLPT N5 simulation result: passed');
    expect(message.text).toContain('合格 Passed · 122 / 180');
    expect(message.text).toContain('utm_source=email');
    expect(message.text).toContain('We delete your email 30 days after sending.');
    expect(message.html).toContain('See my results');
    expect(message.html).toContain('Not affiliated with');
  });

  it('escapes names in HTML', () => {
    const { html } = buildResultEmail(input);
    expect(html).toContain('Hi &lt;Ana&gt;,');
    expect(html).not.toContain('<Ana>');
  });
});

describe('sendWithResend', () => {
  it('posts to Resend with the key and reports failures as false', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: [string, RequestInit][] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendWithResend('re_key', buildResultEmail(input), ok)).toBe(true);
    expect(calls[0]?.[0]).toBe('https://api.resend.com/emails');
    expect((calls[0]?.[1].headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    const refused = (async () => new Response('{}', { status: 422 })) as unknown as typeof fetch;
    expect(await sendWithResend('re_key', buildResultEmail(input), refused)).toBe(false);
    quiet.mockRestore();
  });
});
