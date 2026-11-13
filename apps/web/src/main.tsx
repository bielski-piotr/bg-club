import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource/dm-mono/500.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseConfig } from './config/env';
import { isDesignSystemPath } from './design-system/path';
import { createQueryClient } from './lib/queryClient';
import { getSupabase } from './lib/supabase';
import { Root } from './Root';
import { initTheme } from './theme/useTheme';
import { ToastProvider } from './ui/Toast';
import './styles.css';

initTheme();

const designSystem = isDesignSystemPath(window.location.pathname);
const config = parseConfig(import.meta.env);
if (!designSystem && config.ok) getSupabase(config.config);

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root w index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <Root config={config} designSystem={designSystem} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
