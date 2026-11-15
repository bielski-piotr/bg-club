import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { isSecretKey } from './src/config/secretKey';
import { pwaPlugin } from './src/pwa/plugin';

export default defineConfig(({ mode }) => {
  // Vite wbudowuje zmienne VITE_* w publiczny bundel. Sekretny klucz serwera w miejscu klucza
  // anon zatrzymuje build, zanim trafi do plików JS (NFR-9, PRD §6.1).
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  if (isSecretKey(env.VITE_SUPABASE_ANON_KEY ?? '')) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY zawiera sekretny klucz serwera (service_role). ' +
        'Wpisz klucz publiczny (anon / publishable).',
    );
  }

  return {
    // Service worker powłoki (NFR-3): `dist/sw.js` z listą plików tego buildu.
    plugins: [react(), pwaPlugin(new URL('./src/pwa/sw.js', import.meta.url).pathname)],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: { target: 'es2022', sourcemap: true },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      // Test kontrastu czyta tokeny jako tekst (`tokens.css?raw`).
      css: { include: [/tokens\.css/] },
    },
  };
});
