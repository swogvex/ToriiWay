export interface RubySegment {
  text: string;
  reading?: string;
}

/**
 * Parses the bracket furigana used in content YAML: `一緒[いっしょ]に` → 一緒 with いっしょ, then に.
 * A reading attaches to the run of kanji right before it.
 */
export function parseRuby(source: string): RubySegment[] {
  const segments: RubySegment[] = [];
  const pattern = /([\p{Script=Han}々]+)\[([^\]]+)\]/gu;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: source.slice(last, match.index) });
    segments.push({ text: match[1] ?? '', reading: match[2] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last) });
  return segments;
}

/** The text without readings, e.g. for aria-free contexts and titles. */
export function stripRuby(source: string): string {
  return parseRuby(source)
    .map((segment) => segment.text)
    .join('');
}
