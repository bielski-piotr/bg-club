import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource/dm-mono/500.css';
import { render } from '@solidjs/web';
import { parseConfig } from './config/env';
import { viewForPath } from './design-system/path';
import { createQueryClient, QueryClientContext } from './lib/queryClient';
import { getSupabase } from './lib/supabase';
import { AppStatus } from './pwa/AppStatus';
import { registerServiceWorker } from './pwa/updates';
import { Root } from './Root';
import { initTheme } from './theme/themeStore';
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

const queryClient = createQueryClient();

render(
  () => (
    <QueryClientContext value={queryClient}>
      <ToastProvider pinned={view === 'app' ? <AppStatus /> : undefined}>
        <Root config={config} view={view} />
      </ToastProvider>
    </QueryClientContext>
  ),
  root,
);
