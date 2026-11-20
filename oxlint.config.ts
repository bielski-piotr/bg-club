import { defineConfig } from 'oxlint';
import solidV2 from 'eslint-plugin-solid/configs/v2';

// Reguły Solid 2.0 (eslint-plugin-solid) uruchamiane w oxlint, bo typescript-eslint
// nie obsługuje jeszcze TypeScript 7.
export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'import'],
  jsPlugins: ['eslint-plugin-solid'],
  ignorePatterns: ['**/dist/**', '**/coverage/**', '**/*.gen.*'],
  settings: solidV2.settings,
  rules: {
    ...solidV2.rules,
    'typescript/consistent-type-imports': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
});
