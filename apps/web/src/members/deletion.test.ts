import type { SupabaseClient } from '@supabase/supabase-js';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { deleteMember, DeletionError, deleteOwnAccount } from './deletion';

function clientReturning(error: unknown) {
  const invoke = vi.fn(async () => ({ data: error ? null : {}, error }));
  return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke };
}

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
}

async function reason(call: (client: SupabaseClient) => Promise<void>, error: unknown) {
  const { client } = clientReturning(error);
  const failure = (await call(client).catch((e: unknown) => e)) as DeletionError;
  expect(failure).toBeInstanceOf(DeletionError);
  return failure.reason;
}

const ID = '00000000-0000-4000-a000-000000000002';

describe('deleteMember i deleteOwnAccount: wywołanie Edge Functions (MEM-4, USR-6)', () => {
  it('wysyłają identyfikator członka albo hasło do właściwej funkcji', async () => {
    const admin = clientReturning(null);
    await deleteMember(admin.client, ID);
    expect(admin.invoke).toHaveBeenCalledWith('delete-member', {
      method: 'POST',
      body: { memberId: ID },
    });
    const own = clientReturning(null);
    await deleteOwnAccount(own.client, 'moje-haslo-1234');
    expect(own.invoke).toHaveBeenCalledWith('delete-own-account', {
      method: 'POST',
      body: { password: 'moje-haslo-1234' },
    });
  });

  it('mapują kody funkcji na powody błędów', async () => {
    const member = (client: SupabaseClient) => deleteMember(client, ID);
    const own = (client: SupabaseClient) => deleteOwnAccount(client, 'haslo');
    expect(await reason(member, httpError(403, { error: 'forbidden' }))).toBe('forbidden');
    expect(await reason(member, httpError(409, { error: 'admin_protected' }))).toBe(
      'adminProtected',
    );
    expect(await reason(member, httpError(404, { error: 'not_found' }))).toBe('notFound');
    expect(await reason(member, httpError(401, { error: 'unauthorized' }))).toBe('session');
    expect(await reason(own, httpError(400, { error: 'wrong_password' }))).toBe('wrongPassword');
    expect(await reason(own, httpError(429, { error: 'rate_limited' }))).toBe('rateLimited');
    expect(await reason(own, httpError(403, { error: 'admin_protected' }))).toBe('adminProtected');
  });

  it('błąd serwera, odpowiedź bramki i brak sieci', async () => {
    const member = (client: SupabaseClient) => deleteMember(client, ID);
    expect(await reason(member, httpError(500, { error: 'failed' }))).toBe('unknown');
    expect(await reason(member, httpError(504, { msg: 'timeout' }))).toBe('unknown');
    expect(
      await reason(member, new FunctionsHttpError(new Response('<html>', { status: 502 }))),
    ).toBe('unknown');
    expect(await reason(member, new FunctionsFetchError(new TypeError('offline')))).toBe('network');
  });
});
