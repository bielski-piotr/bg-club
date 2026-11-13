/**
 * Testy obsługi żądania `create-member` z atrapami Auth i bazy (`deno test`, katalog
 * `supabase/functions`). Prawdziwe API sprawdza `pnpm test:auth`.
 */
import { assert, assertEquals, assertFalse, assertMatch } from 'jsr:@std/assert@1.0.14';
import type { CreateAccountResult } from '../../../packages/accounts/src/member.ts';
import { type CreateMemberDeps, handleCreateMember } from './handler.ts';

const ADMIN = 'admin-id';
const PLAYER = 'player-id';
const TOKENS: Readonly<Record<string, string>> = { 'admin-token': ADMIN, 'player-token': PLAYER };

function setup(options: { failAuth?: boolean } = {}) {
  const logs: string[] = [];
  const created: string[] = [];
  const deps: CreateMemberDeps = {
    authenticate: (token) => Promise.resolve(TOKENS[token] ?? null),
    isActiveAdmin: (id) => Promise.resolve(id === ADMIN),
    accounts: {
      hookTaken: () => Promise.resolve(false),
      createAccount: ({ email }): Promise<CreateAccountResult> => {
        if (options.failAuth) {
          return Promise.resolve({ ok: false, emailTaken: false, message: 'auth down' });
        }
        created.push(email);
        return Promise.resolve({ ok: true, userId: `user-${created.length}` });
      },
    },
    log: (event, detail) => logs.push(JSON.stringify({ event, ...detail })),
  };
  return { deps, logs, created };
}

function post(body: unknown, token?: string): Request {
  return new Request('http://localhost/create-member', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const NEW_MEMBER = { firstName: 'Łukasz', lastName: 'Żółw' };

Deno.test('administrator tworzy członka: hook, hasło i profil w odpowiedzi bez cache', async () => {
  const { deps, logs, created } = setup();
  const response = await handleCreateMember(post(NEW_MEMBER, 'admin-token'), deps);
  assertEquals(response.status, 201);
  assertEquals(response.headers.get('Cache-Control'), 'no-store');
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
  const body = await response.json();
  assertMatch(body.member.hook, /^lukasz-zolw-[0-9a-f]{4}$/);
  assertEquals(body.member, {
    id: 'user-1',
    hook: body.member.hook,
    first_name: 'Łukasz',
    last_name: 'Żółw',
    role: 'player',
    avatar_path: null,
    deleted_at: null,
  });
  assert(body.password.length >= 12);
  assertEquals(created, [`${body.member.hook}@users.bgclub.invalid`]);
  // Hasło nie trafia do logów serwera.
  assertFalse(logs.join('\n').includes(body.password));
});

Deno.test('gracz nie doda członka (403) i nic nie powstaje', async () => {
  const { deps, created } = setup();
  const response = await handleCreateMember(post(NEW_MEMBER, 'player-token'), deps);
  assertEquals(response.status, 403);
  assertEquals(await response.json(), { error: 'forbidden' });
  assertEquals(created, []);
});

Deno.test('bez tokenu albo z nieważnym tokenem: 401', async () => {
  const { deps, created } = setup();
  for (const token of [undefined, 'obcy-token']) {
    const response = await handleCreateMember(post(NEW_MEMBER, token), deps);
    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: 'unauthorized' });
  }
  assertEquals(created, []);
});

Deno.test('niepoprawna treść i puste pola: 400 z kodami pól', async () => {
  const { deps, created } = setup();
  const broken = await handleCreateMember(post('{nie json', 'admin-token'), deps);
  assertEquals(await broken.json(), { error: 'invalid_body' });
  const wrongType = await handleCreateMember(post({ firstName: 1 }, 'admin-token'), deps);
  assertEquals(await wrongType.json(), { error: 'invalid_body' });
  const tooBig = await handleCreateMember(
    post({ firstName: 'a'.repeat(5000), lastName: 'b' }, 'admin-token'),
    deps,
  );
  assertEquals(tooBig.status, 400);
  const blank = await handleCreateMember(
    post({ firstName: '  ', lastName: 'x'.repeat(51) }, 'admin-token'),
    deps,
  );
  assertEquals(blank.status, 400);
  assertEquals(await blank.json(), {
    error: 'invalid_input',
    problems: { firstName: 'required', lastName: 'tooLong' },
  });
  assertEquals(created, []);
});

Deno.test('błąd Auth: 500 bez szczegółów w odpowiedzi', async () => {
  const { deps, logs } = setup({ failAuth: true });
  const response = await handleCreateMember(post(NEW_MEMBER, 'admin-token'), deps);
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: 'failed' });
  assert(logs.some((line) => line.includes('auth down')));
});

Deno.test('preflight CORS i inne metody', async () => {
  const { deps } = setup();
  const preflight = await handleCreateMember(
    new Request('http://localhost/create-member', { method: 'OPTIONS' }),
    deps,
  );
  assertEquals(preflight.status, 204);
  assertMatch(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /authorization/);
  const get = await handleCreateMember(new Request('http://localhost/create-member'), deps);
  assertEquals(get.status, 405);
});
