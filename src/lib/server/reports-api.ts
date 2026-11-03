// "Report a problem" on a question (09-spec-jlpt): Turnstile + rate limit, reviewed on /admin.

import { z } from 'astro/zod';

import { assertSameOrigin, HttpError, json, readJson } from './http';
import type { JlptDeps } from './jlpt-api';

const HOUR = 60 * 60 * 1000;
/** Reports per IP per hour (13-security). */
export const REPORTS_PER_HOUR = 5;

const reportBody = z.strictObject({
  questionId: z.string().regex(/^(kana|n[1-5])-[a-z]+-\d+-\d{4}$/),
  runId: z.uuid().nullable(),
  category: z.enum(['typo', 'answer', 'audio', 'other']),
  message: z.string().max(1000),
  token: z.string().min(1).max(2048),
});

export async function reportHandler(request: Request, deps: JlptDeps): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, reportBody);
  const known = deps.bank.some((file) =>
    file.questions.some((question) => question.id === body.questionId),
  );
  if (!known) throw new HttpError('bad-request', 400, 'unknown question');
  const now = deps.now();
  const key = await deps.clientKey();
  if (!(await deps.store.rateLimit(`reports:${key}`, REPORTS_PER_HOUR, HOUR, now))) {
    throw new HttpError('too-many-requests', 429);
  }
  if (!(await deps.verifyHuman(body.token))) throw new HttpError('forbidden', 403, 'turnstile');
  await deps.store.createReport({
    id: deps.newId(),
    questionId: body.questionId,
    runId: body.runId,
    category: body.category,
    message: body.message.trim(),
    createdAt: now,
    status: 'open',
  });
  return json({ ok: true }, 201);
}
