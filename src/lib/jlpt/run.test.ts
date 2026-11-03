import { describe, expect, it } from 'vitest';

import { fakeBank } from './fixtures';
import { TIMING } from './levels';
import { buildPaper, indexBank } from './paper';
import {
  advance,
  continueRun,
  createRun,
  publicState,
  RunError,
  scoreAnswers,
  submitSection,
  type AnswerRow,
  type RunRecord,
  type SubmittedAnswer,
} from './run';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = Date.UTC(2026, 10, 3, 9);
const bank = fakeBank('N5');
const paper = buildPaper('N5', 5, bank);
const index = indexBank('N5', bank);
const key = new Map([...index].map(([id, entry]) => [id, entry.question]));

const start = () => createRun({ id: 'run-1', level: 'N5', seed: 5, isPublic: false, now: T0 });

/** Answers every question of a section with `choice`, at time `at`. */
function answerAll(section: number, choice: number, at: number): SubmittedAnswer[] {
  return (paper[section]?.mondai ?? []).flatMap((mondai) =>
    mondai.questionIds.map((id) => ({ id, choice, at })),
  );
}

function submit(run: RunRecord, answers: SubmittedAnswer[], now: number) {
  const section = paper[run.section];
  if (!section) throw new Error('no section');
  return submitSection(run, run.section, answers, section, key, now);
}

describe('run timing', () => {
  it('starts the first section after the countdown with the section time', () => {
    const run = start();
    expect(run.sectionStartsAt).toBe(T0 + TIMING.countdown * SECOND);
    expect(run.deadline - run.sectionStartsAt).toBe(20 * MINUTE);
    expect(run.expiresAt - T0).toBe(180 * 24 * 60 * MINUTE);
  });

  it('goes to a break, then the next section, then finishes', () => {
    let run = start();
    let now = run.sectionStartsAt + 10 * MINUTE;
    ({ run } = submit(run, answerAll(0, 1, now), now));
    expect(run).toMatchObject({ status: 'break', section: 1, breakStartedAt: now });
    expect(run.results[0]).toEqual({ section: 0, answered: 21, total: 21, seconds: 600 });

    expect(() => continueRun(run, now + 30 * SECOND)).toThrow(RunError);
    now += TIMING.breakMin * SECOND;
    run = continueRun(run, now);
    expect(run).toMatchObject({ status: 'section', section: 1 });
    expect(run.deadline - run.sectionStartsAt).toBe(40 * MINUTE);

    now = run.sectionStartsAt + MINUTE;
    ({ run } = submit(run, answerAll(1, 1, now), now));
    now += TIMING.breakMin * SECOND;
    run = continueRun(run, now);
    now = run.sectionStartsAt + MINUTE;
    const done = submit(run, answerAll(2, 1, now), now);
    expect(done.run).toMatchObject({ status: 'finished', finishedAt: now });
    expect(done.run.results).toHaveLength(3);
  });

  it('starts the next section by itself when the break runs out', () => {
    let { run } = submit(start(), [], T0 + MINUTE);
    const breakEnds = (run.breakStartedAt ?? 0) + TIMING.breakMax * SECOND;
    expect(advance(run, breakEnds - 1)).toBe(run);
    run = advance(run, breakEnds + 5 * MINUTE);
    expect(run.status).toBe('section');
    expect(run.sectionStartsAt).toBe(breakEnds + TIMING.countdown * SECOND);
  });

  it('keeps only answers made before the deadline plus tolerance', () => {
    const run = start();
    const cutoff = run.deadline + TIMING.lateTolerance * SECOND;
    const [first, second] = answerAll(0, 1, cutoff);
    const answers = [
      { ...first, at: cutoff } as SubmittedAnswer,
      { ...second, at: cutoff + 1 } as SubmittedAnswer,
    ];
    const { run: next, rows } = submit(run, answers, run.deadline + 2 * 60 * MINUTE);
    expect(rows.filter((row) => row.choice !== null)).toHaveLength(1);
    expect(next.results[0]?.seconds).toBe(20 * 60);
  });

  it('rejects a section that is not the current one and invalid choices', () => {
    const run = start();
    const section = paper[1];
    if (!section) throw new Error('no section');
    expect(() => submitSection(run, 1, [], section, key, T0)).toThrow('wrong-section');
    const [first] = answerAll(0, 9, T0);
    const { rows } = submit(run, first ? [first] : [], T0);
    expect(rows.every((row) => row.choice === null && !row.correct)).toBe(true);
  });
});

describe('scoring a finished run', () => {
  it('scores rows by sub-area', () => {
    const rows: AnswerRow[] = paper.flatMap((section, number) =>
      section.mondai.flatMap((mondai) =>
        mondai.questionIds.map((questionId) => ({
          section: number,
          questionId,
          choice: 1,
          correct: number !== 2,
        })),
      ),
    );
    const report = scoreAnswers('N5', rows, index);
    expect(report.sections.map((section) => section.scaled)).toEqual([120, 0]);
    expect(report.passed).toBe(false);
  });

  it('exposes no answers in the public state', () => {
    const state = publicState(start(), T0);
    expect(Object.keys(state)).not.toContain('seed');
    expect(state.breakEndsAt).toBeNull();
    expect(state.scores).toBeNull();
  });
});
