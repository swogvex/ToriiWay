// YouTube videos from the channel's public RSS feed, read on the server (12-spec-community).
// No API key and no dependency: the Atom feed is small and regular, so a few targeted
// regexes read it. The visitor's browser never contacts YouTube until they press play.

/** @nihongonotorii (owner decision 2026-11-06). */
export const CHANNEL_ID = 'UCOey2A5vOKyiU-RHXjWf4aA';
export const CHANNEL_URL = 'https://www.youtube.com/@nihongonotorii';
export const feedUrl = (query: string) => `https://www.youtube.com/feeds/videos.xml?${query}`;

export interface Video {
  id: string;
  title: string;
  /** ISO date-time. */
  published: string;
  description: string;
  /** Vertical videos (YouTube Shorts) link to /shorts/<id>. */
  short: boolean;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const value =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function tag(xml: string, name: string): string {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1] ?? '').trim() : '';
}

/** Video entries of an Atom feed, newest first (the order YouTube sends them in). */
export function parseFeed(xml: string): Video[] {
  const videos: Video[] = [];
  for (const [, entry = ''] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = tag(entry, 'yt:videoId');
    if (!/^[\w-]{11}$/.test(id)) continue;
    const link = /<link[^>]*href="([^"]+)"/.exec(entry)?.[1] ?? '';
    videos.push({
      id,
      title: tag(entry, 'title'),
      published: tag(entry, 'published'),
      description: tag(entry, 'media:description'),
      short: link.includes('/shorts/'),
    });
  }
  return videos;
}

/** IDs in a playlist feed, for mapping playlists to categories. */
export function parsePlaylistIds(xml: string): string[] {
  return [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map((match) => match[1] ?? '');
}
