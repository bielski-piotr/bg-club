import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource/dm-mono/500.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseConfig } from './config/env';
import { viewForPath } from './lib/path';
import { createQueryClient } from './lib/queryClient';
import { getSupabase } from './lib/supabase';
import { AppStatus } from './pwa/AppStatus';
import { registerServiceWorker } from './pwa/updates';
import { Root } from './Root';
import { initTheme } from './theme/useTheme';
import { ToastProvider } from './ui/Toast';
import './styles.css';

initTheme();

const view = viewForPath(window.location.pathname);
const config = parseConfig(import.meta.env);
if (view === 'app' && config.ok) getSupabase(config.config);

// Service worker powłoki tylko w buildzie; w `vite dev` pliki zmieniają się na bieżąco.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerServiceWorker().catch(() => {
      // Bez service workera aplikacja działa dalej, tylko bez instalacji i cache powłoki.
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root w index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider pinned={view === 'app' ? <AppStatus /> : null}>
        <Root config={config} view={view} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
