import { getEntry } from 'astro:content';

import { DEFAULT_LOCALE, type Locale } from '../../i18n';
import { getChannels } from './channels';

/** Site copy for a locale, falling back to English until the translation exists. */
export async function getSiteCopy(locale: Locale) {
  const entry =
    (await getEntry('site', `${locale}/home`)) ??
    (await getEntry('site', `${DEFAULT_LOCALE}/home`));
  if (!entry) throw new Error(`Missing src/content/site/${DEFAULT_LOCALE}/home.yaml`);
  const channels = await getChannels();
  return {
    ...entry.data,
    video: {
      ...entry.data.video,
      kicker: entry.data.video.kicker.replace('{handle}', channels.youtubeHandle),
    },
    social: {
      ...entry.data.social,
      discord: channels.discordInvite,
      youtube: channels.youtubeUrl,
    },
  };
}
