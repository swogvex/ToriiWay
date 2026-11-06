// The /api/community payload: only what the cards need, safe to send to the browser.

import type { DiscordCounts } from './discord';
import type { CategorisedVideo } from './source';

export interface CommunityData {
  discord: DiscordCounts | null;
  videos: CategorisedVideo[];
}

export interface PublicVideo {
  id: string;
  title: string;
  published: string;
  category: CategorisedVideo['category'];
  featured: boolean;
  short: boolean;
}

export interface CommunityPayload {
  discord: DiscordCounts | null;
  videos: PublicVideo[];
}

export function toPublic(data: CommunityData): CommunityPayload {
  return {
    discord: data.discord,
    videos: data.videos.map(({ id, title, published, category, featured, short }) => ({
      id,
      title,
      published,
      category,
      featured,
      short,
    })),
  };
}
