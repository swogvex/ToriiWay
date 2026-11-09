// The community data the pages and /api/community share: content from src/content/community
// and src/content/videos, joined with the cached Discord and YouTube sources (source.ts).
// Server only (build time and API routes); the browser reads it through /api/community.

import { getCollection, getEntry } from 'astro:content';

import { getChannels } from '../content/channels';
import type { DiscordCounts } from './discord';
import type { CommunityData } from './public';
import {
  type CategorisedVideo,
  channelVideos,
  type CommunitySources,
  discordCounts,
  type VideoOverride,
} from './source';

let loaders: {
  discord: (now: number) => Promise<DiscordCounts | null>;
  videos: (now: number) => Promise<CategorisedVideo[]>;
} | null = null;

async function init(sources: CommunitySources) {
  const [channels, playlists, overrides] = await Promise.all([
    getChannels(),
    getEntry('playlists', 'playlists'),
    getCollection('videos'),
  ]);
  const videoOverrides: VideoOverride[] = overrides.map(({ data }) => ({
    id: data.id,
    category: data.category,
    featured: data.featured,
    ...(data.title ? { title: data.title.en } : {}),
  }));
  return {
    // No channel yet: nothing to ask Discord or YouTube for.
    discord: channels.discordInvite
      ? discordCounts(sources, channels.discordInvite)
      : () => Promise.resolve(null),
    videos: channels.youtubeChannelId
      ? channelVideos(
          sources,
          channels.youtubeChannelId,
          playlists?.data.playlists ?? [],
          videoOverrides,
        )
      : () => Promise.resolve([]),
  };
}

/** Counts and videos; each part is cached and keeps its last good value on failure. */
export async function communityData(
  sources: CommunitySources = { fetch: globalThis.fetch.bind(globalThis), now: Date.now },
): Promise<CommunityData> {
  loaders ??= await init(sources);
  const now = sources.now();
  const [discord, videos] = await Promise.all([loaders.discord(now), loaders.videos(now)]);
  return { discord, videos };
}
