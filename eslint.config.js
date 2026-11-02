import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist/',
      '.astro/',
      '.vercel/',
      'node_modules/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '.lighthouseci/',
    ],
  },
  tseslint.configs.strict,
  astro.configs.recommended,
  astro.configs['jsx-a11y-strict'],
  {
    files: ['**/*.tsx'],
    ...jsxA11y.flatConfigs.strict,
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
      ],
    },
  },
  {
    // Config files are loaded by tools that require a default export.
    // Ambient module declarations mirror the default export of the package they type.
    files: ['*.config.{js,ts}', '**/*.d.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
