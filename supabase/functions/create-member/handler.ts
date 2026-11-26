/**
 * Obsługa żądania `POST /functions/v1/create-member` (PRD MEM-3, AUTH-2, AUTH-4, USR-1).
 * Bez zależności od Deno i supabase-js: dostęp do Auth i bazy podaje `index.ts`.
 *
 * Kontrakt:
 * - nagłówek `Authorization: Bearer <token sesji>`; tylko aktywny administrator (403 dla gracza),
 * - treść `{ "firstName": "…", "lastName": "…" }`,
 * - odpowiedź 201 `{ member, password }`. Hasło jest tylko w tej odpowiedzi (`no-store`) i nigdy
 *   nie trafia do logów; aplikacja pokazuje je administratorowi jednorazowo.
 * - błędy: `{ error: kod, problems? }` z kodem `unauthorized` (401), `forbidden` (403),
 *   `invalid_body` / `invalid_input` (400), `method_not_allowed` (405) albo `failed` (500).
 */
import {
  createMember,
  CreateMemberError,
  type MemberAccounts,
  type MemberInputProblems,
} from '../../../packages/accounts/src/member.ts';
import { bearerToken, errorMessage, json, preflight, readJsonObject } from '../_shared/http.ts';

export interface CreateMemberDeps {
  /** Id użytkownika z tokenu sesji albo `null`, gdy token jest nieważny. */
  authenticate(token: string): Promise<string | null>;
  /** Czy to konto ma aktywny profil z rolą `admin`. */
  isActiveAdmin(userId: string): Promise<boolean>;
  readonly accounts: MemberAccounts;
  /** Log serwera. Nigdy nie dostaje hasła ani treści żądania. */
  log(event: string, detail: Readonly<Record<string, string>>): void;
}

/** Profil nowego członka w kształcie wiersza `profiles` (jak `select` w SPA). */
export interface CreatedMemberProfile {
  readonly id: string;
  readonly hook: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly role: 'player';
  /** Nowy członek ma monogram; zdjęcie ustawia sam w ustawieniach (USR-3). */
  readonly avatar_path: null;
  readonly deleted_at: null;
}

export type CreateMemberErrorCode =
  'unauthorized' | 'forbidden' | 'invalid_body' | 'invalid_input' | 'method_not_allowed' | 'failed';

/** Największa akceptowana treść żądania (dwa pola po 50 znaków mieszczą się z zapasem). */
const MAX_BODY_BYTES = 4096;

function failure(
  status: number,
  error: CreateMemberErrorCode,
  problems?: MemberInputProblems,
): Response {
  return json(status, problems ? { error, problems } : { error });
}

async function readInput(
  request: Request,
): Promise<{ firstName: string; lastName: string } | null> {
  const body = await readJsonObject(request, MAX_BODY_BYTES);
  if (!body) return null;
  const { firstName, lastName } = body;
  if (typeof firstName !== 'string' || typeof lastName !== 'string') return null;
  return { firstName, lastName };
}

export async function handleCreateMember(
  request: Request,
  deps: CreateMemberDeps,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return preflight();
  }
  if (request.method !== 'POST') return failure(405, 'method_not_allowed');

  try {
    // Klucz service role omija RLS, więc uprawnienia sprawdzamy tu, zanim cokolwiek powstanie.
    const token = bearerToken(request);
    const callerId = token ? await deps.authenticate(token) : null;
    if (!callerId) return failure(401, 'unauthorized');
    if (!(await deps.isActiveAdmin(callerId))) {
      deps.log('create-member.forbidden', { caller: callerId });
      return failure(403, 'forbidden');
    }

    const input = await readInput(request);
    if (!input) return failure(400, 'invalid_body');

    const member = await createMember(deps.accounts, input);
    deps.log('create-member.created', { caller: callerId, member: member.userId });
    const profile: CreatedMemberProfile = {
      id: member.userId,
      hook: member.hook,
      first_name: member.firstName,
      last_name: member.lastName,
      role: 'player',
      avatar_path: null,
      deleted_at: null,
    };
    return json(201, { member: profile, password: member.password });
  } catch (error) {
    if (error instanceof CreateMemberError && error.reason === 'invalid') {
      return failure(400, 'invalid_input', error.problems);
    }
    // Komunikaty błędów nie zawierają hasła (createMember go nie dołącza).
    deps.log('create-member.failed', {
      reason: error instanceof CreateMemberError ? error.reason : 'unexpected',
      message: errorMessage(error),
    });
    return failure(500, 'failed');
  }
}
