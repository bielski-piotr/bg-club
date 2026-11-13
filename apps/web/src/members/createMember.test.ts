import type { SupabaseClient } from '@supabase/supabase-js';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createMember, CreateMemberError } from './createMember';

function clientReturning(result: { data: unknown; error: unknown }) {
  const invoke = vi.fn(async () => result);
  return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke };
}

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
}

async function failure(result: { data: unknown; error: unknown }) {
  const { client } = clientReturning(result);
  return (await createMember(client, { firstName: 'Ola', lastName: 'Nowak' }).catch(
    (e: unknown) => e,
  )) as CreateMemberError;
}

describe('createMember: wywołanie Edge Function (MEM-3)', () => {
  it('wysyła imię i nazwisko bez spacji na brzegach i zwraca profil z hasłem', async () => {
    const created = {
      member: { id: 'x', hook: 'ola-nowak-0001', first_name: 'Ola', last_name: 'Nowak' },
      password: 'abcdefghijkmnopq',
    };
    const { client, invoke } = clientReturning({ data: created, error: null });
    expect(await createMember(client, { firstName: ' Ola ', lastName: 'Nowak  ' })).toEqual(
      created,
    );
    expect(invoke).toHaveBeenCalledWith('create-member', {
      method: 'POST',
      body: { firstName: 'Ola', lastName: 'Nowak' },
    });
  });

  it('mapuje odpowiedzi funkcji na powody błędów', async () => {
    expect(
      await failure({
        data: null,
        error: httpError(400, { error: 'invalid_input', problems: { lastName: 'tooLong' } }),
      }),
    ).toMatchObject({ reason: 'invalid', problems: { lastName: 'tooLong' } });
    expect(
      await failure({ data: null, error: httpError(403, { error: 'forbidden' }) }),
    ).toMatchObject({ reason: 'forbidden' });
    expect(
      await failure({ data: null, error: httpError(401, { error: 'unauthorized' }) }),
    ).toMatchObject({ reason: 'session' });
    // Odpowiedź bramki (np. przekroczony czas): konto mogło powstać.
    expect(await failure({ data: null, error: httpError(504, { msg: 'timeout' }) })).toMatchObject({
      reason: 'unknown',
    });
    expect(await failure({ data: null, error: httpError(500, { error: 'failed' }) })).toMatchObject(
      {
        reason: 'failed',
      },
    );
    expect(
      await failure({ data: null, error: new FunctionsFetchError(new TypeError('offline')) }),
    ).toMatchObject({ reason: 'network' });
  });

  it('niepoprawna odpowiedź 2xx też jest błędem', async () => {
    expect(await failure({ data: { ok: true }, error: null })).toBeInstanceOf(CreateMemberError);
  });
});
