// JLPT run API. Route files in src/pages/api/jlpt only build `JlptDeps` and call these.

import { z } from 'astro/zod';

import { findMondai, JLPT_LEVELS, LEVELS } from '../jlpt/levels';
import { BankError, buildPaper, indexBank, type BankMondai } from '../jlpt/paper';
import { cleanName } from '../jlpt/report';
import {
  advance,
  continueRun,
  createRun,
  publicState,
  RunError,
  scoreAnswers,
  submitSection,
  type RunRecord,
} from '../jlpt/run';
import type { RunStore } from '../jlpt/store';
import { assertSameOrigin, HttpError, json, readJson } from './http';

export interface JlptDeps {
  store: RunStore;
  bank: readonly BankMondai[];
  site: URL;
  now: () => number;
  /** Route-independent key for the caller (hashed IP). */
  clientKey: () => Promise<string>;
  newId: () => string;
  newSeed: () => number;
}

const HOUR = 60 * 60 * 1000;
/** New runs per IP per hour (13-security). */
export const RUNS_PER_HOUR = 20;

const runId = z.uuid();

const createBody = z.strictObject({
  level: z.enum(JLPT_LEVELS),
  public: z.boolean(),
});

const submitBody = z.strictObject({
  section: z.number().int().min(0).max(9),
  answers: z
    .array(
      z.strictObject({
        id: z.string().max(40),
        choice: z.number().int().min(1).max(4).nullable(),
        at: z.number().int().nonnegative(),
      }),
    )
    .max(200),
});

const continueBody = z.strictObject({ section: z.number().int().min(0).max(9) });

const feedbackBody = z.strictObject({
  section: z.number().int().min(0).max(9),
  rating: z.enum(['easy', 'right', 'hard']),
});

const nameBody = z.strictObject({ name: z.string().max(200) });

const RUN_ERRORS: Record<string, number> = {
  'not-in-section': 409,
  'wrong-section': 409,
  'not-in-break': 409,
  'break-not-over': 409,
};

function paperFor(run: Pick<RunRecord, 'level' | 'seed'>, bank: readonly BankMondai[]) {
  try {
    return buildPaper(run.level, run.seed, bank);
  } catch (error) {
    if (error instanceof BankError) throw new HttpError('unavailable', 503, error.message);
    throw error;
  }
}

/** Loads a run, applies time-based transitions and saves them. */
async function loadRun(id: string, deps: JlptDeps): Promise<RunRecord> {
  if (!runId.safeParse(id).success) throw new HttpError('not-found', 404);
  const stored = await deps.store.getRun(id);
  if (!stored) throw new HttpError('not-found', 404);
  const now = deps.now();
  if (now >= stored.expiresAt) throw new HttpError('gone', 410);
  const run = advance(stored, now);
  if (run !== stored) {
    await deps.store.saveRun(run, { status: stored.status, section: stored.section });
  }
  return run;
}

async function save(next: RunRecord, previous: RunRecord, deps: JlptDeps) {
  const saved = await deps.store.saveRun(next, {
    status: previous.status,
    section: previous.section,
  });
  if (!saved) throw new HttpError('conflict', 409, 'run changed during the request');
}

function wrapRunError<T>(apply: () => T): T {
  try {
    return apply();
  } catch (error) {
    if (error instanceof RunError) {
      throw new HttpError('conflict', RUN_ERRORS[error.code] ?? 409, error.code);
    }
    throw error;
  }
}

export async function createRunHandler(request: Request, deps: JlptDeps): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, createBody);
  const now = deps.now();
  const allowed = await deps.store.rateLimit(
    `runs:${await deps.clientKey()}`,
    RUNS_PER_HOUR,
    HOUR,
    now,
  );
  if (!allowed) throw new HttpError('too-many-requests', 429);
  const run = createRun({
    id: deps.newId(),
    level: body.level,
    seed: deps.newSeed(),
    isPublic: body.public,
    now,
  });
  paperFor(run, deps.bank);
  await deps.store.createRun(run);
  return json(publicState(run, now), 201);
}

