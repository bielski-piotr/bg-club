/**
 * Tworzenie konta członka klubu (PRD MEM-3, AUTH-2, AUTH-4, USR-1). Używa go Edge Function
 * `create-member` (Deno), dlatego moduł nie zależy od supabase-js: dostęp do Auth
 * i bazy przekazuje wywołujący ({@link MemberAccounts}).
 *
 * - Hook powstaje z imienia i nazwiska z transliteracją i losowym sufiksem. Jest unikalny:
 *   przy kolizji (zajęty hook, także usuniętego członka, którego profil zostaje w historii)
 *   funkcja losuje nowy sufiks.
 * - Hasło pochodzi z generatora kryptograficznego i ma co najmniej 12 znaków. Moduł niczego
 *   nie loguje; hasło wraca tylko w wyniku, który Edge Function oddaje administratorowi raz.
 * - Konto Auth i profil powstają w jednej transakcji (wyzwalacz w bazie), więc błąd w połowie
 *   nie zostawia konta bez profilu ani profilu bez konta.
 */
import {
  createHook,
  generatePassword,
  hookToEmail,
  NAME_MAX_LENGTH,
  randomHookSuffix,
  type RandomSource,
} from './index.ts';

/** Ile razy losujemy sufiks hooka, zanim uznamy, że coś jest nie tak (65 536 sufiksów na nazwę). */
export const HOOK_ATTEMPTS = 8;

export interface MemberInput {
  readonly firstName: string;
  readonly lastName: string;
}

/** Problem z polem formularza (kod mapowany w SPA na polski komunikat). */
export type MemberFieldProblem = 'required' | 'tooLong';

export type MemberInputProblems = Partial<Record<keyof MemberInput, MemberFieldProblem>>;

/** Wynik próby utworzenia konta Auth (z profilem, w jednej transakcji). */
export type CreateAccountResult =
  | { readonly ok: true; readonly userId: string }
  | {
      readonly ok: false;
      /** Auth zgłosił zajęty e-mail (`email_exists`), czyli zajęty hook. */
      readonly emailTaken: boolean;
      /** Opis błędu bez danych konta (do logów serwera). */
      readonly message: string;
    };

/** Operacje na Auth i bazie, których potrzebuje {@link createMember} (klucz service role). */
export interface MemberAccounts {
  /** Czy hook jest zajęty przez jakikolwiek profil (także usunięty). */
  hookTaken(hook: string): Promise<boolean>;
  /** Konto Auth z technicznym e-mailem i `app_metadata.bg_club`; profil zakłada wyzwalacz. */
  createAccount(account: {
    readonly email: string;
    readonly password: string;
    readonly firstName: string;
    readonly lastName: string;
  }): Promise<CreateAccountResult>;
}

export interface CreatedMember {
  readonly userId: string;
  readonly hook: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Wygenerowane hasło, pokazywane administratorowi jednorazowo (AUTH-4). */
  readonly password: string;
}

/** Błąd tworzenia członka. `reason` jest kodem dla odpowiedzi HTTP, bez danych konta. */
export class CreateMemberError extends Error {
  override name = 'CreateMemberError';
  readonly reason: 'invalid' | 'hookExhausted' | 'failed';
  readonly problems: MemberInputProblems;

  constructor(
    reason: 'invalid' | 'hookExhausted' | 'failed',
    message: string,
    problems: MemberInputProblems = {},
  ) {
    super(message);
    this.reason = reason;
    this.problems = problems;
  }
}

/** Imię i nazwisko bez spacji na brzegach (tak zapisuje je też wyzwalacz w bazie). */
export function normalizeMemberInput(input: MemberInput): MemberInput {
  return { firstName: input.firstName.trim(), lastName: input.lastName.trim() };
}

/** Problemy z polami (pusty obiekt = dane poprawne). */
export function validateMemberInput(input: MemberInput): MemberInputProblems {
  const problems: MemberInputProblems = {};
  for (const field of ['firstName', 'lastName'] as const) {
    const value = input[field].trim();
    if (value === '') problems[field] = 'required';
    else if (value.length > NAME_MAX_LENGTH) problems[field] = 'tooLong';
  }
  return problems;
}

/**
 * Zakłada konto gracza: hook, hasło, konto Auth i profil (MEM-3). Rola jest zawsze `player`;
 * drugiego administratora nie da się utworzyć (AUTH-3). Uprawnienia wywołującego sprawdza
 * Edge Function przed wywołaniem.
 */
export async function createMember(
  accounts: MemberAccounts,
  input: MemberInput,
  random?: RandomSource,
): Promise<CreatedMember> {
  const problems = validateMemberInput(input);
  if (Object.keys(problems).length > 0) {
    throw new CreateMemberError('invalid', 'invalid member input', problems);
  }
  const { firstName, lastName } = normalizeMemberInput(input);

  let lastFailure = '';
  for (let attempt = 0; attempt < HOOK_ATTEMPTS; attempt += 1) {
    const hook = createHook(firstName, lastName, randomHookSuffix(random));
    // Szybka ścieżka: zajęty hook pomijamy bez próby w Auth. Wyścig dwóch równoległych
    // żądań rozstrzyga i tak unikalność e-maila w Auth i `profiles_hook_key` w bazie.
    if (await accounts.hookTaken(hook)) continue;

    const password = generatePassword(undefined, random);
    const result = await accounts.createAccount({
      email: hookToEmail(hook),
      password,
      firstName,
      lastName,
    });
    if (result.ok) return { userId: result.userId, hook, firstName, lastName, password };

    // Konto i profil powstają w jednej transakcji, więc odrzucona próba niczego nie zostawia.
    // Ponawiamy tylko wtedy, gdy przyczyną był hook zajęty w międzyczasie.
    lastFailure = result.message;
    if (!result.emailTaken && !(await accounts.hookTaken(hook))) {
      throw new CreateMemberError('failed', `auth rejected the account: ${result.message}`);
    }
  }
  throw new CreateMemberError(
    'hookExhausted',
    `no free hook after ${HOOK_ATTEMPTS} attempts${lastFailure ? ` (${lastFailure})` : ''}`,
  );
}
