import { defineConfig } from 'vitest/config';

/**
 * Testy integracyjne na lokalnym Supabase (`pnpm db:start`, potem `pnpm test:auth`).
 * Wymagają pustej bazy (`pnpm db:reset`): sprawdzają bootstrap od zera, a konta
 * administratora nie da się potem usunąć.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
