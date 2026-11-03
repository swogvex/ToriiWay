/** Blocked screen: copy the link, and "Play anyway" once a keyboard is likely. */
export function initBlocked(root: HTMLElement, playAnyway: () => void): void {
  const anyway = root.querySelector<HTMLElement>('[data-play-anyway]');
  const copy = root.querySelector<HTMLElement>('[data-copy-link]');
  const copyLabel = copy?.querySelector<HTMLElement>('[data-copy-label]');
  const status = root.querySelector<HTMLElement>('[data-copy-status]');
  if (!anyway || !copy || !copyLabel || !status) return;

  // A fine pointer on a narrow screen is a laptop window; a keydown means a keyboard.
  anyway.hidden = !matchMedia('(pointer: fine)').matches;
  document.addEventListener('keydown', () => (anyway.hidden = false), { once: true });
  anyway.addEventListener('click', playAnyway);

  const original = copyLabel.textContent;
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(location.href).then(() => {
      const copied = copy.dataset['copiedLabel'] ?? '';
      copyLabel.textContent = copied;
      status.textContent = copied;
      setTimeout(() => (copyLabel.textContent = original), 2000);
    });
  });
}
