import { describe, expect, it } from 'vitest';
import { parseConfig } from './env';

describe('parseConfig', () => {
  it('akceptuje poprawną konfigurację i usuwa końcowy ukośnik', () => {
    expect(
      parseConfig({
        VITE_SUPABASE_URL: ' https://abc.supabase.co/ ',
        VITE_SUPABASE_ANON_KEY: 'klucz',
      }),
    ).toEqual({
      ok: true,
      config: { supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'klucz' },
    });
  });

  it('zgłasza wszystkie brakujące zmienne', () => {
    expect(parseConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '   ' })).toEqual({
      ok: false,
      issues: [{ kind: 'missing', names: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] }],
    });
  });

  it('odrzuca adres bez http(s)', () => {
    expect(
      parseConfig({ VITE_SUPABASE_URL: 'ftp://host', VITE_SUPABASE_ANON_KEY: 'klucz' }),
    ).toEqual({ ok: false, issues: [{ kind: 'invalidUrl', name: 'VITE_SUPABASE_URL' }] });
  });

  it('odrzuca tekst, który nie jest adresem, i zgłasza brak klucza', () => {
    expect(parseConfig({ VITE_SUPABASE_URL: 'localhost' })).toEqual({
      ok: false,
      issues: [
        { kind: 'missing', names: ['VITE_SUPABASE_ANON_KEY'] },
        { kind: 'invalidUrl', name: 'VITE_SUPABASE_URL' },
      ],
    });
  });
});
