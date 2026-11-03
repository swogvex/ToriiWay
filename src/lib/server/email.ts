// Results email (09-spec-jlpt: email). Built here as HTML and text, sent with Resend's
// REST API (no SDK needed). Every value from the run is escaped before it reaches HTML.

export const FROM = 'Nihongo No Torii <results@toriiway.xyz>';

export interface ResultEmail {
  to: string;
  name: string | null;
  level: string;
  passed: boolean;
  total: number;
  max: number;
  /** Result page URL, already absolute. */
  url: string;
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

const DISCLAIMER =
  'Unofficial practice simulation. Not affiliated with, endorsed by or a substitute for the Japanese-Language Proficiency Test administered by the Japan Foundation and JEES.';
const PRIVACY = 'We delete your email 30 days after sending.';

export function buildResultEmail(input: ResultEmail): EmailMessage {
  const link = new URL(input.url);
  link.searchParams.set('utm_source', 'email');
  link.searchParams.set('utm_medium', 'email');
  link.searchParams.set('utm_campaign', 'jlpt-result');
  const greeting = input.name ? `Hi ${input.name},` : 'Hi,';
  const verdict = input.passed ? '合格 Passed' : '不合格 Not yet';
  const subject = `Your JLPT ${input.level} simulation result: ${input.passed ? 'passed' : 'not yet'}`;
  const text = [
    greeting,
    '',
    `Here is your ${input.level} simulation result on Nihongo No Torii.`,
    `${verdict} · ${input.total} / ${input.max}`,
    '',
    `See your score report and review your mistakes: ${link.href}`,
    '',
    DISCLAIMER,
    PRIVACY,
  ].join('\n');
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f5f4f0;font-family:Arial,Helvetica,sans-serif;color:#141414">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:2px solid #141414;border-radius:16px">
    <tr><td style="padding:20px 28px;background:#141414;color:#f5f4f0;border-radius:13px 13px 0 0">
      <strong style="font-size:18px">日本語能力試験 模擬テスト</strong><br>
      <span style="font-size:13px">Nihongo No Torii · Unofficial simulation</span>
    </td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 12px;font-size:16px">${escape(greeting)}</p>
      <p style="margin:0 0 20px;font-size:16px">Here is your ${escape(input.level)} simulation result.</p>
      <p style="margin:0 0 24px;padding:16px 20px;border-radius:12px;font-size:22px;font-weight:bold;background:${input.passed ? '#d7eaf1' : '#f5f4f0'};color:${input.passed ? '#1f6f8b' : '#141414'}">
        ${escape(verdict)} &middot; ${input.total} / ${input.max}
      </p>
      <p style="margin:0 0 24px"><a href="${escape(link.href)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#c8402e;color:#ffffff;font-weight:bold;text-decoration:none">See my results</a></p>
      <p style="margin:0 0 24px;font-size:13px;color:#5e5e58">If the button does not work, copy this address: ${escape(link.href)}</p>
      <p style="margin:0 0 8px;font-size:12px;color:#5e5e58">${DISCLAIMER}</p>
      <p style="margin:0;font-size:12px;color:#5e5e58">${PRIVACY}</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { from: FROM, to: input.to, subject, html, text };
}

/** Sends one email through Resend; false on any failure. */
export async function sendWithResend(
  apiKey: string,
  message: EmailMessage,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) console.error(`[email] Resend answered ${response.status}`);
    return response.ok;
  } catch (error) {
    console.error('[email] Resend unreachable', error);
    return false;
  }
}
