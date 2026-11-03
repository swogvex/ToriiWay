// /jlpt/run: resumes the run saved in this browser and moves it through countdown,
// sections, breaks and the end, always following the server's state and clock.

import { clearRun, loadRun, saveRun, type StoredRun } from '../../progress/jlpt';
import { ApiError, continueRun, getPaper, getRun, sendFeedback, submitSection } from '../client';
import { LEVELS, TIMING } from '../levels';
import type { PublicRunState } from '../run';
import { Pause } from './break';
import { renderDone } from './done';
import { Exam } from './exam';
import { formatClock } from './format';
import { readLabels } from './labels';
import { createPlayer, type Player } from './voices';

type Status = 'loading' | 'missing' | 'countdown' | 'section' | 'break' | 'finished';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export async function initRun(root: HTMLElement): Promise<void> {
  const t = readLabels(root.dataset.labels);
  const stored = loadRun();
  const $ = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
  const setStatus = (status: Status) => {
    root.dataset.status = status;
  };
  if (!stored) {
    setStatus('missing');
    return;
  }
  const run: StoredRun = stored;
  const now = () => Date.now() + run.offset;
  const save = () => saveRun(run);
  let player: Player | null | undefined;
  let exam: Exam | null = null;
  let pause: Pause | null = null;

  const errorBox = $('[data-error]');
  const fail = (retry: () => void) => {
    const text = $('[data-error-text]');
    if (text) text.textContent = t('jlpt.run.error');
    if (errorBox) errorBox.hidden = false;
    const button = $<HTMLButtonElement>('[data-retry]');
    if (button) {
      button.onclick = () => {
        if (errorBox) errorBox.hidden = true;
        retry();
      };
    }
  };

  async function refresh(): Promise<void> {
    try {
      route(await getRun(run.id));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
        clearRun();
        setStatus('missing');
      } else {
        fail(() => void refresh());
      }
    }
  }

  function route(state: PublicRunState): void {
    exam?.stop();
    exam = null;
    pause?.stop();
    pause = null;
    if (state.status === 'section') void startSection(state);
    else if (state.status === 'break') startBreak(state);
    else finish(state);
  }

  async function countdown(state: PublicRunState): Promise<void> {
    const section = LEVELS[state.level].sections[state.section];
    const overlay = $('[data-countdown]');
    const number = $('[data-countdown-number]');
    const label = $('[data-countdown-section]');
    if (!overlay || !number || !section || now() >= state.sectionStartsAt) return;
    setStatus('countdown');
    if (label) label.textContent = `${t(`level.${state.level}`)} · ${t(`section.${section.id}`)}`;
    overlay.hidden = false;
    for (let left = Math.ceil((state.sectionStartsAt - now()) / 1000); left > 0; left -= 1) {
      number.textContent = String(Math.min(left, TIMING.countdown));
      await wait(state.sectionStartsAt - (left - 1) * 1000 - now());
    }
    overlay.hidden = true;
  }

  async function startSection(state: PublicRunState): Promise<void> {
    if (run.section !== state.section) {
      Object.assign(run, { section: state.section, answers: {}, flags: [], plays: {} });
      save();
    }
    const [paper] = await Promise.all([getPaper(run.id), countdown(state)]).catch((error) => {
      fail(() => void refresh());
      throw error;
    });
    player ??= paper.mondai.some((mondai) => mondai.questions.some((q) => q.tts))
      ? await createPlayer()
      : undefined;
    const section = LEVELS[state.level].sections[state.section];
    const title = $('[data-exam-title]');
    if (title && section) {
      title.textContent = `${t(`level.${state.level}`)} · ${t(`section.${section.id}`)}`;
    }
    setStatus('section');
    const examRoot = $('[data-exam]');
    if (!examRoot) return;
    exam = new Exam({
      root: examRoot,
      paper,
      run,
      deadline: state.deadline,
      t,
      now,
      save,
      player: player ?? null,
      onFinalize: (auto) => (auto ? void submit(state.section) : confirmFinalize(state.section)),
    });
    exam.start();
  }

  const dialog = document.getElementById('jlpt-finalize');
  const go = document.querySelector<HTMLButtonElement>('[data-finalize-go]');
  let pendingSection = 0;
  go?.addEventListener('click', () => {
    if (dialog instanceof HTMLDialogElement) dialog.close();
    void submit(pendingSection);
  });

  function confirmFinalize(section: number): void {
    if (!exam || !(dialog instanceof HTMLDialogElement)) return;
    const { unanswered, left } = exam.status();
    const time = formatClock(left);
    const text = dialog.querySelector('[data-finalize-text]');
    if (text) {
      text.textContent =
        unanswered > 0 && left > 0
          ? t('jlpt.run.finalize.both', { count: unanswered, time })
          : unanswered > 0
            ? t('jlpt.run.finalize.unanswered', { count: unanswered })
            : t('jlpt.run.finalize.time', { time });
    }
    pendingSection = section;
    dialog.showModal();
  }

  async function submit(section: number): Promise<void> {
    if (!exam) return;
    const answers = exam.answers();
    const announce = $('[data-announce]');
    if (announce) announce.textContent = t('jlpt.run.saving');
    try {
      const state = await submitSection(run.id, section, answers);
      Object.assign(run, { answers: {}, flags: [], plays: {}, section: state.section });
      save();
      route(state);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) void refresh();
      else fail(() => void submit(section));
    }
  }

  function startBreak(state: PublicRunState): void {
    setStatus('break');
    const breakRoot = $('[data-break]');
    if (!breakRoot) return;
    pause = new Pause({
      root: breakRoot,
      state,
      t,
      now,
      onContinue: () => {
        continueRun(run.id, state.section)
          .then(route)
          .catch(() => fail(() => void refresh()));
      },
      onTimeout: () => void refresh(),
      onFeedback: (rating) => sendFeedback(run.id, state.section - 1, rating),
    });
    pause.start();
  }

  function finish(state: PublicRunState): void {
    setStatus('finished');
    const done = $('[data-run-done]');
    if (done) renderDone(done, state, t);
  }

  await refresh();
}
