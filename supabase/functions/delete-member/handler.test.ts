/**
 * Testy obsługi żądania `delete-member` z atrapami bazy i Auth (`deno test`, katalog
 * `supabase/functions`). Prawdziwe API i skutki w bazie sprawdza `pnpm test:auth`.
 */
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1.0.14';
import {
  ADMIN_ID,
  OTHER_ID,
  PLAYER_ID,
  post,
  REMOVED_ID,
  testStore,
} from '../_shared/testStore.ts';
import { type DeleteMemberDeps, handleDeleteMember } from './handler.ts';

const URL = 'http://localhost/delete-member';

function setup(options: { failAuthDelete?: boolean } = {}) {
  const fake = testStore(options);
  const logs: string[] = [];
  const deps: DeleteMemberDeps = {
    store: fake.store,
    log: (event, detail) => logs.push(JSON.stringify({ event, ...detail })),
  };
  return { ...fake, deps, logs };
}

Deno.test('administrator usuwa członka: najpierw profil, potem konto Auth', async () => {
  const { deps, calls, profiles } = setup();
  const response = await handleDeleteMember(
    post(URL, { memberId: PLAYER_ID }, 'admin-token'),
    deps,
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Cache-Control'), 'no-store');
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(await response.json(), { memberId: PLAYER_ID });
  assertEquals(calls, [`profile:${PLAYER_ID}`, `auth:${PLAYER_ID}`]);
  assert(profiles.get(PLAYER_ID)?.deleted);
});

Deno.test('identyfikator wielkimi literami wskazuje tego samego członka', async () => {
  const { deps, calls } = setup();
  const response = await handleDeleteMember(
    post(URL, { memberId: PLAYER_ID.toUpperCase() }, 'admin-token'),
    deps,
  );
  assertEquals(response.status, 200);
  assertEquals(calls, [`profile:${PLAYER_ID}`, `auth:${PLAYER_ID}`]);
});

Deno.test('ponowienie dla usuniętego członka kończy usuwanie konta Auth (200)', async () => {
  const { deps, calls } = setup();
  const response = await handleDeleteMember(
    post(URL, { memberId: REMOVED_ID }, 'admin-token'),
    deps,
  );
  assertEquals(response.status, 200);
  // Profil już ma deleted_at: zostaje bez zmian (data usunięcia się nie przesuwa).
  assertEquals(calls, [`auth:${REMOVED_ID}`]);
});

Deno.test('administratora nie da się usunąć (409) i nic się nie zmienia', async () => {
  const { deps, calls } = setup();
  const response = await handleDeleteMember(post(URL, { memberId: ADMIN_ID }, 'admin-token'), deps);
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: 'admin_protected' });
  assertEquals(calls, []);
});

Deno.test('gracz nie usunie członka (403)', async () => {
  const { deps, calls } = setup();
  const response = await handleDeleteMember(
    post(URL, { memberId: OTHER_ID }, 'player-token'),
    deps,
  );
  assertEquals(response.status, 403);
  assertEquals(await response.json(), { error: 'forbidden' });
  assertEquals(calls, []);
});

Deno.test('bez tokenu, z nieważnym tokenem i z tokenem usuniętego konta: 401', async () => {
  const { deps, calls } = setup();
  for (const token of [undefined, 'obcy-token', 'removed-token']) {
    const response = await handleDeleteMember(post(URL, { memberId: OTHER_ID }, token), deps);
    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: 'unauthorized' });
  }
  assertEquals(calls, []);
});

Deno.test('niepoprawna treść: 400; nieznany członek: 404', async () => {
  const { deps, calls } = setup();
  for (const body of ['{nie json', [PLAYER_ID], { memberId: 'nie-uuid' }, {}, { memberId: 7 }]) {
    const response = await handleDeleteMember(post(URL, body, 'admin-token'), deps);
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: 'invalid_body' });
  }
  const tooBig = await handleDeleteMember(
    post(URL, { memberId: PLAYER_ID, pad: 'x'.repeat(2000) }, 'admin-token'),
    deps,
  );
  assertEquals(tooBig.status, 400);
  const unknown = await handleDeleteMember(
    post(URL, { memberId: '00000000-0000-4000-a000-0000000000ff' }, 'admin-token'),
    deps,
  );
  assertEquals(unknown.status, 404);
  assertEquals(await unknown.json(), { error: 'not_found' });
  assertEquals(calls, []);
});

Deno.test(
  'błąd Auth po usunięciu profilu: 500 bez szczegółów, profil zostaje usunięty',
  async () => {
    const { deps, logs, profiles } = setup({ failAuthDelete: true });
    const response = await handleDeleteMember(
      post(URL, { memberId: PLAYER_ID }, 'admin-token'),
      deps,
    );
    assertEquals(response.status, 500);
    assertEquals(await response.json(), { error: 'failed' });
    assert(logs.some((line) => line.includes('auth down')));
    // Konto i tak nie zaloguje się (profil usunięty); ponowienie dokończy usuwanie w Auth.
    assert(profiles.get(PLAYER_ID)?.deleted);
  },
);

Deno.test('preflight CORS i inne metody', async () => {
  const { deps } = setup();
  const preflight = await handleDeleteMember(new Request(URL, { method: 'OPTIONS' }), deps);
  assertEquals(preflight.status, 204);
  assertMatch(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /authorization/);
  const get = await handleDeleteMember(new Request(URL), deps);
  assertEquals(get.status, 405);
});
