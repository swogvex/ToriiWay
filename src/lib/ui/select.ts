// Behaviour of src/components/ui/Select.astro (ARIA listbox pattern).

function parts(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>('[data-select-button]');
  const list = root.querySelector<HTMLElement>('[data-select-list]');
  const input = root.querySelector<HTMLInputElement>('[data-select-input]');
  const current = root.querySelector<HTMLElement>('[data-select-current]');
  if (!button || !list || !input || !current) return null;
  const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  return { button, list, input, current, options };
}

/** Shows `value` as chosen. Fires `change` on the root only when `notify` is set. */
export function setSelectValue(root: HTMLElement, value: string, notify = false): void {
  const p = parts(root);
  const option = p?.options.find((item) => item.dataset.value === value);
  if (!p || !option) return;
  const changed = p.input.value !== value;
  for (const item of p.options) item.setAttribute('aria-selected', String(item === option));
  p.input.value = value;
  p.current.textContent = option.textContent?.trim() ?? value;
  if (changed && notify) root.dispatchEvent(new Event('change', { bubbles: true }));
}

function initSelect(root: HTMLElement): void {
  const p = parts(root);
  if (!p || root.dataset.selectReady) return;
  root.dataset.selectReady = '';
  const { button, list, options } = p;
  let active = 0;

  const highlight = (index: number) => {
    active = Math.max(0, Math.min(options.length - 1, index));
    options.forEach((option, i) => option.classList.toggle('is-active', i === active));
    const option = options[active];
    if (option) {
      list.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }
  };

  const open = () => {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    highlight(
      Math.max(
        0,
        options.findIndex((o) => o.getAttribute('aria-selected') === 'true'),
      ),
    );
    list.focus();
  };

  const close = (focusButton = true) => {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    list.removeAttribute('aria-activedescendant');
    if (focusButton) button.focus();
  };

  const choose = (index: number) => {
    const value = options[index]?.dataset.value;
    if (value !== undefined) setSelectValue(root, value, true);
    close();
  };

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });
  list.addEventListener('keydown', (event) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => highlight(active + 1),
      ArrowUp: () => highlight(active - 1),
      Home: () => highlight(0),
      End: () => highlight(options.length - 1),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => close(),
    };
    if (event.key === 'Tab') return close(false);
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });
  options.forEach((option, index) => {
    option.addEventListener('click', () => choose(index));
    option.addEventListener('pointermove', () => highlight(index));
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target as Node)) close(false);
  });
}

export function initSelects(scope: ParentNode): void {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-select]')) initSelect(root);
}
