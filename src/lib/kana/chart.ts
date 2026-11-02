export const CHART_GROUPS = ['gojuon', 'dakuten', 'yoon'] as const;
export type ChartGroup = (typeof CHART_GROUPS)[number];

/** The fields of a kana entry (src/content/kana) the chart layout needs. */
export interface ChartKana {
  char: string;
  row: string;
  vowel: string;
  group: string;
}

export interface ChartRow<T extends ChartKana> {
  /** Row key: the consonant row, or `nn` for the row that holds ん. */
  key: string;
  /** One entry per column; null where the row has no kana (yi, ye, wu…). */
  cells: (T | null)[];
}

export interface Chart<T extends ChartKana> {
  columns: string[];
  rows: ChartRow<T>[];
}

const COLUMNS: Record<ChartGroup, string[]> = {
  gojuon: ['a', 'i', 'u', 'e', 'o'],
  dakuten: ['a', 'i', 'u', 'e', 'o'],
  yoon: ['a', 'u', 'o'],
};

// Handakuten (ぱ row) shares the dakuten table.
const GROUPS: Record<ChartGroup, string[]> = {
  gojuon: ['gojuon'],
  dakuten: ['dakuten', 'handakuten'],
  yoon: ['yoon'],
};

/**
 * Arranges one group of kana into chart rows, in the order rows first appear. ん has
 * its own vowel (`n`), so it gets a final row of its own, in the first column.
 */
export function buildChart<T extends ChartKana>(items: readonly T[], group: ChartGroup): Chart<T> {
  const columns = COLUMNS[group];
  const rows = new Map<string, ChartRow<T>>();
  for (const kana of items) {
    if (!GROUPS[group].includes(kana.group)) continue;
    const key = kana.vowel === 'n' ? 'nn' : kana.row;
    const column = kana.vowel === 'n' ? 0 : columns.indexOf(kana.vowel);
    if (column < 0) throw new Error(`${kana.char}: vowel ${kana.vowel} is not a ${group} column`);
    let row = rows.get(key);
    if (!row) {
      row = { key, cells: columns.map(() => null) };
      rows.set(key, row);
    }
    row.cells[column] = kana;
  }
  return { columns, rows: [...rows.values()] };
}
