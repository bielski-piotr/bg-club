/**
 * Adres i klucze lokalnego Supabase (`pnpm db:start`) odczytane z `supabase status`.
 * Tylko dla środowiska deweloperskiego; produkcyjne klucze podaje się
 * w zmiennych środowiskowych.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Katalog główny repozytorium (tam jest `supabase/config.toml`). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface LocalStack {
  readonly apiUrl: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
}

function field(status: Record<string, unknown>, name: string): string {
  const value = status[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(
      `\`supabase status\` nie zwrócił pola ${name}. Czy działa pełny stos (pnpm db:start)?`,
    );
  }
  return value;
}

export function readLocalStack(): LocalStack {
  let output: string;
  try {
    const workdir = process.env.BG_CLUB_TEST_WORKDIR;
    // Ścieżkę override przekazujemy bez powłoki, także gdy zawiera spacje.
    const pnpmScript = process.env.npm_execpath;
    if (workdir && !pnpmScript?.includes('pnpm')) {
      throw new Error('Override stosu wymaga uruchomienia przez pnpm.');
    }
    const args = [
      'exec',
      'supabase',
      'status',
      '-o',
      'json',
      ...(workdir ? ['--workdir', workdir] : []),
    ];
    output = execFileSync(
      workdir ? process.execPath : 'pnpm',
      workdir && pnpmScript ? [pnpmScript, ...args] : args,
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: !workdir && process.platform === 'win32',
      },
    );
  } catch {
    throw new Error('Lokalny Supabase nie działa. Uruchom `pnpm db:start`.');
  }
  const status = JSON.parse(output) as Record<string, unknown>;
  return {
    apiUrl: field(status, 'API_URL'),
    anonKey: field(status, 'ANON_KEY'),
    serviceRoleKey: field(status, 'SERVICE_ROLE_KEY'),
  };
}
