import type { SupabaseClient } from '@supabase/supabase-js';
import { functionFailure } from '../lib/functions';

/** Edge Functions usuwające konta (`supabase/functions/delete-member`, `delete-own-account`). */
export const DELETE_MEMBER_FUNCTION = 'delete-member';
export const DELETE_OWN_ACCOUNT_FUNCTION = 'delete-own-account';

/**
 * Powód nieudanego usunięcia (komunikaty w `t.deleteMember.errors` i `t.deleteAccount.errors`).
 * Usunięcie jest idempotentne, więc po `network` i `unknown` można bezpiecznie ponowić.
 */
export type DeletionFailure =
  | 'session'
  | 'forbidden'
  | 'adminProtected'
  | 'notFound'
  | 'wrongPassword'
  | 'rateLimited'
  | 'network'
  | 'unknown';

export class DeletionError extends Error {
  readonly reason: DeletionFailure;

  constructor(reason: DeletionFailure) {
    super(`account deletion: ${reason}`);
    this.name = 'DeletionError';
    this.reason = reason;
  }
}

/** Kody błędów funkcji (pole `error`) i ich znaczenie w aplikacji. */
const FAILURES: Readonly<Record<string, DeletionFailure>> = {
  unauthorized: 'session',
  forbidden: 'forbidden',
  admin_protected: 'adminProtected',
  not_found: 'notFound',
  wrong_password: 'wrongPassword',
  rate_limited: 'rateLimited',
};

async function invoke(client: SupabaseClient, name: string, body: object): Promise<void> {
  const { error } = await client.functions.invoke<unknown>(name, { method: 'POST', body });
  if (!error) return;
  const failure = await functionFailure(error);
  if (failure.network) throw new DeletionError('network');
  const code = typeof failure.body.error === 'string' ? failure.body.error : '';
  throw new DeletionError(
    Object.hasOwn(FAILURES, code) ? (FAILURES[code] ?? 'unknown') : 'unknown',
  );
}

/**
 * Administrator usuwa członka (MEM-4): profil zostaje w historii, konto przestaje działać,
 * a członek znika z zaplanowanych spotkań (MEM-6, skutki w bazie).
 */
export function deleteMember(client: SupabaseClient, memberId: string): Promise<void> {
  return invoke(client, DELETE_MEMBER_FUNCTION, { memberId });
}

/**
 * Gracz usuwa własne konto po potwierdzeniu hasłem (USR-6). Hasło idzie tylko w treści
 * żądania; funkcja sprawdza je w Auth i go nie loguje.
 */
export function deleteOwnAccount(client: SupabaseClient, password: string): Promise<void> {
  return invoke(client, DELETE_OWN_ACCOUNT_FUNCTION, { password });
}
