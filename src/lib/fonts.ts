/**
 * Secondary font faces, registered after the page's load event. Only the UI regular and
 * bold live in fonts.css (preloaded); with these in the CSS too, the browser fetched
 * ~80 KB of fonts on the critical path and the h1 (the LCP) missed the 1.8s budget on
 * mobile 4G. Registered faces still download lazily: only when text uses them.
 * Until then, and without JS, the fallback stacks in tokens.css apply.
 */
const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

interface LateFace {
  family: string;
  weight: string;
  file: string;
  unicodeRange?: string;
}

const LATE_FACES: readonly LateFace[] = [
  {
    family: 'Schibsted Grotesk',
    weight: '500',
    file: 'schibsted-grotesk-latin-500-normal',
    unicodeRange: LATIN,
  },
  {
    family: 'Schibsted Grotesk',
    weight: '500',
    file: 'schibsted-grotesk-latin-ext-500-normal',
    unicodeRange: LATIN_EXT,
  },
  {
    family: 'IBM Plex Mono',
    weight: '400',
    file: 'ibm-plex-mono-latin-400-normal',
    unicodeRange: LATIN,
  },
  {
    family: 'IBM Plex Mono',
    weight: '400',
    file: 'ibm-plex-mono-latin-ext-400-normal',
    unicodeRange: LATIN_EXT,
  },
  {
    family: 'IBM Plex Mono',
    weight: '500',
    file: 'ibm-plex-mono-latin-500-normal',
    unicodeRange: LATIN,
  },
  {
    family: 'IBM Plex Mono',
    weight: '500',
    file: 'ibm-plex-mono-latin-ext-500-normal',
    unicodeRange: LATIN_EXT,
  },
  // Japanese display subset: kana blocks + display kanji (scripts/fonts/subset.ts).
  { family: 'Zen Kaku Gothic New Display', weight: '400', file: 'zen-kaku-gothic-new-display-400' },
  { family: 'Zen Kaku Gothic New Display', weight: '700', file: 'zen-kaku-gothic-new-display-700' },
];

function registerLateFonts(): void {
  for (const { family, weight, file, unicodeRange } of LATE_FACES) {
    const face = new FontFace(family, `url(/fonts/${file}.woff2) format('woff2')`, {
      weight,
      display: 'swap',
      ...(unicodeRange && { unicodeRange }),
    });
    document.fonts.add(face);
  }
}

export function loadLateFonts(): void {
  if (document.readyState === 'complete') registerLateFonts();
  else addEventListener('load', registerLateFonts, { once: true });
}
