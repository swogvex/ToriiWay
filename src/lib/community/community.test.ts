import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { inviteCode, parseInvite } from './discord';
import { toPublic } from './public';
import {
  cached,
  categorise,
  channelVideos,
  type CommunitySources,
  discordCounts,
  DISCORD_TTL_MS,
  mergeVideos,
} from './source';
import { decodeXml, parseFeed } from './youtube';

const FEED = readFileSync(new URL('./fixture-feed.xml', import.meta.url), 'utf8');

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('YouTube feed', () => {
  it('reads every video of the channel feed, newest first', () => {
    const videos = parseFeed(FEED);
    expect(videos).toHaveLength(15);
    expect(videos[0]).toMatchObject({ id: '4O7tdiVWwF0', title: 'Noche libre' });
    expect(videos.every((video) => /^[\w-]{11}$/.test(video.id))).toBe(true);
    expect(videos.some((video) => video.short)).toBe(true);
  });

  it('decodes XML entities', () => {
    expect(decodeXml('Tom &amp; Jerry &#39;n&#x27; &lt;3 &quot;')).toBe(`Tom & Jerry 'n' <3 "`);
  });
});

describe('Discord invite', () => {
  it('reads the code and the counts', () => {
    expect(inviteCode('https://discord.gg/PkQt42bDtk')).toBe('PkQt42bDtk');
    expect(inviteCode('https://example.com/x')).toBeNull();
    expect(parseInvite({ approximate_member_count: 715, approximate_presence_count: 81 })).toEqual({
      members: 715,
      online: 81,
    });
    expect(parseInvite({ message: 'Unknown Invite' })).toBeNull();
  });
});

describe('caches', () => {
  it('refreshes after the TTL and keeps the stale value when a refresh fails', async () => {
    let calls = 0;
    let fail = false;
    const get = cached(
      1000,
      async () => {
        calls += 1;
        if (fail) throw new Error('down');
        return calls;
      },
      0,
    );
    expect(await get(0)).toBe(1);
    expect(await get(500)).toBe(1);
    expect(await get(1500)).toBe(2);
    fail = true;
    expect(await get(3000)).toBe(2);
  });

  it('hides the Discord counts when Discord never answered', async () => {
    const sources: CommunitySources = {
      fetch: vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch,
      now: () => 0,
    };
    expect(await discordCounts(sources, 'https://discord.gg/PkQt42bDtk')(0)).toBeNull();
  });

  it('asks Discord at most once per 10 minutes', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ approximate_member_count: 715, approximate_presence_count: 81 }),
        ),
    );
    const get = discordCounts(
      { fetch: fetcher as unknown as typeof fetch, now: () => 0 },
      'https://discord.gg/PkQt42bDtk',
    );
    await get(0);
    await get(DISCORD_TTL_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await get(DISCORD_TTL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('categories', () => {
  const feed = parseFeed(FEED);
  const video = (index: number) => {
    const found = feed[index];
    if (!found) throw new Error(`fixture has no video ${index}`);
    return found;
  };
  const [first, second, third] = [video(0), video(1), video(2)];

  it('uses the override, then the playlist, then "other"', () => {
    const videos = categorise(
      [first, second, third],
      [{ category: 'kana', ids: new Set([second.id]) }],
      [{ id: first.id, category: 'jlpt', featured: true, title: 'Custom' }],
    );
    expect(videos.map((video) => [video.category, video.featured])).toEqual([
      ['jlpt', true],
      ['kana', false],
      ['other', false],
    ]);
    expect(videos[0]?.title).toBe('Custom');
  });

  it('builds the list from the channel and playlist feeds', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('playlist_id')
        ? new Response(`<feed><entry><yt:videoId>${second.id}</yt:videoId></entry></feed>`)
        : new Response(FEED),
    );
    const videos = await channelVideos(
      { fetch: fetcher as unknown as typeof fetch, now: () => 0 },
      [{ id: 'PLx', category: 'kana' }],
      [],
    )(0);
    expect(videos).toHaveLength(15);
    expect(videos.find((video) => video.id === second.id)?.category).toBe('kana');
  });
});

describe('toPublic', () => {
  it('sends only what the cards need (no descriptions)', () => {
    const [video] = categorise(parseFeed(FEED).slice(0, 1), [], []);
    if (!video) throw new Error('fixture without videos');
    const payload = toPublic({ discord: { members: 3, online: 1 }, videos: [video] });
    expect(payload.discord).toEqual({ members: 3, online: 1 });
    expect(Object.keys(payload.videos[0] ?? {}).sort()).toEqual([
      'category',
      'featured',
      'id',
      'published',
      'short',
      'title',
    ]);
  });
});

describe('mergeVideos', () => {
  it('adds older playlist videos once, newest first', () => {
    const [a, b, c] = parseFeed(FEED);
    if (!a || !b || !c) throw new Error('fixture too short');
    const old = { ...c, id: 'oldVideo001', published: '2020-01-01T00:00:00+00:00' };
    const merged = mergeVideos([[a, b], [b, old], [a]]);
    expect(merged.map((video) => video.id)).toEqual([a.id, b.id, old.id]);
  });
});
