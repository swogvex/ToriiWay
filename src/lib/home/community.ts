// Home community row (12-spec-community, Home integration): plays the latest video in the
// shared player and refreshes the card and the Discord member count from /api/community.

import { initPlayer } from '../community/player';
import type { CommunityPayload } from '../community/public';
import type { Category } from '../community/source';
import { CATEGORY_GLYPH, formatDate, latestVideo, watchUrl } from '../community/videos';

interface IslandData {
  locale: string;
  members: string;
  categories: Record<Category, string>;
}

export function initHomeCommunity(root: HTMLElement): void {
  const data = JSON.parse(root.dataset.island ?? '{}') as IslandData;
  initPlayer(root);
  void refresh(root, data);
}

async function refresh(root: HTMLElement, data: IslandData): Promise<void> {
  let payload: CommunityPayload;
  try {
    const response = await fetch('/api/community', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    payload = (await response.json()) as CommunityPayload;
  } catch {
    return;
  }

  const members = root.querySelector<HTMLElement>('[data-home-members]');
  if (members && payload.discord) {
    const count = new Intl.NumberFormat(data.locale).format(payload.discord.members);
    members.textContent = `· ${data.members.replace('{count}', count)}`;
    members.hidden = false;
  }

  // Only a card that already plays videos is updated (it has the player next to it).
  const card = root.querySelector<HTMLAnchorElement>('[data-home-video]');
  const latest = latestVideo(payload.videos);
  if (!card || !latest || card.dataset.videoId === latest.id) return;
  card.dataset.videoId = latest.id;
  card.href = watchUrl(latest.id, latest.short);
  card
    .querySelector('[aria-hidden][data-glyph]')
    ?.setAttribute('data-glyph', CATEGORY_GLYPH[latest.category]);
  const title = card.querySelector('[data-video-title]');
  if (title) title.textContent = latest.title;
  const meta = card.querySelector('[data-video-meta]');
  if (meta) {
    meta.textContent = `${data.categories[latest.category]} · ${formatDate(latest.published, data.locale)}`;
  }
}
