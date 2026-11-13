/**
 * Konfiguracja frontendu ze zmiennych środowiskowych (NFR-1).
 * W repozytorium nie ma żadnych wartości (NFR-9); podaje się je w `.env.local`
 * lub w ustawieniach Cloudflare Pages.
 */
import { isSecretKey } from './secretKey';

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
