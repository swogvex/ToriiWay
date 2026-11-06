import { describe, expect, it } from 'vitest';

import { embedUrl, formatDate, matches, readFilter, tabsFor, watchUrl } from './videos';

const videos = [
  { id: 'a', category: 'other' as const },
  { id: 'b', category: 'kana' as const },
  { id: 'c', category: 'other' as const },
];

describe('video tabs', () => {
  it('offers "all" plus the categories that have videos, in tab order', () => {
    expect(tabsFor(videos)).toEqual(['all', 'kana', 'other']);
    expect(tabsFor([])).toEqual(['all']);
  });

  it('reads the filter from the URL and ignores unknown or empty categories', () => {
    const tabs = tabsFor(videos);
    expect(readFilter('kana', tabs)).toBe('kana');
    expect(readFilter('grammar', tabs)).toBe('all');
    expect(readFilter('<script>', tabs)).toBe('all');
    expect(readFilter(null, tabs)).toBe('all');
  });

  it('filters by category', () => {
    expect(videos.filter((video) => matches(video, 'other')).map((v) => v.id)).toEqual(['a', 'c']);
    expect(videos.filter((video) => matches(video, 'all'))).toHaveLength(3);
  });
});

describe('video links', () => {
  it('embeds with youtube-nocookie and links shorts to /shorts', () => {
    expect(embedUrl('Zt0I8ZRm7jU')).toBe(
      'https://www.youtube-nocookie.com/embed/Zt0I8ZRm7jU?autoplay=1&rel=0',
    );
    expect(watchUrl('Zt0I8ZRm7jU')).toBe('https://www.youtube.com/watch?v=Zt0I8ZRm7jU');
    expect(watchUrl('Zt0I8ZRm7jU', true)).toBe('https://www.youtube.com/shorts/Zt0I8ZRm7jU');
  });

  it('formats dates per locale and survives a broken one', () => {
    expect(formatDate('2026-04-20T10:00:00+00:00', 'en')).toBe('Apr 20, 2026');
    expect(formatDate('2026-04-20T10:00:00+00:00', 'es')).toMatch(/^20 abr 2026$/);
    expect(formatDate('not a date', 'en')).toBe('');
  });
});
