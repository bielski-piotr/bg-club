import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

/** Rodzaj błędu logowania; tekst dla każdego jest w `t.auth.errors`. */
export type LoginErrorKind =
  'invalidCredentials' | 'accountInactive' | 'rateLimited' | 'network' | 'unknown';

/**
 * Komunikat hooka Auth `custom_access_token` dla konta usuniętego lub bez profilu (AUTH-7).
 * Ten sam tekst zwraca funkcja w migracji `20261113000500_accounts_and_login.sql`.
 */
export const ACCOUNT_INACTIVE_MESSAGE = 'account_inactive';

/** Klasyfikuje błąd Supabase Auth z logowania hasłem. */
export function loginErrorKind(error: unknown): LoginErrorKind {
  // Brak sieci, przekroczony czas albo chwilowa niedostępność serwera (502–504).
  if (isAuthRetryableFetchError(error)) return 'network';
  if (!isAuthApiError(error)) return 'unknown';
  // Konto zablokowane w Auth ([011]) traktujemy jak usunięte.
  if (error.message === ACCOUNT_INACTIVE_MESSAGE || error.code === 'user_banned') {
    return 'accountInactive';
  }
  if (error.code === 'invalid_credentials') return 'invalidCredentials';
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rateLimited';
  return 'unknown';
}
