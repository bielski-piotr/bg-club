/**
 * Usunięcie konta członka, wspólne dla `delete-member`
 * (administrator usuwa członka) i `delete-own-account` (gracz usuwa własne konto).
 *
 * Kolejność kroków:
 * 1. **Miękkie usunięcie profilu** (`profiles.deleted_at`). Od tej chwili konto nie widzi
 *    danych ani niczego nie zapisze (RLS wymaga aktywnego profilu), nie dostanie nowego tokenu
 *    (hook `custom_access_token_hook`) i znika z list. Wyzwalacz w bazie w tej samej transakcji
 *    usuwa członka z zaplanowanych spotkań razem z głosami i oddaje adminowi prowadzenie
 *    niezakończonych spotkań. CHECK `profiles_admin_not_deleted` odrzuca profil
 *    administratora także wtedy, gdyby sprawdzenie roli w funkcji zawiodło.
 * 2. **Miękkie usunięcie konta Auth** (`auth.admin.deleteUser(id, true)`): Auth zaciera
 *    techniczny e-mail, usuwa tożsamości i sesje (tokeny odświeżania). Wiersz `auth.users`
 *    zostaje, więc profil i historia nie tracą identyfikatora.
 *
 * Oba kroki są idempotentne: ponowienie po błędzie w kroku 2 kończy usuwanie konta, którego
 * profil jest już usunięty. Logowanie i tak jest zablokowane po kroku 1.
 */

/** Profil potrzebny do sprawdzenia uprawnień i usunięcia (kolumny `profiles`). */
export interface AccountProfile {
  readonly id: string;
  readonly hook: string;
  readonly role: 'admin' | 'player';
  readonly deleted: boolean;
}

/** Dostęp do bazy i Auth z kluczem service role (`index.ts`; w testach atrapy). */
export interface AccountStore {
  /** Id użytkownika z tokenu sesji albo `null`, gdy token jest nieważny. */
  authenticate(token: string): Promise<string | null>;
  /** Profil o tym id (także usunięty) albo `null`. */
  findProfile(id: string): Promise<AccountProfile | null>;
  /** Ustawia `deleted_at` aktywnemu profilowi gracza; usuniętego nie zmienia. */
  softDeleteProfile(id: string): Promise<void>;
  /** Miękko usuwa konto Auth; konto już usunięte (brak w Auth) nie jest błędem. */
  deleteAuthUser(id: string): Promise<void>;
}

/** Administratora nie da się usunąć żadną ścieżką. */
export class AdminProtectedError extends Error {
  constructor() {
    super('the administrator account cannot be deleted');
    this.name = 'AdminProtectedError';
  }
}

/** Usuwa konto gracza: najpierw profil (blokada i skutki usunięcia), potem konto Auth. */
export async function deleteAccount(store: AccountStore, profile: AccountProfile): Promise<void> {
  if (profile.role === 'admin') throw new AdminProtectedError();
  if (!profile.deleted) await store.softDeleteProfile(profile.id);
  await store.deleteAuthUser(profile.id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
