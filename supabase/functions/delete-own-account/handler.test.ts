/**
 * Testy obsługi żądania `delete-own-account` z atrapami bazy i Auth (`deno test`, katalog
 * `supabase/functions`). Prawdziwe API i skutki w bazie sprawdza `pnpm test:auth`.
 */
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1.0.14';
import { PLAYER_ID, post, testStore } from '../_shared/testStore.ts';
import {
  type DeleteOwnAccountDeps,
  handleDeleteOwnAccount,
  type PasswordCheck,
} from './handler.ts';

const URL = 'http://localhost/delete-own-account';
const PASSWORD = 'poprawne-haslo-gracza';

function setup(options: { failAuthDelete?: boolean; check?: PasswordCheck } = {}) {
  const fake = testStore(options);
  const logs: string[] = [];
  const checked: string[] = [];
  const deps: DeleteOwnAccountDeps = {
    store: fake.store,
    verifyPassword: (hook, password) => {
      checked.push(hook);
      return Promise.resolve(options.check ?? (password === PASSWORD ? 'ok' : 'wrong'));
    },
    log: (event, detail) => logs.push(JSON.stringify({ event, ...detail })),
  };
  return { ...fake, deps, logs, checked };
}

Deno.test('gracz usuwa własne konto po potwierdzeniu hasłem', async () => {
  const { deps, calls, checked, logs, profiles } = setup();
  const response = await handleDeleteOwnAccount(
    post(URL, { password: PASSWORD }, 'player-token'),
    deps,
  );
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Cache-Control'), 'no-store');
  assertEquals(await response.json(), { deleted: true });
  // Hasło sprawdzamy dla hooka z profilu, nie z treści żądania.
  assertEquals(checked, ['bartek-gracz-0002']);
  assertEquals(calls, [`profile:${PLAYER_ID}`, `auth:${PLAYER_ID}`]);
  assert(profiles.get(PLAYER_ID)?.deleted);
  assertFalse(logs.join('\n').includes(PASSWORD));
});

Deno.test('złe hasło: 400 wrong_password i konto zostaje', async () => {
  const { deps, calls, logs } = setup();
  const response = await handleDeleteOwnAccount(
    post(URL, { password: 'zle-haslo-123456' }, 'player-token'),
    deps,
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: 'wrong_password' });
  assertEquals(calls, []);
  assertFalse(logs.join('\n').includes('zle-haslo-123456'));
});

Deno.test('limit prób logowania: 429 i konto zostaje', async () => {
  const { deps, calls } = setup({ check: 'rate_limited' });
  const response = await handleDeleteOwnAccount(
    post(URL, { password: PASSWORD }, 'player-token'),
    deps,
  );
  assertEquals(response.status, 429);
  assertEquals(await response.json(), { error: 'rate_limited' });
  assertEquals(calls, []);
});

Deno.test('administrator nie usunie swojego konta, nawet z poprawnym hasłem (403)', async () => {
  const { deps, calls, checked } = setup({ check: 'ok' });
  const response = await handleDeleteOwnAccount(
    post(URL, { password: PASSWORD }, 'admin-token'),
    deps,
  );
  assertEquals(response.status, 403);
  assertEquals(await response.json(), { error: 'admin_protected' });
  assertEquals(checked, []);
  assertEquals(calls, []);
});

Deno.test('bez tokenu, z nieważnym tokenem i z tokenem usuniętego konta: 401', async () => {
  const { deps, calls, checked } = setup();
  for (const token of [undefined, 'obcy-token', 'removed-token']) {
    const response = await handleDeleteOwnAccount(post(URL, { password: PASSWORD }, token), deps);
    assertEquals(response.status, 401);
    assertEquals(await response.json(), { error: 'unauthorized' });
  }
  assertEquals(checked, []);
  assertEquals(calls, []);
});

Deno.test('brak hasła albo niepoprawna treść: 400 invalid_body bez sprawdzania hasła', async () => {
  const { deps, checked } = setup();
  for (const body of ['{nie json', {}, { password: '' }, { password: 12 }, 'null']) {
    const response = await handleDeleteOwnAccount(post(URL, body, 'player-token'), deps);
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: 'invalid_body' });
  }
  const tooBig = await handleDeleteOwnAccount(
    post(URL, { password: 'x'.repeat(5000) }, 'player-token'),
    deps,
  );
  assertEquals(tooBig.status, 400);
  assertEquals(checked, []);
});

Deno.test('błąd Auth: 500 bez szczegółów w odpowiedzi', async () => {
  const { deps, logs } = setup({ failAuthDelete: true });
  const response = await handleDeleteOwnAccount(
    post(URL, { password: PASSWORD }, 'player-token'),
    deps,
  );
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: 'failed' });
  assert(logs.some((line) => line.includes('auth down')));
});

Deno.test('preflight CORS i inne metody', async () => {
  const { deps } = setup();
  const preflight = await handleDeleteOwnAccount(new Request(URL, { method: 'OPTIONS' }), deps);
  assertEquals(preflight.status, 204);
  const get = await handleDeleteOwnAccount(new Request(URL), deps);
  assertEquals(get.status, 405);
});
