import { describe, expect, it } from 'vitest';
import { parseConfig } from './env';
import { isSecretKey } from './secretKey';

/** Token w formacie JWT z podanymi claimami (bez prawdziwego podpisu). */
function fakeJwt(claims: Record<string, unknown>): string {
  const base64url = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return [base64url({ alg: 'HS256', typ: 'JWT' }), base64url(claims), 'podpis'].join('.');
}

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

  it('odrzuca sekretny klucz serwera w miejscu klucza anon (NFR-9)', () => {
    expect(
      parseConfig({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_ANON_KEY: fakeJwt({ role: 'service_role' }),
      }),
    ).toEqual({ ok: false, issues: [{ kind: 'secretKey', name: 'VITE_SUPABASE_ANON_KEY' }] });
  });
});

describe('isSecretKey', () => {
  it('rozpoznaje klucz sekretny w nowym formacie', () => {
    expect(isSecretKey('sb_secret_abc123')).toBe(true);
  });

  it('rozpoznaje JWT z rolą service_role', () => {
    expect(isSecretKey(fakeJwt({ iss: 'supabase', role: 'service_role' }))).toBe(true);
  });

  it('przepuszcza klucze publiczne', () => {
    expect(isSecretKey('sb_publishable_abc123')).toBe(false);
    expect(isSecretKey(fakeJwt({ iss: 'supabase', role: 'anon' }))).toBe(false);
  });

  it('nie zgłasza błędu dla tekstu, który tylko przypomina JWT', () => {
    expect(isSecretKey('a.b.c')).toBe(false);
    expect(isSecretKey('klucz')).toBe(false);
  });
});
