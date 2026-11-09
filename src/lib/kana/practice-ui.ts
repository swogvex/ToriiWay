import type { KanaProgress, PracticeResult } from '../progress/kana';
import { loadKanaData } from './client-data';
import type { PanelKana } from './data';
import { buildRound, isCorrect, type Prompt } from './practice';

type Mode = PracticeResult['mode'];

/**
 * "Test this row" practice (components/learn/KanaPractice.astro): choose rows and an
 * answer mode, answer 10–20 prompts with instant feedback, then see the score and the
 * kana to review. Results are stored locally. Everything runs on data already loaded.
 */
export function initPractice(
  root: HTMLElement,
  progress: KanaProgress,
  signal?: AbortSignal,
): void {
  const dialog = root.closest('dialog');
  const setup = root.querySelector<HTMLFormElement>('[data-practice-setup]');
  const question = root.querySelector<HTMLElement>('[data-practice-question]');
  const results = root.querySelector<HTMLElement>('[data-practice-results]');
  const typeForm = root.querySelector<HTMLFormElement>('[data-practice-type]');
  const input = typeForm?.querySelector<HTMLInputElement>('input');
  const choices = root.querySelector<HTMLElement>('[data-practice-choices]');
  const next = root.querySelector<HTMLButtonElement>('[data-practice-next]');
  const feedback = root.querySelector<HTMLElement>('[data-practice-feedback]');
  const { src, script = '' } = root.dataset;
  if (!dialog || !setup || !question || !results || !typeForm || !input || !choices || !next)
    return;
  if (!feedback || !src) return;

  const field = (name: string) => root.querySelector<HTMLElement>(`[data-practice-${name}]`);
  const text = (name: string) => root.dataset[name] ?? '';
  const fill = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));

  let round: Prompt<PanelKana>[] = [];
  let index = 0;
  let correct = 0;
  let misses: PanelKana[] = [];
  let mode: Mode = 'choice';
  let rows: string[] = [];

  function showStep(step: HTMLElement): void {
    for (const section of [setup, question, results]) {
      if (section) section.hidden = section !== step;
    }
  }

  function showSetup(row?: string): void {
    if (!setup) return;
    if (row) {
      for (const box of setup.querySelectorAll<HTMLInputElement>('input[name="row"]')) {
        box.checked = box.value === row;
      }
    }
    field('error')?.setAttribute('hidden', '');
    showStep(setup);
  }

  async function start(): Promise<void> {
    const data = await loadKanaData(src ?? '');
    const pool = data.filter((kana) => rows.includes(kana.row));
    round = buildRound(pool, data);
    index = 0;
    correct = 0;
    misses = [];
    if (question) showStep(question);
    ask();
  }

  function ask(): void {
    const prompt = round[index];
    if (!prompt || !choices || !typeForm || !input || !next || !feedback) return;
    field('progress')?.replaceChildren(
      fill(text('progress'), { current: index + 1, total: round.length }),
    );
    field('kana')?.replaceChildren(prompt.kana.char);
    feedback.replaceChildren();
    feedback.removeAttribute('data-state');
    next.hidden = true;

    choices.hidden = mode !== 'choice';
    typeForm.hidden = mode !== 'type';
    if (mode === 'choice') {
      choices.replaceChildren(
        ...prompt.choices.map((romaji) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'practice__choice';
          button.textContent = romaji;
          button.dataset.choice = romaji;
          return button;
        }),
      );
      choices.querySelector('button')?.focus();
    } else {
      input.value = '';
      input.disabled = false;
      input.focus();
    }
  }

  function answer(given: string): void {
    const prompt = round[index];
    if (!prompt || !next || !feedback || !input || !choices) return;
    const right = mode === 'choice' ? given === prompt.kana.romaji : isCorrect(given, prompt.kana);
    if (right) correct++;
    else misses.push(prompt.kana);

    for (const button of choices.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = true;
      if (button.dataset.choice === prompt.kana.romaji) button.dataset.state = 'correct';
      else if (button.dataset.choice === given) button.dataset.state = 'wrong';
    }
    input.disabled = true;

    const values = { char: prompt.kana.char, romaji: prompt.kana.romaji };
    feedback.dataset.state = right ? 'correct' : 'wrong';
    feedback.replaceChildren(fill(text(right ? 'correct' : 'wrong'), values));
    next.textContent = index === round.length - 1 ? text('finish') : text('next');
    next.hidden = false;
    next.focus();
  }

  function finish(): void {
    if (!results) return;
    const result: PracticeResult = {
      script,
      mode,
      rows,
      correct,
      total: round.length,
      date: new Date().toISOString().slice(0, 10),
    };
    progress.addResult(result);
    field('score')?.replaceChildren(fill(text('score'), { correct, total: round.length }));

    const unique = [...new Map(misses.map((kana) => [kana.char, kana])).values()];
    field('perfect')?.toggleAttribute('hidden', unique.length > 0);
    field('review')?.toggleAttribute('hidden', unique.length === 0);
    field('misses')?.replaceChildren(
      ...unique.map((kana) => {
        const item = document.createElement('li');
        const char = document.createElement('span');
        char.lang = 'ja';
        char.className = 'practice__miss-char';
        char.textContent = kana.char;
        item.append(char, ` ${kana.romaji}`);
        return item;
      }),
    );
    showStep(results);
    results.querySelector<HTMLElement>('[data-practice-score]')?.focus();
  }

  setup.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(setup);
    rows = form.getAll('row').map(String);
    mode = form.get('mode') === 'type' ? 'type' : 'choice';
    if (rows.length === 0) {
      field('error')?.removeAttribute('hidden');
      setup.querySelector<HTMLInputElement>('input[name="row"]')?.focus();
      return;
    }
    void start();
  });

  typeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.disabled && input.value.trim()) answer(input.value);
  });

  choices.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-choice]');
    if (button && !button.disabled) answer(button.dataset.choice ?? '');
  });

  next.addEventListener('click', () => {
    index++;
    if (index < round.length) ask();
    else finish();
  });

  field('again')?.addEventListener('click', () => void start());
  field('change')?.addEventListener('click', () => {
    showSetup();
    setup.querySelector<HTMLInputElement>('input[name="row"]:checked')?.focus();
  });

  // "Test this row" opens the dialog (Dialog.astro) with that row chosen.
  // The signal ends this listener when the page swaps to the other script.
  const listening = signal ? { signal } : {};
  document.addEventListener(
    'click',
    (event) => {
      const opener = (event.target as Element).closest<HTMLElement>('[data-practice-row]');
      if (opener) showSetup(opener.dataset.practiceRow);
    },
    listening,
  );
}
