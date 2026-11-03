// UI strings passed by src/pages/jlpt/run.astro as JSON, with {placeholders}.

export type Labels = (key: string, params?: Record<string, string | number>) => string;

export function readLabels(json: string | undefined): Labels {
  let table: Record<string, string> = {};
  try {
    table = json ? (JSON.parse(json) as Record<string, string>) : {};
  } catch {
    table = {};
  }
  return (key, params = {}) =>
    (table[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
}
