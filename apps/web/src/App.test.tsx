import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { parseConfig } from './config/env';

describe('App', () => {
  it('przy poprawnej konfiguracji startuje od ekranu logowania', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App
          config={parseConfig({
            VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
            VITE_SUPABASE_ANON_KEY: 'klucz',
          })}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Zaloguj się');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pokazuje polski komunikat o braku konfiguracji', () => {
    render(<App config={parseConfig({})} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Brak konfiguracji aplikacji',
    );
    expect(
      screen.getByText('Brakujące zmienne: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.'),
    ).toBeInTheDocument();
  });

  it('ostrzega po polsku, gdy zamiast klucza anon podano klucz serwera', () => {
    render(
      <App
        config={parseConfig({
          VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
          VITE_SUPABASE_ANON_KEY: 'sb_secret_przyklad',
        })}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Zmienna VITE_SUPABASE_ANON_KEY zawiera sekretny klucz serwera (service_role). Wpisz klucz publiczny (anon / publishable).',
      ),
    ).toBeInTheDocument();
  });
});
