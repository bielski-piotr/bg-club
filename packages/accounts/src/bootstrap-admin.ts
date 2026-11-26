/**
 * Skrypt instalacyjny: konto pierwszego administratora ze zmiennych środowiskowych.
 *
 *   pnpm bootstrap:admin          # SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY ze zmiennych
 *   pnpm bootstrap:admin:local    # adres i klucz lokalnego Supabase z `supabase status`
 *
 * Dane administratora: BOOTSTRAP_ADMIN_FIRST_NAME, BOOTSTRAP_ADMIN_LAST_NAME i opcjonalnie
 * BOOTSTRAP_ADMIN_PASSWORD (min. 12 znaków). Zmienne można zapisać w `supabase/seed/.env`
 * (wzór: `.env.example`, plik jest poza repozytorium). Bez hasła skrypt generuje losowe
 * wypisuje je jeden raz. Ponowne uruchomienie niczego nie zmienia.
 */
import { createClient } from '@supabase/supabase-js';
import { bootstrapAdmin, BootstrapError } from './bootstrap.ts';
import { readLocalStack } from './localStack.ts';

const ENV = {
  url: 'SUPABASE_URL',
  serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
  firstName: 'BOOTSTRAP_ADMIN_FIRST_NAME',
  lastName: 'BOOTSTRAP_ADMIN_LAST_NAME',
  password: 'BOOTSTRAP_ADMIN_PASSWORD',
} as const;

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, name: string): string {
  return env[name]?.trim() ?? '';
}

async function main(args: readonly string[], env: Env): Promise<number> {
  const local = args.includes('--local');
  let url = read(env, ENV.url);
  let serviceRoleKey = read(env, ENV.serviceRoleKey);
  if (local) {
    const stack = readLocalStack();
    url = stack.apiUrl;
    serviceRoleKey = stack.serviceRoleKey;
  }

  const firstName = read(env, ENV.firstName);
  const lastName = read(env, ENV.lastName);
  const missing = [
    ...(url ? [] : [ENV.url]),
    ...(serviceRoleKey ? [] : [ENV.serviceRoleKey]),
    ...(firstName ? [] : [ENV.firstName]),
    ...(lastName ? [] : [ENV.lastName]),
  ];
  if (missing.length > 0) {
    console.error(`Brakujące zmienne środowiskowe: ${missing.join(', ')}.`);
    console.error('Wzór: supabase/seed/.env.example. Lokalnie: pnpm bootstrap:admin:local.');
    return 1;
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const result = await bootstrapAdmin(client, {
      firstName,
      lastName,
      // Hasło nie jest przycinane: spacje na brzegach mogą być jego częścią.
      password: env[ENV.password] || undefined,
    });
    if (result.status === 'exists') {
      console.log(`Administrator już istnieje (hook: ${result.hook}). Nic nie zmieniono.`);
      return 0;
    }
    console.log('Utworzono konto administratora.');
    console.log(`  Hook:  ${result.hook}`);
    if (result.generatedPassword !== undefined) {
      console.log(`  Hasło: ${result.generatedPassword}`);
      console.log(
        'Hasło jest wygenerowane i pokazujemy je tylko raz. Zapisz je w menedżerze haseł.',
      );
    } else {
      console.log(`  Hasło: podane w ${ENV.password}.`);
    }
    return 0;
  } catch (error) {
    console.error(
      error instanceof BootstrapError ? error.message : `Nieoczekiwany błąd: ${String(error)}`,
    );
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2), process.env);
