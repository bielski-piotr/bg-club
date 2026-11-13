import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { parseConfig } from './config/env';

describe('App', () => {
  it('pokazuje ekran startowy przy poprawnej konfiguracji', () => {
    render(
      <App
        config={parseConfig({
          VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
          VITE_SUPABASE_ANON_KEY: 'klucz',
        })}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('BG Club');
    expect(screen.getByText('127.0.0.1:54321')).toBeInTheDocument();
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
});
