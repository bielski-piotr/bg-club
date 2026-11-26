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
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'supabase/.temp/**',
      // Edge Functions działają w Deno: lint, typy i testy przez `deno` (CI, README „Edge Functions”).
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
    // Testy Solid czytają sygnały imperatywnie po `flush()` (asercje), poza zakresem śledzenia.
    // Atrapy notesów w kreatorze przekazują uchwyt przez `props.ref` jak prawdziwe widoki.
    files: [
      'apps/web/src/ui/components.test.tsx',
      'apps/web/src/lib/query.test.tsx',
      'apps/web/src/hub/ScorepadWizard.test.tsx',
    ],
    rules: { 'solid/reactivity': 'off' },
  },
  {
    // Szablon service workera (NFR-3): kontekst workera, nie okna.
    files: ['apps/web/src/pwa/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // Źródła notesu i edytora przeniesione z POC (PRD §8.5): bez przepisywania stylu kodu.
    files: ['packages/score-pad/src/core/**/*.ts', 'packages/score-pad/src/editor/**/*.ts'],
    rules: {
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
  prettier,
);
