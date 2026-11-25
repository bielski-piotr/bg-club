import type { SupabaseClient } from '@supabase/supabase-js';
import { functionFailure } from '../lib/functions';
import type { Profile } from '../profile/profileQueries';

/** Edge Function tworząca konto członka (MEM-3, `supabase/functions/create-member`). */
export const CREATE_MEMBER_FUNCTION = 'create-member';

export interface NewMember {
  readonly firstName: string;
  readonly lastName: string;
}

/** Dane logowania nowego członka. Hasło jest tylko tutaj i w stanie formularza (AUTH-4). */
export interface CreatedMember {
  readonly member: Profile;
  readonly password: string;
}

/** Problem z polem zgłoszony przez funkcję (`packages/accounts/src/member.ts`). */
export type FieldProblem = 'required' | 'tooLong';
export type FieldProblems = Partial<Record<keyof NewMember, FieldProblem>>;

/**
 * Powód nieudanego dodania członka (komunikat w `t.addMember.errors`). `failed` = funkcja potwierdziła, że nic nie powstało; `unknown` = odpowiedź nie dotarła albo
 * nie pochodzi od funkcji (bramka, przekroczony czas), więc konto mogło już powstać.
 */
export type CreateMemberFailure =
  'invalid' | 'forbidden' | 'session' | 'network' | 'failed' | 'unknown';

export class CreateMemberError extends Error {
  readonly reason: CreateMemberFailure;
  readonly problems: FieldProblems;

  constructor(reason: CreateMemberFailure, problems: FieldProblems = {}) {
    super(`create-member: ${reason}`);
    this.name = 'CreateMemberError';
    this.reason = reason;
    this.problems = problems;
  }
}

function isCreatedMember(value: unknown): value is CreatedMember {
  if (typeof value !== 'object' || value === null) return false;
  const { member, password } = value as Record<string, unknown>;
  return (
    typeof password === 'string' &&
    typeof member === 'object' &&
    member !== null &&
    typeof (member as Record<string, unknown>).hook === 'string'
  );
}

/**
 * Dodaje członka przez Edge Function (konto Auth i profil w jednej transakcji). Zwraca profil
 * i wygenerowane hasło. Klient nie zapisuje ani nie loguje hasła; pokazuje je formularz raz.
 */
export async function createMember(
  client: SupabaseClient,
  input: NewMember,
): Promise<CreatedMember> {
  const { data, error } = await client.functions.invoke<unknown>(CREATE_MEMBER_FUNCTION, {
    method: 'POST',
    body: { firstName: input.firstName.trim(), lastName: input.lastName.trim() },
  });
  if (!error) {
    if (isCreatedMember(data)) return data;
    throw new CreateMemberError('unknown');
  }
  const { network, status, body } = await functionFailure(error);
  if (network) throw new CreateMemberError('network');
  if (status === 400 && body.error === 'invalid_input') {
    throw new CreateMemberError('invalid', (body.problems as FieldProblems | undefined) ?? {});
  }
  if (status === 401) throw new CreateMemberError('session');
  if (status === 403) throw new CreateMemberError('forbidden');
  if (status === 500 && body.error === 'failed') throw new CreateMemberError('failed');
  throw new CreateMemberError('unknown');
}
