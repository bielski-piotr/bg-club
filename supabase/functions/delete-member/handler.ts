/**
 * Obsługa żądania `POST /functions/v1/delete-member` (PRD MEM-4, MEM-6, AUTH-7).
 * Bez zależności od Deno i supabase-js: dostęp do bazy i Auth podaje `index.ts`.
 *
 * Kontrakt:
 * - nagłówek `Authorization: Bearer <token sesji>`; tylko aktywny administrator (403 dla gracza),
 * - treść `{ "memberId": "<uuid>" }`,
 * - odpowiedź 200 `{ "memberId": "<uuid>" }`. Ponowienie dla usuniętego już członka też daje 200
 *   (kończy usuwanie konta Auth, jeśli wcześniej się nie udało),
 * - błędy: `{ error: kod }` z kodem `unauthorized` (401), `forbidden` (403), `invalid_body` (400),
 *   `not_found` (404), `admin_protected` (409: administratora nie da się usunąć),
 *   `method_not_allowed` (405) albo `failed` (500).
 */
import {
  type AccountStore,
  AdminProtectedError,
  deleteAccount,
  isUuid,
} from '../_shared/accountDeletion.ts';
import { bearerToken, errorMessage, json, preflight, readJsonObject } from '../_shared/http.ts';

export interface DeleteMemberDeps {
  readonly store: AccountStore;
  /** Log serwera. Nie dostaje treści żądania. */
  log(event: string, detail: Readonly<Record<string, string>>): void;
}

export type DeleteMemberErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_body'
  | 'not_found'
  | 'admin_protected'
  | 'method_not_allowed'
  | 'failed';

/** Treść to jeden uuid; 1 KiB wystarcza z zapasem. */
const MAX_BODY_BYTES = 1024;

function failure(status: number, error: DeleteMemberErrorCode): Response {
  return json(status, { error });
}

export async function handleDeleteMember(
  request: Request,
  deps: DeleteMemberDeps,
): Promise<Response> {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return failure(405, 'method_not_allowed');

  const { store } = deps;
  try {
    // Klucz service role omija RLS, więc uprawnienia sprawdzamy tu, zanim cokolwiek się zmieni.
    const token = bearerToken(request);
    const callerId = token ? await store.authenticate(token) : null;
    if (!callerId) return failure(401, 'unauthorized');
    const caller = await store.findProfile(callerId);
    if (!caller || caller.deleted) return failure(401, 'unauthorized');
    if (caller.role !== 'admin') {
      deps.log('delete-member.forbidden', { caller: callerId });
      return failure(403, 'forbidden');
    }

    const body = await readJsonObject(request, MAX_BODY_BYTES);
    const memberId = body?.memberId;
    if (!isUuid(memberId)) return failure(400, 'invalid_body');

    const member = await store.findProfile(memberId.toLowerCase());
    if (!member) return failure(404, 'not_found');
    await deleteAccount(store, member);
    deps.log('delete-member.deleted', { caller: callerId, member: member.id });
    return json(200, { memberId: member.id });
  } catch (error) {
    if (error instanceof AdminProtectedError) return failure(409, 'admin_protected');
    deps.log('delete-member.failed', { message: errorMessage(error) });
    return failure(500, 'failed');
  }
}
