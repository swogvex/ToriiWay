// "Your names on another device": names belong to the browser token that first used them
// (08-spec-game "Names without accounts"), so this shows that token as a code and lets
// another browser adopt it. Nothing goes to the server; it only ever sees the token's hash.

import { adoptSubmitterToken, formatCode, parseCode, submitterToken } from './client';

type Labels = Record<string, string>;

function dialog(id: string): HTMLDialogElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLDialogElement ? element : null;
}

export function initCodeTransfer(root: HTMLElement): void {
  const labels = JSON.parse(root.dataset.labels ?? '{}') as Labels;
  const show = dialog('board-code-show');
  const enter = dialog('board-code-enter');
  if (!show || !enter) return;

  const has = show.querySelector<HTMLElement>('[data-board-code-has]');
  const none = show.querySelector<HTMLElement>('[data-board-code-none]');
  const value = show.querySelector<HTMLElement>('[data-board-code-value]');
  const copy = show.querySelector<HTMLButtonElement>('[data-board-code-copy]');
  const copyStatus = show.querySelector<HTMLElement>('[data-board-code-copy-status]');
  const form = enter.querySelector<HTMLFormElement>('[data-board-code-form]');
  const input = enter.querySelector<HTMLInputElement>('#board-code-input');
  const replace = enter.querySelector<HTMLElement>('[data-board-code-replace]');
  const status = enter.querySelector<HTMLElement>('[data-board-code-status]');
  const save = enter.querySelector<HTMLButtonElement>('[data-board-code-save]');
  if (!has || !none || !value || !copy || !copyStatus) return;
  if (!form || !input || !replace || !status || !save) return;

  input.spellcheck = false;
  input.autocapitalize = 'off';
  // The error line is announced with the field, after the hint.
  input.setAttribute(
    'aria-describedby',
    [input.getAttribute('aria-describedby'), status.id].filter(Boolean).join(' '),
  );

  // Filled on every open: another tab may have created or replaced the token meanwhile.
  root.addEventListener('click', (event) => {
    const opener = (event.target as Element | null)?.closest<HTMLElement>('[data-board-code-open]');
    if (!opener) return;
    const token = submitterToken();
    if (opener.dataset.dialogOpen === 'board-code-show') {
      value.textContent = token ? formatCode(token) : '';
      has.hidden = !token;
      none.hidden = Boolean(token);
      copy.hidden = !token;
      copyStatus.textContent = '';
    } else {
      form.reset();
      input.removeAttribute('aria-invalid');
      replace.hidden = !token;
      status.textContent = '';
      save.disabled = false;
    }
  });

  copy.addEventListener('click', () => {
    const token = submitterToken();
    if (!token) return;
    navigator.clipboard.writeText(formatCode(token)).then(
      () => (copyStatus.textContent = labels.codeCopied ?? ''),
      () => {
        // Clipboard blocked: select the code so it can be copied by hand.
        window.getSelection()?.selectAllChildren(value);
        copyStatus.textContent = labels.codeCopyFailed ?? '';
      },
    );
  });

  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    status.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = parseCode(input.value);
    if (!token) {
      input.setAttribute('aria-invalid', 'true');
      status.textContent = labels.codeInvalid ?? '';
      input.focus();
      return;
    }
    if (token === submitterToken()) {
      status.textContent = labels.codeSame ?? '';
      return;
    }
    adoptSubmitterToken(token);
    replace.hidden = true;
    save.disabled = true;
    status.textContent = labels.codeSaved ?? '';
    window.setTimeout(() => enter.close(), 1500);
  });
}
