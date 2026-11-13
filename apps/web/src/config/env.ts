/**
 * Konfiguracja frontendu ze zmiennych środowiskowych (NFR-1).
 * W repozytorium nie ma żadnych wartości (NFR-9); podaje się je w `.env.local`
 * lub w ustawieniach Cloudflare Pages.
 */
export interface AppConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
}

export type ConfigIssue =
  | { readonly kind: 'missing'; readonly names: readonly string[] }
  | { readonly kind: 'invalidUrl'; readonly name: string }
  | { readonly kind: 'secretKey'; readonly name: string };

export type ConfigResult =
  | { readonly ok: true; readonly config: AppConfig }
  | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

export const ENV_SUPABASE_URL = 'VITE_SUPABASE_URL';
export const ENV_SUPABASE_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';

type RawEnv = Readonly<Record<string, string | boolean | undefined>>;

function read(env: RawEnv, name: string): string {
  const value = env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Czy klucz jest sekretnym kluczem serwera (NFR-9, PRD §6.1). Klucz `service_role` omija RLS,
 * więc w bundlu SPA dałby każdemu pełny dostęp do bazy. Rozpoznajemy oba formaty Supabase:
 * nowy (`sb_secret_…`) i starszy JWT z `"role": "service_role"`.
 */
export function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return false;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return (
      typeof claims === 'object' &&
      claims !== null &&
      (claims as { role?: unknown }).role === 'service_role'
    );
  } catch {
    return false;
  }
}

export function parseConfig(env: RawEnv): ConfigResult {
  const supabaseUrl = read(env, ENV_SUPABASE_URL);
  const supabaseAnonKey = read(env, ENV_SUPABASE_ANON_KEY);

  const missing = [
    ...(supabaseUrl ? [] : [ENV_SUPABASE_URL]),
    ...(supabaseAnonKey ? [] : [ENV_SUPABASE_ANON_KEY]),
  ];
  const issues: ConfigIssue[] = [];
  if (missing.length > 0) issues.push({ kind: 'missing', names: missing });
  if (supabaseUrl && !isHttpUrl(supabaseUrl)) {
    issues.push({ kind: 'invalidUrl', name: ENV_SUPABASE_URL });
  }
  if (supabaseAnonKey && isSecretKey(supabaseAnonKey)) {
    issues.push({ kind: 'secretKey', name: ENV_SUPABASE_ANON_KEY });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, config: { supabaseUrl: supabaseUrl.replace(/\/+$/, ''), supabaseAnonKey } };
}
