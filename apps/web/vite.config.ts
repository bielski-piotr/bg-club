import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { isSecretKey } from './src/config/secretKey';
import { pwaPlugin } from './src/pwa/plugin';

/**
 * Połączenie z Supabase (DNS, TLS) zestawiane równolegle z pobieraniem pakietu. Bez
 * poprawnego adresu w buildzie nie dodaje nic (aplikacja i tak pokaże błąd konfiguracji).
 */
function preconnectPlugin(url: string | undefined): Plugin {
  let origin: string | null = null;
  try {
    origin = url ? new URL(url).origin : null;
  } catch {
    origin = null;
  }
  return {
    name: 'bg-club-preconnect',
    transformIndexHtml: () =>
      origin
        ? [
            {
              tag: 'link',
              attrs: { rel: 'preconnect', href: origin, crossorigin: true },
              injectTo: 'head',
            },
          ]
        : [],
  };
}

export default defineConfig(({ mode }) => {
  // Vite wbudowuje zmienne VITE_* w publiczny bundel. Sekretny klucz serwera w miejscu klucza
  // anon zatrzymuje build, zanim trafi do plików JS.
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  if (isSecretKey(env.VITE_SUPABASE_ANON_KEY ?? '')) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY zawiera sekretny klucz serwera (service_role). ' +
        'Wpisz klucz publiczny (anon / publishable).',
    );
  }

  return {
    // Service worker powłoki: `dist/sw.js` z listą plików tego buildu.
    plugins: [
      react(),
      pwaPlugin(fileURLToPath(new URL('./src/pwa/sw.js', import.meta.url))),
      preconnectPlugin(env.VITE_SUPABASE_URL),
    ],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: { target: 'es2022', sourcemap: true },
    test: {
      // Each jsdom worker also loads the lazy popup and scorepad modules. Running
      // all files at once starves async UI assertions on developer machines.
      maxWorkers: 1,
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      // Test kontrastu czyta tokeny jako tekst (`tokens.css?raw`).
      css: { include: [/tokens\.css/] },
    },
  };
});
