// Renders the JLPT listening scripts with Azure AI Speech, uploads the MP3s to Vercel Blob
// and writes each URL into the question's `audio` field (plus the Test audio clip).
// Files are named by a hash of their SSML, so a rerun only renders new or changed scripts.
// The keys live only in this terminal session, never in a file:
//   $env:AZURE_SPEECH_KEY='…'; $env:AZURE_SPEECH_REGION='…'; $env:BLOB_READ_WRITE_TOKEN='…'
//   pnpm jlpt:audio [id-prefix]

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { put } from '@vercel/blob';
import { parse } from 'yaml';

import en from '../../src/i18n/en.json' with { type: 'json' };
import { audioPath, setAudio, toSsml } from '../../src/lib/jlpt/audio.ts';

const BANK = 'src/content/jlpt';
const TEST_AUDIO = 'src/data/jlpt/test-audio.json';
const key = process.env.AZURE_SPEECH_KEY ?? '';
const region = process.env.AZURE_SPEECH_REGION ?? '';
if (!key || !region || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Set AZURE_SPEECH_KEY, AZURE_SPEECH_REGION and BLOB_READ_WRITE_TOKEN first.');
  process.exit(1);
}
const only = process.argv[2] ?? '';

interface Question {
  id: string;
  audio?: string | null;
  tts?: { script: string } | null;
}

async function synthesize(ssml: string): Promise<ArrayBuffer> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'nihongo-no-torii-audio',
        },
        body: ssml,
      },
    );
    if (response.ok) return response.arrayBuffer();
    // The free tier (F0) throttles with 429 instead of charging: wait and retry.
    if (response.status === 429 && attempt < 6) {
      const seconds = Number(response.headers.get('retry-after')) || 15 * attempt;
      console.log(`  throttled, waiting ${seconds}s`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    throw new Error(`Azure ${response.status}: ${await response.text()}`);
  }
}

/** Renders and uploads one clip unless `current` already points at the same file. */
async function render(id: string, script: string, current: string | null | undefined) {
  const ssml = toSsml(script);
  const path = audioPath(id, ssml);
  if (current?.endsWith(`/${path}`)) return null;
  const blob = await put(path, Buffer.from(await synthesize(ssml)), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'audio/mpeg',
    cacheControlMaxAge: 31_536_000, // the name changes with the content
  });
  console.log(`  ${id} → ${blob.url}`);
  return blob.url;
}

let made = 0;
const files = (await readdir(BANK, { recursive: true })).filter((file) => file.endsWith('.yaml'));
for (const file of files.sort()) {
  const fullPath = join(BANK, file);
  let source = await readFile(fullPath, 'utf8');
  const questions = ((parse(source) as { questions?: Question[] }).questions ?? []).filter(
    (q) => Boolean(q.tts) && q.id.startsWith(only),
  );
  if (questions.length === 0) continue;
  console.log(file);
  for (const { id, tts, audio } of questions) {
    const url = tts ? await render(id, tts.script, audio) : null;
    if (!url) continue;
    source = setAudio(source, id, url);
    await writeFile(fullPath, source); // after each clip, so a stopped run keeps its progress
    made += 1;
  }
}

if ('test'.startsWith(only)) {
  const current = (JSON.parse(await readFile(TEST_AUDIO, 'utf8')) as { url: string | null }).url;
  const url = await render('test', `N: ${en['jlpt.testAudio.phrase']}`, current);
  if (url) {
    await writeFile(TEST_AUDIO, `${JSON.stringify({ url }, null, 2)}\n`);
    made += 1;
  }
}
console.log(`Done: ${made} new clip(s).`);
