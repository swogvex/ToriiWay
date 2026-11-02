export default {
  plugins: ['prettier-plugin-astro'],
  singleQuote: true,
  printWidth: 100,
  endOfLine: 'lf',
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};
