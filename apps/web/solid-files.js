/**
 * Kod Solid 2.0 w czasie migracji z Reacta (docs/solidjs-2-migration.md): katalogi `apps/web/src`,
 * których pliki kompiluje `@solidjs/vite-plugin` (a nie `@vitejs/plugin-react`) i sprawdza
 * `eslint-plugin-solid`. Zmigrowany obszar dopisujemy tutaj; pliki `.tsx` w tych katalogach zaczynają
 * się od `/** @jsxImportSource @solidjs/web *\/` (typy JSX), co sprawdza `src/config/solid-files.test.ts`.
 */
export const SOLID_DIRS = [
  'solid',
  'members',
  'profile',
  'leaderboard',
  'games',
  'sheets',
  'score-pad',
  'meetings',
  'club',
];

const dirs = SOLID_DIRS.join('|');

/**
 * Moduły Solid (identyfikatory Vite: ścieżka bezwzględna). Bez zapytań: `?raw` itp. to tekst pliku,
 * nie kod do kompilacji.
 */
export const SOLID_FILE = new RegExp(
  String.raw`[\\/]apps[\\/]web[\\/]src[\\/](?:${dirs})[\\/][^?]*\.[jt]sx?$`,
);

/** Te same pliki jako globy ESLint (względem korzenia repo). */
export const SOLID_GLOBS = SOLID_DIRS.map((dir) => `apps/web/src/${dir}/**/*.{ts,tsx}`);
