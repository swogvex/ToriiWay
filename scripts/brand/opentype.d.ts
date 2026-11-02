// opentype.js 2.x ships no type definitions; this covers the calls used in outline-wordmark.ts.
declare module 'opentype.js' {
  interface Path {
    toPathData(options?: { decimalPlaces?: number; flipY?: boolean }): string;
  }
  interface Glyph {
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }
  export interface Font {
    unitsPerEm: number;
    stringToGlyphs(text: string): Glyph[];
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  // CommonJS module: Node only exposes it as a default export.
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
