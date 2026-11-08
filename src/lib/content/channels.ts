import { getEntry } from 'astro:content';

/** The YouTube channel and Discord server from src/content/community/channels.yaml. */
export async function getChannels() {
  const entry = await getEntry('channels', 'channels');
  if (!entry) throw new Error('Missing src/content/community/channels.yaml');
  const { youtubeChannelId, youtubeHandle, discordInvite } = entry.data;
  return {
    youtubeChannelId,
    youtubeHandle,
    youtubeUrl: `https://www.youtube.com/${youtubeHandle}`,
    discordInvite,
  };
}
