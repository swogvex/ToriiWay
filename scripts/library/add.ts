// Adds a book to the Library, question by question, and writes
// src/content/library/en/<slug>.md. Usage: pnpm library:add
//
// The owner's tool, so it asks in Spanish. Rules it keeps (11-spec-library): only official
// pages (publisher, official store, institution or open repository), never third-party PDFs;
// the description must be your own words.

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  bookMarkdown,
  DEFAULT_LICENSE,
  isCoverKanji,
  isHttpsUrl,
  type NewBook,
  parseCategories,
  parseEditions,
  parseLevels,
  parseYesNo,
  slugify,
} from '../../src/lib/library/add.ts';

const DIR = join(import.meta.dirname, '..', '..', 'src', 'content', 'library', 'en');
const rl = createInterface({ input: stdin, terminal: stdin.isTTY });
// One line iterator for every answer: unlike rl.question(), it keeps lines that arrive
// before the prompt (pasted answers or piped input).
const lines = rl[Symbol.asyncIterator]();

async function prompt(question: string): Promise<string> {
  stdout.write(question);
  const next = await lines.next();
  if (next.done) {
    console.error('\n✗ Entrada cerrada antes de terminar. No se ha creado nada.');
    process.exit(1);
  }
  return next.value;
}

/** Asks until `parse` accepts the answer; an empty answer takes `fallback` when given. */
async function ask<T>(
  question: string,
  parse: (answer: string) => T | null,
  help: string,
  fallback?: string,
): Promise<T> {
  for (;;) {
    const suffix = fallback === undefined ? '' : ` [${fallback}]`;
    const raw = (await prompt(`${question}${suffix}: `)).trim();
    const value = parse(raw === '' && fallback !== undefined ? fallback : raw);
    if (value !== null) return value;
    console.log(`  ✗ ${help}`);
  }
}

const text = (min: number) => (answer: string) => (answer.length >= min ? answer : null);

/** HEAD first, GET if the server refuses HEAD; any 2xx/3xx counts as working. */
async function urlWorks(url: string): Promise<number> {
  const options = { redirect: 'follow' as const, signal: AbortSignal.timeout(15_000) };
  try {
    let response = await fetch(url, { ...options, method: 'HEAD' });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, { ...options, method: 'GET' });
    }
    return response.status;
  } catch {
    return 0;
  }
}

console.log('\nNuevo libro para la Biblioteca de ToriiWay');
console.log(
  'Solo páginas oficiales (editorial, tienda oficial, institución o repositorio abierto).\n',
);

const title = await ask('Título', text(2), 'Escribe el título del libro.');
const author = await ask('Autor o editorial', text(2), 'Escribe el autor o la editorial.');
const levels = await ask(
  'Niveles (kana, N5, N4, N3, N2, N1; separados por comas)',
  parseLevels,
  'Usa solo: kana, N5, N4, N3, N2, N1.',
);
const categories = await ask(
  'Categorías (vocabulary, reading, listening, kanji, grammar, jlpt)',
  parseCategories,
  'Usa solo: vocabulary, reading, listening, kanji, grammar, jlpt.',
);
const audio = await ask('¿Tiene audio? (s/n)', parseYesNo, 'Responde s o n.', 'n');
const exercises = await ask('¿Tiene ejercicios? (s/n)', parseYesNo, 'Responde s o n.', 'n');
const editions = await ask(
  'Ediciones / idiomas (ja = japonés, en = inglés, es = español)',
  parseEditions,
  'Usa solo: ja, en, es.',
);

let url = '';
for (;;) {
  url = await ask(
    'Enlace oficial (https://…)',
    (answer) => (isHttpsUrl(answer) ? answer : null),
    'Tiene que empezar por https://',
  );
  process.stdout.write('  Comprobando el enlace… ');
  const status = await urlWorks(url);
  if (status >= 200 && status < 400) {
    console.log(`✓ responde (${status})`);
    break;
  }
  console.log(status === 0 ? '✗ no responde' : `✗ responde ${status}`);
  const keep = await ask('¿Usarlo igualmente? (s/n)', parseYesNo, 'Responde s o n.', 'n');
  if (keep) break;
}

const license = await ask('Licencia', text(3), 'Escribe la licencia.', DEFAULT_LICENSE);
const coverKanji = await ask(
  'Kanji de la portada (un solo carácter, p. ej. 文)',
  (answer) => (isCoverKanji(answer) ? answer : null),
  'Escribe un solo carácter.',
);
const featured = await ask('¿Destacado? (s/n)', parseYesNo, 'Responde s o n.', 'n');
const description = await ask(
  'Descripción en inglés (2–4 frases, con tus palabras)',
  text(20),
  'Escribe al menos una frase completa.',
);

let slug = slugify(title);
slug = await ask(
  'Nombre del archivo (slug)',
  (answer) => (/^[a-z0-9-]{2,60}$/.test(answer) ? answer : null),
  'Solo minúsculas, números y guiones.',
  slug,
);
rl.close();

const file = join(DIR, `${slug}.md`);
if (existsSync(file)) {
  console.error(`\n✗ Ya existe ${file}. Elige otro nombre o edita ese archivo.`);
  process.exit(1);
}

const book: NewBook = {
  title,
  author,
  levels,
  categories,
  audio,
  exercises,
  editions,
  url,
  license,
  coverKanji,
  featured,
  description,
};
await writeFile(file, bookMarkdown(book), 'utf8');

console.log(`\n✓ Creado src/content/library/en/${slug}.md`);
console.log('Siguientes pasos:');
console.log('  1. pnpm dev  →  abre http://localhost:4321/library para verlo.');
console.log('  2. Si algo está mal, edita ese archivo (es texto normal).');
console.log('  3. Haz commit y abre un PR (o pídeselo a Claude).\n');
