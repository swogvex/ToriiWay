// Server-side community data with small in-memory caches (12-spec-community): Discord counts
// for 10 minutes, the YouTube feed and playlists for an hour. A failed fetch keeps the last
// good value; with none, the counts are hidden and the video list is empty.

import { type DiscordCounts, inviteCode, inviteUrl, parseInvite } from './discord';
import { feedUrl, parseFeed, parsePlaylistIds, type Video } from './youtube';

export const DISCORD_TTL_MS = 10 * 60 * 1000;
export const YOUTUBE_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

export type Category = 'kana' | 'grammar' | 'jlpt' | 'vocabulary' | 'other';

export interface CategorisedVideo extends Video {
  category: Category;
  featured: boolean;
}

/** Per-video overrides from src/content/videos (category, featured, title). */
export interface VideoOverride {
  id: string;
  category: Category;
  featured: boolean;
  title?: string;
}

export interface CommunitySources {
  fetch: typeof fetch;
  now: () => number;
}

interface Entry<T> {
  value: T;
  at: number;
}

/** A value refreshed after `ttl`; on failure the stale value is kept. */
export function cached<T>(ttl: number, load: () => Promise<T>, empty: T) {
  let entry: Entry<T> | null = null;
  let pending: Promise<T> | null = null;
  return async (now: number): Promise<T> => {
    if (entry && now - entry.at < ttl) return entry.value;
    pending ??= load()
      .then((value) => {
        entry = { value, at: now };
        return value;
      })
      .catch((error: unknown) => {
        console.warn('[community] fetch failed', error instanceof Error ? error.message : error);
        return entry?.value ?? empty;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

async function getText(sources: CommunitySources, url: string): Promise<string> {
  const response = await sources.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

export function discordCounts(sources: CommunitySources, invite: string) {
  const code = inviteCode(invite);
  return cached<DiscordCounts | null>(
    DISCORD_TTL_MS,
    async () => {
      if (!code) return null;
      const counts = parseInvite(JSON.parse(await getText(sources, inviteUrl(code))) as unknown);
      if (!counts) throw new Error('invite without counts');
      return counts;
    },
    null,
  );
}

/**
 * Channel videos with a category: the video override wins, then the first playlist that
 * contains the video, then "other".
 */
export function channelVideos(
  sources: CommunitySources,
  channelId: string,
  playlists: readonly { id: string; category: Category }[],
  overrides: readonly VideoOverride[],
) {
  return cached<CategorisedVideo[]>(YOUTUBE_TTL_MS, async () => {
    const [feed, ...lists] = await Promise.all([
      getText(sources, feedUrl(`channel_id=${encodeURIComponent(channelId)}`)),
      ...playlists.map((list) =>
        getText(sources, feedUrl(`playlist_id=${encodeURIComponent(list.id)}`)).catch(() => ''),
      ),
    ]);
    const latest = parseFeed(feed);
    if (latest.length === 0 && !feed.includes('<feed')) throw new Error('not a feed');
    // The channel feed holds only the 15 newest videos; playlist feeds add older ones
    // (e.g. the hiragana course), so every category tab has something to show.
    // Playlists left over from a previous channel add nothing.
    const videos = mergeVideos([latest, ...lists.map((list) => parseFeed(list ?? '', channelId))]);
    return categorise(
      videos,
      playlists.map((list, index) => ({
        category: list.category,
        ids: new Set(parsePlaylistIds(lists[index] ?? '')),
      })),
      overrides,
    );
  }, []);
}

/** All videos once (first copy wins), newest first. */
export function mergeVideos(feeds: readonly (readonly Video[])[]): Video[] {
  const byId = new Map<string, Video>();
  for (const feed of feeds)
    for (const video of feed) if (!byId.has(video.id)) byId.set(video.id, video);
  return [...byId.values()].sort((a, b) => b.published.localeCompare(a.published));
}

export function categorise(
  videos: readonly Video[],
  playlists: readonly { category: Category; ids: ReadonlySet<string> }[],
  overrides: readonly VideoOverride[],
): CategorisedVideo[] {
  const byId = new Map(overrides.map((override) => [override.id, override]));
  return videos.map((video) => {
    const override = byId.get(video.id);
    const fromList = playlists.find((list) => list.ids.has(video.id))?.category;
    return {
      ...video,
      title: override?.title ?? video.title,
      category: override?.category ?? fromList ?? 'other',
      featured: override?.featured ?? false,
    };
  });
}