export async function getRunHandler(id: string, deps: JlptDeps): Promise<Response> {
  const run = await loadRun(id, deps);
  return json(publicState(run, deps.now()));
}

/** The questions of the current section, without answers or explanations. */
export async function paperHandler(id: string, deps: JlptDeps): Promise<Response> {
  const run = await loadRun(id, deps);
  if (run.status !== 'section') throw new HttpError('conflict', 409, 'not-in-section');
  const section = paperFor(run, deps.bank)[run.section];
  if (!section) throw new HttpError('server-error', 500, 'missing section');
  const index = indexBank(run.level, deps.bank);
  const mondai = section.mondai.map((entry) => {
    const config = findMondai(run.level, section.id, entry.number);
    const questions = entry.questionIds.flatMap((questionId) => {
      const found = index.get(questionId);
      if (!found) return [];
      const { id: qid, passage, stem, choices, audio, tts } = found.question;
      return [{ id: qid, passage: passage ?? null, stem, choices, audio, tts }];
    });
    const file = index.get(entry.questionIds[0] ?? '')?.mondai;
    const used = new Set(questions.map((question) => question.passage));
    return {
      number: entry.number,
      type: config?.type ?? '',
      spokenChoices: config?.spokenChoices ?? false,
      instruction: file?.instruction ?? null,
      passages: (file?.passages ?? []).filter((passage) => used.has(passage.id)),
      questions,
    };
  });
  return json({
    section: run.section,
    id: section.id,
    replays: LEVELS[run.level].replays,
    mondai,
  });
}

export async function submitHandler(
  request: Request,
  id: string,
  deps: JlptDeps,
): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, submitBody);
  const run = await loadRun(id, deps);
  const now = deps.now();
  const section = paperFor(run, deps.bank)[body.section];
  if (!section) throw new HttpError('bad-request', 400, 'unknown section');
  const index = indexBank(run.level, deps.bank);
  const key = new Map([...index].map(([questionId, entry]) => [questionId, entry.question]));
  const result = wrapRunError(() =>
    submitSection(run, body.section, body.answers, section, key, now),
  );
  await deps.store.insertAnswers(run.id, result.rows);
  let next = result.run;
  if (next.status === 'finished') {
    const scores = scoreAnswers(run.level, await deps.store.getAnswers(run.id), index);
    next = { ...next, scores };
  }
  await save(next, run, deps);
  return json(publicState(next, now));
}

export async function continueHandler(
  request: Request,
  id: string,
  deps: JlptDeps,
): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, continueBody);
  const run = await loadRun(id, deps);
  if (run.status === 'section' && run.section === body.section) {
    // The break already ran out on the server: nothing to do.
    return json(publicState(run, deps.now()));
  }
  if (run.section !== body.section) throw new HttpError('conflict', 409, 'wrong-section');
  const next = wrapRunError(() => continueRun(run, deps.now()));
  await save(next, run, deps);
  return json(publicState(next, deps.now()));
}

export async function feedbackHandler(
  request: Request,
  id: string,
  deps: JlptDeps,
): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, feedbackBody);
  const run = await loadRun(id, deps);
  if (!run.results.some((result) => result.section === body.section)) {
    throw new HttpError('conflict', 409, 'section not finished');
  }
  await deps.store.saveFeedback(run.id, body.section, body.rating);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/** Name for the score report; only once the run is finished. */
export async function nameHandler(request: Request, id: string, deps: JlptDeps): Promise<Response> {
  assertSameOrigin(request, deps.site);
  const body = await readJson(request, nameBody);
  const run = await loadRun(id, deps);
  if (!(await deps.store.setName(run.id, cleanName(body.name)))) {
    throw new HttpError('conflict', 409, 'run not finished');
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
