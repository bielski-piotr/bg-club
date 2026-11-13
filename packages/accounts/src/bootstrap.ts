/**
 * Bootstrap pierwszego administratora (PRD AUTH-3, §9 przepływ 0).
 *
 * Działa wyłącznie z kluczem service role, po stronie operatora instalacji (skrypt
 * `pnpm bootstrap:admin`). Nie ma publicznego endpointu, więc nikt z zewnątrz nie może
 * „zająć” pustej instancji przed administratorem. Reguły pilnuje też baza (migracja
 * `20261113000500_accounts_and_login.sql`): administrator powstaje tylko na pustej instalacji,
 * drugi administrator nie powstanie nawet przy równoległych próbach, a konto Auth i profil
 * tworzą się w jednej transakcji.
 *
 * Ponowienie jest bezpieczne: gdy administrator istnieje, funkcja niczego nie zmienia (także
 * hasła) i zwraca jego hook.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createHook,
  generatePassword,
  hookToEmail,
  MIN_PASSWORD_LENGTH,
  randomHookSuffix,
} from './index.ts';

/** Maksymalna długość imienia i nazwiska (CHECK w `profiles`). */
export const NAME_MAX_LENGTH = 50;

export interface BootstrapAdminInput {
  readonly firstName: string;
  readonly lastName: string;
  /** Hasło administratora. Bez niego powstaje losowe hasło (AUTH-4), pokazywane raz. */
  readonly password?: string | undefined;
}

export type BootstrapAdminResult =
  | {
      readonly status: 'created';
      readonly hook: string;
      readonly userId: string;
      /** Wygenerowane hasło; `undefined`, gdy podano własne. */
      readonly generatedPassword: string | undefined;
    }
  | { readonly status: 'exists'; readonly hook: string };

/** Błąd z komunikatem dla operatora (po polsku, bez sekretów). */
export class BootstrapError extends Error {
  override name = 'BootstrapError';
}

/** Problemy z danymi wejściowymi (pusta lista = dane poprawne). */
export function validateBootstrapInput(input: BootstrapAdminInput): string[] {
  const problems: string[] = [];
  const checkName = (value: string, label: string) => {
    const trimmed = value.trim();
    if (trimmed === '') problems.push(`${label} administratora jest wymagane.`);
    else if (trimmed.length > NAME_MAX_LENGTH) {
      problems.push(`${label} administratora może mieć najwyżej ${NAME_MAX_LENGTH} znaków.`);
    }
  };
  checkName(input.firstName, 'Imię');
  checkName(input.lastName, 'Nazwisko');
  if (input.password !== undefined && input.password !== '') {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      problems.push(`Hasło administratora musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`);
    }
  }
  return problems;
}

async function findAdminHook(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client
    .from('profiles')
    .select('hook')
    .eq('role', 'admin')
    .maybeSingle<{ hook: string }>();
  if (error) {
    throw new BootstrapError(
      `Nie udało się odczytać profili (${error.message}). Sprawdź adres i klucz service role.`,
    );
  }
  return data?.hook ?? null;
}

/**
 * Tworzy konto pierwszego administratora: konto Auth z technicznym e-mailem i profil z rolą
 * `admin` (profil zakłada wyzwalacz w bazie z `app_metadata.bg_club`). Klient musi używać
 * klucza service role.
 */
export async function bootstrapAdmin(
  client: SupabaseClient,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const problems = validateBootstrapInput(input);
  if (problems.length > 0) throw new BootstrapError(problems.join(' '));

  const existing = await findAdminHook(client);
  if (existing !== null) return { status: 'exists', hook: existing };

  const { count, error: countError } = await client
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (countError) {
    throw new BootstrapError(`Nie udało się odczytać profili (${countError.message}).`);
  }
  if ((count ?? 0) > 0) {
    throw new BootstrapError(
      'Instalacja nie jest pusta: są profile, ale nie ma administratora. ' +
        'Bootstrap działa tylko na pustej bazie.',
    );
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const hook = createHook(firstName, lastName, randomHookSuffix());
  const ownPassword = input.password === undefined || input.password === '' ? null : input.password;
  const password = ownPassword ?? generatePassword();
  const generatedPassword = ownPassword === null ? password : undefined;

  const { data, error } = await client.auth.admin.createUser({
    email: hookToEmail(hook),
    password,
    // Techniczny adres nie przyjmuje poczty; konto jest od razu potwierdzone.
    email_confirm: true,
    app_metadata: { bg_club: { first_name: firstName, last_name: lastName, role: 'admin' } },
  });

  if (error || !data.user) {
    // Równoległy bootstrap mógł utworzyć administratora chwilę wcześniej: baza odrzuciła
    // wtedy drugie konto w całości, więc wystarczy zwrócić zwycięzcę.
    const winner = await findAdminHook(client);
    if (winner !== null) return { status: 'exists', hook: winner };
    throw new BootstrapError(
      `Auth odrzucił konto administratora (${error?.message ?? 'brak danych konta'}).`,
    );
  }

  return { status: 'created', hook, userId: data.user.id, generatedPassword };
}
