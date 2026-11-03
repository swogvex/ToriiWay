// "Report a problem" dialog on /jlpt/run. Cloudflare's Turnstile script loads only when
// the dialog first opens, so the exam makes no third-party request before that.

import { turnstileWidget, type Widget } from '../../turnstile-client';
import { loadRun } from '../../progress/jlpt';

interface Messages {
  sending: string;
  thanks: string;
  verify: string;
  limit: string;
  check: string;
  generic: string;
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
  let widget: Widget | null | undefined;
  let questionId = '';

  opener.addEventListener('click', async () => {
    questionId = root.querySelector<HTMLElement>('[data-exam]')?.dataset.question ?? '';
    status.textContent = '';
    send.disabled = false;
    dialog.showModal();
    dialog.addEventListener('close', () => opener.focus(), { once: true });
    if (widget === undefined) {
      widget = await turnstileWidget(box, form.dataset.sitekey ?? '');
      if (!widget) status.textContent = messages.generic;
    } else {
      widget?.reset();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = widget?.token() ?? '';
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
    widget?.reset();
  });
}
