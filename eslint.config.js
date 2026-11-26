import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import solid from 'eslint-plugin-solid/configs/v2';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'supabase/.temp/**',
      // Edge Functions działają w Deno: lint i typy przez `deno` (CI).
      'supabase/functions/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['apps/web/src/**/*.{ts,tsx}'], ...solid },
  {
    // Szablon service workera: kontekst workera, nie okna.
    files: ['apps/web/src/pwa/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // Źródła notesu i edytora przeniesione z POC: bez przepisywania stylu kodu.
    files: ['packages/score-pad/src/core/**/*.ts', 'packages/score-pad/src/editor/**/*.ts'],
    rules: {
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
  prettier,
);
