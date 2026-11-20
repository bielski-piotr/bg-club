import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tryb „turnkey”: bez index.html i pliku startowego. Wtyczka składa wejście z src/App.tsx
  // i powłoki src/Document.tsx, a `vite build` prerenderuje statyczną powłokę do dist/client.
  plugins: [solid({ start: true, diagnostics: true })],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
