import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.ts?raw';
import { ENV_SUPABASE_ANON_KEY, ENV_SUPABASE_URL } from './env';

// Klucz service_role nie trafia do SPA (PRD §6.1, NFR-9). Vite wbudowuje w bundel tylko
// zmienne z prefiksem VITE_, więc pilnujemy, żeby kod czytał wyłącznie dwie publiczne
// zmienne i żeby nikt nie poszerzył prefiksu w konfiguracji Vite.
const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(sources).map(([path, text]) => ({ path, text }));

describe('sekrety poza SPA', () => {
  it('skanuje kod aplikacji', () => {
    expect(files.map(({ path }) => path)).toContain('../main.tsx');
  });

  it('kod aplikacji odwołuje się tylko do publicznych zmiennych środowiskowych', () => {
    const names = new Set(files.flatMap(({ text }) => text.match(/\bVITE_[A-Z0-9_]+/g) ?? []));
    expect([...names].sort()).toEqual([ENV_SUPABASE_ANON_KEY, ENV_SUPABASE_URL].sort());
  });

  it('kod aplikacji nie czyta zmiennych z kluczem serwera', () => {
    const offenders = files
      .filter(({ text }) => /SERVICE_ROLE|SUPABASE_SECRET|sb_secret_[A-Za-z0-9]/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('konfiguracja Vite nie poszerza prefiksu zmiennych wbudowywanych w bundel', () => {
    expect(viteConfig).not.toMatch(/envPrefix/);
  });
});
