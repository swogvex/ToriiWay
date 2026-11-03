// "Report a problem" dialog on /jlpt/run. Cloudflare's Turnstile script loads only when
// the dialog first opens, so the exam makes no third-party request before that.

import { loadRun } from '../../progress/jlpt';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widget?: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

interface Messages {
  sending: string;
  thanks: string;
  verify: string;
  limit: string;
  check: string;
  generic: string;
}

let loading: Promise<Turnstile | null> | undefined;

function loadTurnstile(): Promise<Turnstile | null> {
  loading ??= new Promise((resolve) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.addEventListener('load', () => resolve(window.turnstile ?? null));
    script.addEventListener('error', () => resolve(null));
    document.head.append(script);
  });
  return loading;
}

export function initReport(root: HTMLElement): void {
  const opener = root.querySelector<HTMLButtonElement>('[data-report-open]');
  const dialog = document.getElementById('jlpt-report');
  const form = document.querySelector<HTMLFormElement>('[data-report-form-problem]');
  const status = document.querySelector<HTMLElement>('[data-report-status]');
  const send = document.querySelector<HTMLButtonElement>('[data-report-send]');
  const box = document.querySelector<HTMLElement>('[data-turnstile]');
  if (!opener || !(dialog instanceof HTMLDialogElement) || !form || !status || !send || !box)
    return;
  const messages = JSON.parse(form.dataset.messages ?? '{}') as Messages;
  const message = form.querySelector<HTMLTextAreaElement>('textarea');
  if (message) message.maxLength = 1000;
  let token = '';
  let widget: string | undefined;
  let questionId = '';

  opener.addEventListener('click', async () => {
    questionId = root.querySelector<HTMLElement>('[data-exam]')?.dataset.question ?? '';
    status.textContent = '';
    send.disabled = false;
    dialog.showModal();
    dialog.addEventListener('close', () => opener.focus(), { once: true });
    const turnstile = await loadTurnstile();
    if (!turnstile) {
      status.textContent = messages.generic;
      return;
    }
    if (widget === undefined) {
      widget = turnstile.render(box, {
        sitekey: form.dataset.sitekey,
        theme: 'auto',
        callback: (value: string) => {
          token = value;
        },
        'expired-callback': () => {
          token = '';
        },
      });
    } else {
      token = '';
      turnstile.reset(widget);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!token) {
      status.textContent = messages.verify;
      return;
    }
    const data = new FormData(form);
    send.disabled = true;
    status.textContent = messages.sending;
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId,
          runId: loadRun()?.id ?? null,
          category: String(data.get('category') ?? 'other'),
          message: String(data.get('message') ?? ''),
          token,
        }),
      });
      if (response.ok) {
        status.textContent = messages.thanks;
        form.reset();
        window.setTimeout(() => dialog.close(), 1500);
        return;
      }
      status.textContent =
        response.status === 429
          ? messages.limit
          : response.status === 403
            ? messages.check
            : messages.generic;
    } catch {
      status.textContent = messages.generic;
    }
    send.disabled = false;
    token = '';
    window.turnstile?.reset(widget);
  });
}
