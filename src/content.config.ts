import { defineCollection } from 'astro:content';
import { contentGlob } from './lib/content/loader';

import {
  communitySchema,
  fortunesSchema,
  gameListSchema,
  guideSchema,
  jlptMondaiSchema,
  kanaScriptSchema,
  librarySchema,
  playlistsSchema,
  siteSchema,
  videoSchema,
} from './lib/content/schemas';

const base = './src/content';

const guides = defineCollection({
  loader: contentGlob('{en,es}/**/*.md', `${base}/guides`),
  schema: guideSchema,
});

const kana = defineCollection({
  loader: contentGlob('*.yaml', `${base}/kana`),
  schema: kanaScriptSchema,
});

const library = defineCollection({
  loader: contentGlob('{en,es}/**/*.md', `${base}/library`),
  schema: librarySchema,
});

const videos = defineCollection({
  loader: contentGlob('*.yaml', `${base}/videos`),
  schema: videoSchema,
});

const community = defineCollection({
  loader: contentGlob('discord.yaml', `${base}/community`),
  schema: communitySchema,
});

const playlists = defineCollection({
  loader: contentGlob('playlists.yaml', `${base}/community`),
  schema: playlistsSchema,
});

const jlpt = defineCollection({
  loader: contentGlob('**/*.yaml', `${base}/jlpt`),
  schema: jlptMondaiSchema,
});

const game = defineCollection({
  loader: contentGlob('**/*.yaml', `${base}/game`),
  schema: gameListSchema,
});

const site = defineCollection({
  loader: contentGlob('{en,es}/*.yaml', `${base}/site`),
  schema: siteSchema,
});

// One file next to the site copy, but its own collection: the site loader reads {en,es}/*.yaml.
const fortunes = defineCollection({
  loader: contentGlob('404-fortunes.yaml', `${base}/site`),
  schema: fortunesSchema,
});

export const collections = {
  guides,
  kana,
  library,
  videos,
  community,
  playlists,
  jlpt,
  game,
  site,
  fortunes,
};
