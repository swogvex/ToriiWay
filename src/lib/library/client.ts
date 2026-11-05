// /library in the browser: filters, search and sort over the cards the server rendered,
// with the state in the URL (shareable, back/forward friendly).

import {
  type BookFacts,
  compareBooks,
  EMPTY_STATE,
  type LibraryState,
  matches,
  searchFromState,
  stateFromSearch,
} from './filter';

function need<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export function initLibrary(root: HTMLElement): void {
  const labels = JSON.parse(root.dataset.labels ?? '{}') as Record<string, string>;
  const facts = JSON.parse(need(root, '[data-library-facts]').textContent ?? '[]') as BookFacts[];
  const form = need<HTMLFormElement>(root, '[data-library-form]');
  const filters = need<HTMLElement>(root, '[data-library-filters]');
  const toggle = need<HTMLButtonElement>(root, '[data-library-toggle]');
  const query = need<HTMLInputElement>(root, '[data-library-query]');
  const search = need<HTMLFormElement>(root, '[data-library-search]');
  const sort = need<HTMLSelectElement>(root, '[data-library-sort]');
  const list = need<HTMLOListElement>(root, '[data-library-list]');
  const count = need<HTMLElement>(root, '[data-library-count]');
  const empty = need<HTMLElement>(root, '[data-library-empty]');
  const cards = new Map(
    [...list.querySelectorAll<HTMLLIElement>('[data-slug]')].map((card) => [
      card.dataset.slug ?? '',
      card,
    ]),
  );

  // Phones: the "Filters" button folds the panel (CSS hides it until opened).
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    filters.classList.toggle('is-open', open);
  });

  let state: LibraryState = stateFromSearch(location.search);

  function syncInputs(): void {
    const checked: Record<string, readonly string[]> = {
      level: state.levels,
      category: state.categories,
      resources: state.resources,
    };
    for (const input of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      input.checked = checked[input.name]?.includes(input.value) ?? false;
    }
    query.value = state.query;
    sort.value = state.sort;
  }

  function readInputs(): LibraryState {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const name of ['level', 'category', 'resources']) {
      const values = data.getAll(name).map(String);
      if (values.length) params.set(name, values.join(','));
    }
    params.set('q', query.value);
    params.set('sort', sort.value);
    return stateFromSearch(`?${params.toString()}`);
  }

  function render(): void {
    const shown = facts.filter((book) => matches(book, state)).sort(compareBooks(state.sort));
    const visible = new Set(shown.map((book) => book.slug));
    for (const [slug, card] of cards) card.hidden = !visible.has(slug);
    // Reorder only what moved, so focus and scroll stay put.
    list.append(...shown.map((book) => cards.get(book.slug)).filter((card) => card !== undefined));
    empty.hidden = shown.length > 0;
    count.textContent =
      shown.length === 1
        ? (labels.countOne ?? '')
        : (labels.count ?? '').replace('{count}', String(shown.length));
  }

  function update(push: boolean): void {
    state = readInputs();
    const url = `${location.pathname}${searchFromState(state)}`;
    if (url !== `${location.pathname}${location.search}`) {
      // Typing replaces the entry; a filter click adds one, so Back undoes it.
      if (push) history.pushState(null, '', url);
      else history.replaceState(null, '', url);
    }
    render();
  }

  form.addEventListener('change', () => update(true));
  sort.addEventListener('change', () => update(true));
  query.addEventListener('input', () => update(false));
  search.addEventListener('submit', (event) => event.preventDefault());

  const clear = () => {
    state = { ...EMPTY_STATE, sort: state.sort };
    syncInputs();
    update(true);
  };
  // The reset button clears the checkboxes itself; the query and sort live outside the form.
  form.addEventListener('reset', (event) => {
    event.preventDefault();
    clear();
  });
  need(root, '[data-library-reset]').addEventListener('click', () => {
    clear();
    query.focus();
  });

  window.addEventListener('popstate', () => {
    state = stateFromSearch(location.search);
    syncInputs();
    render();
  });

  syncInputs();
  render();
}
