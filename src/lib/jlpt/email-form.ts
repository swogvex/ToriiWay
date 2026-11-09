// "Email my results" on the result page: Turnstile loads on first focus or submit.

import { loadRun } from '../progress/jlpt';
import { turnstileWidget, type Widget } from '../turnstile-client';

interface Messages {
  sending: string;
  sent: string;
  invalid: string;
  verify: string;
  limit: string;
  check: string;
  error: string;
}

export function initEmailForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-email-form]');
  const input = form?.querySelector<HTMLInputElement>('input[type="email"]');
  const box = form?.querySelector<HTMLElement>('[data-email-turnstile]');
  const status = form?.querySelector<HTMLElement>('[data-email-status]');
  const send = form?.querySelector<HTMLButtonElement>('[data-email-send]');
  if (!form || !input || !box || !status || !send) return;
  const messages = JSON.parse(form.dataset.messages ?? '{}') as Messages;
  const runId = form.dataset.run ?? '';

  // The email given before the run, kept in this browser, fills the field.
  const stored = loadRun();
  if (stored?.id === runId && stored.email && !input.value) input.value = stored.email;

  let widget: Widget | null | undefined;
  const ensureWidget = async () => {
    widget ??= await turnstileWidget(box, form.dataset.sitekey ?? '');
    return widget;
  };
  input.addEventListener('focus', () => void ensureWidget(), { once: true });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.checkValidity() || !input.value.includes('@')) {
      status.textContent = messages.invalid;
      input.focus();
      return;
    }
    const token = (await ensureWidget())?.token() ?? '';
    if (!token) {
      status.textContent = messages.verify;
      return;
    }
    send.disabled = true;
    status.textContent = messages.sending;
    try {
      const response = await fetch(`/api/jlpt/runs/${runId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.value.trim(),
          token,
          locale: document.documentElement.lang === 'es' ? 'es' : 'en',
        }),
      });
      if (response.ok) {
        status.textContent = messages.sent;
        return;
      }
      status.textContent =
        response.status === 429
          ? messages.limit
          : response.status === 403
            ? messages.check
            : messages.error;
    } catch {
      status.textContent = messages.error;
    }
    send.disabled = false;
    widget?.reset();
  });
}
