// "Email my results" (09-spec-jlpt: email) and the daily cleanup (Vercel Cron).

import { z } from 'astro/zod';

import { LOCALES, localizePath } from '../../i18n';
import { buildResultEmail } from './email';
import { assertSameOrigin, HttpError, json, readJson } from './http';
import type { JlptDeps } from './jlpt-api';
import { sameText } from './password';

const DAY = 24 * 60 * 60 * 1000;
/** Emails per run, and per IP per day (13-security). */
export const EMAILS_PER_RUN = 3;
export const EMAILS_PER_IP_DAY = 10;
/** Emails are deleted this long after sending (privacy note in every email). */
export const EMAIL_RETENTION_DAYS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emailBody = z.strictObject({
  email: z.email().max(254),
  token: z.string().min(1).max(2048),
  /** Language of the result page that sent it; the email and its link follow it. */
  locale: z.enum(LOCALES).default('en'),
});

export async function emailHandler(
  request: Request,
  id: string,
  deps: JlptDeps,
): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, emailBody);
  if (!UUID.test(id)) throw new HttpError('not-found', 404);
  const run = await deps.store.getRun(id);
  if (!run) throw new HttpError('not-found', 404);
  const now = deps.now();
  if (now >= run.expiresAt) throw new HttpError('gone', 410);
  if (run.status !== 'finished' || !run.scores) throw new HttpError('conflict', 409, 'open run');
  const perRun = await deps.store.rateLimit(`email-run:${id}`, EMAILS_PER_RUN, 180 * DAY, now);
  const key = await deps.clientKey();
  const perIp = await deps.store.rateLimit(`email-ip:${key}`, EMAILS_PER_IP_DAY, DAY, now);
  if (!perRun || !perIp) throw new HttpError('too-many-requests', 429);
  if (!(await deps.verifyHuman(body.token))) throw new HttpError('forbidden', 403, 'turnstile');
  const message = buildResultEmail({
    to: body.email,
    name: run.name,
    level: run.level === 'kana' ? 'Kana' : run.level,
    passed: run.scores.passed,
    total: run.scores.total,
    max: run.scores.max,
    url: new URL(localizePath(`/jlpt/r/${run.id}`, body.locale), deps.site).href,
    locale: body.locale,
  });
  if (!(await deps.sendEmail(message))) throw new HttpError('unavailable', 503, 'email not sent');
  await deps.store.setEmail(run.id, body.email, now);
  return json({ ok: true }, 202);
}

/** Daily cleanup (plus `more`: old Kana Rush runs). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export async function cleanupHandler(
  request: Request,
  deps: JlptDeps,
  secret: string | undefined,
  more: () => Promise<Record<string, number>> = async () => ({}),
): Promise<Response> {
  if (!secret) throw new HttpError('unavailable', 503, 'CRON_SECRET is not set');
  const given = request.headers.get('authorization') ?? '';
  if (!sameText(given, `Bearer ${secret}`)) throw new HttpError('forbidden', 401);
  const now = deps.now();
  const result = {
    ...(await deps.store.cleanup(now, now - EMAIL_RETENTION_DAYS * DAY, now - DAY)),
    ...(await more()),
  };
  console.info('[cron] cleanup', result);
  return json(result);
}
