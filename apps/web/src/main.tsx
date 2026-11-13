import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource/dm-mono/500.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseConfig } from './config/env';
import { viewForPath } from './design-system/path';
import { createQueryClient } from './lib/queryClient';
import { getSupabase } from './lib/supabase';
import { Root } from './Root';
import { initTheme } from './theme/useTheme';
import { ToastProvider } from './ui/Toast';
import './styles.css';

initTheme();

const view = viewForPath(window.location.pathname);
const config = parseConfig(import.meta.env);
if (view === 'app' && config.ok) getSupabase(config.config);

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root w index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <Root config={config} view={view} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
