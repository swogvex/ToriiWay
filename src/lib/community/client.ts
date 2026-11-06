// The /community island (12-spec-community): category tabs (kept in ?category=), "Show
// more", a refresh from /api/community, the player dialog and the rules disclosure.
// The page works without it: cards are links to YouTube and the counts come from the build.

import type { CommunityPayload, PublicVideo } from './public';
import type { Category } from './source';
import {
  embedUrl,
  type Filter,
  formatDate,
  matches,
  readFilter,
  type VideoFacts,
  watchUrl,
} from './videos';

interface IslandData {
  locale: string;
  page: number;
  glyphs: Record<Category, string>;
  categories: Record<Category, string>;
  members: string;
  online: string;
  play: string;
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

export function initCommunity(root: HTMLElement): void {
  const data = JSON.parse(root.dataset.island ?? '{}') as IslandData;
  const list = root.querySelector<HTMLElement>('[data-video-list]');
  const more = root.querySelector<HTMLButtonElement>('[data-video-more]');
  const template = root.querySelector<HTMLTemplateElement>('[data-video-template]');
  const radios = [...root.querySelectorAll<HTMLInputElement>('input[name="category"]')];
  const dialog = root.querySelector<HTMLDialogElement>('#video-player');
  const frame = root.querySelector<HTMLElement>('[data-player-frame]');
  const heading = root.querySelector<HTMLElement>('#video-player-title');
  const rules = root.querySelector<HTMLDetailsElement>('[data-rules]');

  const tabs = radios.map((radio) => radio.value as Filter);
  let filter = readFilter(new URL(location.href).searchParams.get('category'), tabs);
  let limit = data.page;

  const cards = () => [...(list?.querySelectorAll<HTMLElement>('[data-video]') ?? [])];
  const facts = (card: HTMLElement): VideoFacts => ({
    id: card.dataset.videoId ?? '',
    category: (card.dataset.category ?? 'other') as Category,
  });

  function apply(): void {
    const shown = cards().filter((card) => matches(facts(card), filter));
    for (const card of cards()) card.hidden = true;
    shown.slice(0, limit).forEach((card) => (card.hidden = false));
    if (more) more.hidden = shown.length <= limit;
    for (const radio of radios) radio.checked = radio.value === filter;
  }

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      filter = readFilter(radio.value, tabs);
      limit = data.page;
      const url = new URL(location.href);
      if (filter === 'all') url.searchParams.delete('category');
      else url.searchParams.set('category', filter);
      history.replaceState(history.state, '', url);
      apply();
    });
  }

  more?.addEventListener('click', () => {
    const before = cards().filter((card) => !card.hidden).length;
    limit += data.page;
    apply();
    // The button may now be gone: move focus to the first newly shown video.
    if (more.hidden) {
      cards()
        .filter((card) => !card.hidden)
        [before]?.querySelector<HTMLElement>('[data-video-open]')
        ?.focus();
    }
  });

  // Player: the YouTube iframe exists only while the dialog is open.
  let opener: HTMLElement | null = null;
  list?.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('[data-video-open]');
    const card = link?.closest<HTMLElement>('[data-video]');
    if (!link || !card || !dialog || !frame) return;
    event.preventDefault();
    const title = card.querySelector('[data-video-title]')?.textContent ?? '';
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl(card.dataset.videoId ?? '');
    iframe.title = title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    if (heading) heading.textContent = title;
    frame.replaceChildren(iframe);
    opener = link;
    dialog.showModal();
  });
  dialog?.addEventListener('close', () => {
    frame?.replaceChildren();
    opener?.focus();
    opener = null;
  });

  function markLinks(): void {
    for (const link of root.querySelectorAll<HTMLElement>('[data-video-open]')) {
      link.setAttribute('aria-haspopup', 'dialog');
    }
  }

  // Rules: the "Server rules" button opens the disclosure it points to.
  root.querySelector('[data-rules-open]')?.addEventListener('click', () => {
    if (rules) rules.open = true;
  });
  if (rules && location.hash === '#server-rules') rules.open = true;

  function card(video: PublicVideo): HTMLElement | null {
    const node = template?.content.firstElementChild?.cloneNode(true);
    if (!(node instanceof HTMLElement)) return null;
    node.dataset.videoId = video.id;
    node.dataset.category = video.category;
    node.toggleAttribute('data-short', video.short);
    node.querySelector('a')?.setAttribute('href', watchUrl(video.id, video.short));
    node
      .querySelector<HTMLElement>('[aria-hidden][data-glyph]')
      ?.setAttribute('data-glyph', data.glyphs[video.category]);
    const short = node.querySelector<HTMLElement>('[data-video-short]');
    if (short) short.hidden = !video.short;
    const title = node.querySelector('[data-video-title]');
    if (title) title.textContent = video.title;
    const category = node.querySelector('[data-video-category]');
    if (category) category.textContent = data.categories[video.category];
    const time = node.querySelector('time');
    if (time) {
      time.dateTime = video.published;
      time.textContent = formatDate(video.published, data.locale);
    }
    return node;
  }

  async function refresh(): Promise<void> {
    let payload: CommunityPayload;
    try {
      const response = await fetch('/api/community', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      payload = (await response.json()) as CommunityPayload;
    } catch {
      return;
    }
    const counts = root.querySelector<HTMLElement>('[data-discord-counts]');
    if (payload.discord && counts) {
      const number = new Intl.NumberFormat(data.locale);
      const members = counts.querySelector('[data-discord-members]');
      const online = counts.querySelector('[data-discord-online]');
      if (members)
        members.textContent = fill(data.members, { count: number.format(payload.discord.members) });
      if (online)
        online.textContent = fill(data.online, { count: number.format(payload.discord.online) });
      counts.hidden = false;
    }
    // Rebuild the cards only when the channel has new or different videos.
    const ids = cards()
      .map((item) => item.dataset.videoId)
      .join();
    if (!list || payload.videos.length === 0 || payload.videos.map((v) => v.id).join() === ids)
      return;
    list.replaceChildren(...payload.videos.flatMap((video) => card(video) ?? []));
    markLinks();
    apply();
  }

  markLinks();
  if (more) more.removeAttribute('data-wait');
  apply();
  void refresh();
}
