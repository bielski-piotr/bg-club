/**
 * Obsługa żądania `POST /functions/v1/delete-own-account` (PRD USR-6, MEM-6, AUTH-7).
 * Bez zależności od Deno i supabase-js: dostęp do bazy i Auth podaje `index.ts`.
 *
 * Kontrakt:
 * - nagłówek `Authorization: Bearer <token sesji>` aktywnego gracza,
 * - treść `{ "password": "…" }`: obecne hasło konta (USR-6). Funkcja sprawdza je logowaniem
 *   w Auth, więc obowiązują te same limity prób co przy logowaniu,
 * - odpowiedź 200 `{ "deleted": true }`; sesje konta przestają działać,
 * - błędy: `{ error: kod }` z kodem `unauthorized` (401), `admin_protected` (403: administrator
 *   nie usuwa swojego konta), `invalid_body` (400), `wrong_password` (400),
 *   `rate_limited` (429), `method_not_allowed` (405) albo `failed` (500).
 *
 * Hasła funkcja nie loguje.
 */
import { type AccountStore, deleteAccount } from '../_shared/accountDeletion.ts';
import { bearerToken, errorMessage, json, preflight, readJsonObject } from '../_shared/http.ts';

/** Wynik sprawdzenia hasła logowaniem w Auth. */
export type PasswordCheck = 'ok' | 'wrong' | 'rate_limited';

export interface DeleteOwnAccountDeps {
  readonly store: AccountStore;
  /** Sprawdza hasło konta o tym hooku (logowanie technicznym e-mailem). */
  verifyPassword(hook: string, password: string): Promise<PasswordCheck>;
  /** Log serwera. Nigdy nie dostaje hasła ani treści żądania. */
  log(event: string, detail: Readonly<Record<string, string>>): void;
}

export type DeleteOwnAccountErrorCode =
  | 'unauthorized'
  | 'admin_protected'
  | 'invalid_body'
  | 'wrong_password'
  | 'rate_limited'
  | 'method_not_allowed'
  | 'failed';

/** Hasło ma zwykle 12–72 znaki; 4 KiB wystarcza z dużym zapasem. */
const MAX_BODY_BYTES = 4096;

function failure(status: number, error: DeleteOwnAccountErrorCode): Response {
  return json(status, { error });
}

export async function handleDeleteOwnAccount(
  request: Request,
  deps: DeleteOwnAccountDeps,
): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return failure(405, 'method_not_allowed');

  const { store } = deps;
  try {
    const token = bearerToken(request);
    const callerId = token ? await store.authenticate(token) : null;
    if (!callerId) return failure(401, 'unauthorized');
    const me = await store.findProfile(callerId);
    // Konto już usunięte z ważnym jeszcze tokenem nie ma czego usuwać.
    if (!me || me.deleted) return failure(401, 'unauthorized');
    // Administrator nie widzi tej opcji (USR-6); żądanie z pominięciem aplikacji też odrzucamy.
    if (me.role === 'admin') {
      deps.log('delete-own-account.admin', { caller: callerId });
      return failure(403, 'admin_protected');
    }

    const body = await readJsonObject(request, MAX_BODY_BYTES);
    const password = body?.password;
    if (typeof password !== 'string' || password === '') return failure(400, 'invalid_body');

    const check = await deps.verifyPassword(me.hook, password);
    if (check === 'rate_limited') return failure(429, 'rate_limited');
    if (check === 'wrong') return failure(400, 'wrong_password');

    await deleteAccount(store, me);
    deps.log('delete-own-account.deleted', { member: me.id });
    return json(200, { deleted: true });
  } catch (error) {
    deps.log('delete-own-account.failed', { message: errorMessage(error) });
    return failure(500, 'failed');
  }
}
