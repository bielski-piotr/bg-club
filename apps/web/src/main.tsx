import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { parseConfig } from './config/env';
import { createQueryClient } from './lib/queryClient';
import { getSupabase } from './lib/supabase';
import './styles.css';

const config = parseConfig(import.meta.env);
if (config.ok) getSupabase(config.config);

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root w index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <App config={config} />
    </QueryClientProvider>
  </StrictMode>,
);
