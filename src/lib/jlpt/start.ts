// JLPT start page (components/jlpt/JlptStart.astro): tips dialog, starting a run and the
// audio test. Without JavaScript the page still shows levels, sections and rules.

import { clearRun, loadRun, saveRun } from '../progress/jlpt';
import { loadVoices, pickJapaneseVoice, speak } from '../kana/speech';
import { ApiError, createRun, getRun } from './client';
import { JLPT_LEVELS } from './levels';
import type { JlptLevel } from './types';

interface Messages {
  starting: string;
  limit: string;
  unavailable: string;
  generic: string;
  noVoice: string;
  phrase: string;
  levels: Record<JlptLevel, string>;
}

function parse<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function errorText(error: unknown, messages: Messages): string {
  if (error instanceof ApiError && error.status === 429) return messages.limit;
  if (error instanceof ApiError && error.status === 503) return messages.unavailable;
  return messages.generic;
}

/** Shows "Resume" when this browser has a run that is still open on the server. */
async function showResume(root: HTMLElement, messages: Messages, template: string) {
  const stored = loadRun();
  const banner = root.querySelector<HTMLElement>('[data-resume]');
  const text = root.querySelector<HTMLElement>('[data-resume-text]');
  if (!stored || !banner || !text) return;
  try {
    const state = await getRun(stored.id);
    if (state.status === 'finished') return;
    text.textContent = template.replace('{level}', messages.levels[stored.level]);
    banner.hidden = false;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 410)) clearRun();
  }
}

export function initStart(root: HTMLElement): void {
  const messages = parse<Messages | null>(root.dataset.messages, null);
  if (!messages) return;
  const available = new Set(parse<JlptLevel[]>(root.dataset.available, []));
  const form = root.querySelector<HTMLFormElement>('[data-start-form]');
  const button = root.querySelector<HTMLButtonElement>('[data-start-button]');
  const error = root.querySelector<HTMLElement>('[data-start-error]');
  const tips = document.getElementById('jlpt-tips');
  const go = document.querySelector<HTMLButtonElement>('[data-tips-go]');
  if (!form || !button || !error || !(tips instanceof HTMLDialogElement) || !go) return;

  const level = (): JlptLevel => {
    const checked = root.querySelector<HTMLInputElement>('input[name="level"]:checked')?.value;
    return JLPT_LEVELS.find((entry) => entry === checked) ?? 'N5';
  };
  const sync = () => {
    button.disabled = !available.has(level());
    error.textContent = '';
  };
  root.addEventListener('change', (event) => {
    if ((event.target as HTMLInputElement | null)?.name === 'level') sync();
  });
  sync();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (button.disabled) return;
    tips.showModal();
    tips.addEventListener('close', () => button.focus(), { once: true });
  });

  go.addEventListener('click', async () => {
    const chosen = level();
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const label = go.innerHTML;
    go.disabled = true;
    go.textContent = messages.starting;
    try {
      const sentAt = Date.now();
      const state = await createRun(chosen, data.get('public') === 'on');
      // The server's clock is the reference; assume the reply took half the round trip.
      const offset = state.serverNow - Math.round((sentAt + Date.now()) / 2);
      saveRun({
        id: state.id,
        level: chosen,
        email: email.includes('@') ? email : null,
        offset,
        answers: {},
        flags: [],
        section: 0,
      });
      window.location.assign(root.dataset.runUrl ?? '/jlpt/run');
    } catch (failure) {
      tips.close();
      error.textContent = errorText(failure, messages);
      go.disabled = false;
      go.innerHTML = label;
    }
  });

  const audio = root.querySelector<HTMLButtonElement>('[data-test-audio]');
  const note = root.querySelector<HTMLElement>('[data-audio-note]');
  const help = root.querySelector<HTMLElement>('[data-voice-help-link]');
  audio?.addEventListener('click', async () => {
    const voice = 'speechSynthesis' in window ? pickJapaneseVoice(await loadVoices()) : undefined;
    if (help) help.hidden = Boolean(voice);
    if (!voice) {
      if (note) note.textContent = messages.noVoice;
      return;
    }
    if (note) note.textContent = '';
    speak(messages.phrase, voice);
  });

  const resume = root.querySelector<HTMLElement>('[data-resume-text]');
  void showResume(root, messages, resume?.dataset.template ?? '');
}
