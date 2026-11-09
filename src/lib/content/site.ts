import { getCollection } from 'astro:content';

import { DEFAULT_LOCALE, type Locale } from '../../i18n';
import { getChannels } from './channels';

/** Site copy for a locale, falling back to English until the translation exists. */
export async function getSiteCopy(locale: Locale) {
  // getCollection, not getEntry: a missing translation is expected and getEntry warns on it.
  const entries = await getCollection('site');
  const translation = entries.find((candidate) => candidate.id === `${locale}/home`);
  const entry = translation ?? entries.find(({ id }) => id === `${DEFAULT_LOCALE}/home`);
  if (!entry) throw new Error(`Missing src/content/site/${DEFAULT_LOCALE}/home.yaml`);
  const channels = await getChannels();
  return {
    ...entry.data,
    translated: translation !== undefined,
    video: {
      ...entry.data.video,
      // Without a channel, "YouTube · {handle}" is just "YouTube".
      kicker: channels.youtubeHandle
        ? entry.data.video.kicker.replace('{handle}', channels.youtubeHandle)
        : entry.data.video.kicker.replace(/\s*·?\s*\{handle\}/, ''),
    },
    social: {
      // Before the rest: the footer shows the icons in this order.
      discord: channels.discordInvite ?? undefined,
      youtube: channels.youtubeUrl ?? undefined,
      ...entry.data.social,
    },
  };
}
