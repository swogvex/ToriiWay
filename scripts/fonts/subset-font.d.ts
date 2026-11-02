// subset-font ships no type definitions; this covers the call used in subset.ts.
declare module 'subset-font' {
  interface SubsetOptions {
    targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype';
  }
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: SubsetOptions,
  ): Promise<Buffer>;
}
