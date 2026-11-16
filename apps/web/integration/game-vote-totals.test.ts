/** Prawdziwy Auth/PostgREST. Wymaga pustego, własnego lokalnego stosu i jawnego pliku statusu. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bootstrapAdmin } from '../../../packages/accounts/src/bootstrap.ts';
import { generatePassword, hookToEmail } from '../../../packages/accounts/src/index.ts';

const statusFile = process.env.BG_CLUB_TEST_STACK_FILE;
assert.ok(statusFile, 'Podaj BG_CLUB_TEST_STACK_FILE ze statusem własnego lokalnego Supabase');
const stack = JSON.parse(readFileSync(statusFile, 'utf8')) as Record<string, string>;
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(stack.API_URL ?? ''), 'Test wymaga lokalnego API');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
function field(name: string): string {
  const value = stack[name];
  assert.ok(value, `Brak pola ${name} w statusie stosu`);
  return value;
}
const service = createClient(field('API_URL'), field('SERVICE_ROLE_KEY'), options);
const anonymous = () => createClient(field('API_URL'), field('ANON_KEY'), options);

function success(result: { error: { code?: string; message: string } | null }) {
  assert.equal(result.error, null);
}

test('GAME-12: agregat przez Auth i PostgREST', async (t) => {
  const empty = await service.from('profiles').select('id', { count: 'exact', head: true });
  success(empty);
  assert.equal(empty.count, 0, 'Test wymaga pustej instalacji, nie resetuje istniejącego stosu');
  const password = generatePassword();
  const adminAccount = await bootstrapAdmin(service, {
    firstName: 'Ada',
    lastName: 'Testowa',
    password,
  });
  assert.equal(adminAccount.status, 'created');
  async function login(hook: string, secret: string) {
    const client = anonymous();
    const auth = await client.auth.signInWithPassword({
      email: hookToEmail(hook),
      password: secret,
    });
    success(auth);
    assert.ok(auth.data.user);
    return { client, id: auth.data.user.id };
  }
  const admin = await login(adminAccount.hook, password);
  async function player(hook: string, firstName: string) {
    const secret = generatePassword();
    const created = await service.auth.admin.createUser({
      email: hookToEmail(hook),
      password: secret,
      email_confirm: true,
      app_metadata: { bg_club: { first_name: firstName, last_name: 'Testowa', role: 'player' } },
    });
    success(created);
    return login(hook, secret);
  }
  const bea = await player('bea-testowa-a002', 'Bea');
  const host = await player('celina-testowa-a003', 'Celina');
  const outside = await player('daria-testowa-a004', 'Daria');
  success(
    await admin.client.from('club').insert({ name: 'Klub Testowy', timezone: 'Europe/Warsaw' }),
  );
  const game = crypto.randomUUID();
  const other = crypto.randomUUID();
  const zero = crypto.randomUUID();
  success(
    await admin.client.from('games').insert(
      [game, other, zero].map((id, i) => ({
        id,
        title: ['Azul', 'Łąka', 'Bez głosów'][i],
        min_players: 1,
        max_players: 2,
        placement_points: [2, 1],
      })),
    ),
  );
  const meetings = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] as const;
  for (const id of meetings) {
    success(
      await admin.client.rpc('save_meeting', {
        meeting_id: id,
        title: 'Test głosów',
        local_date: '2027-01-16',
        local_time: '18:00',
        participant_ids: [bea.id, host.id],
        host_id: host.id,
      }),
    );
  }
  async function total(client: SupabaseClient, id = game) {
    const result = await client.rpc('game_vote_total', { game_id: id });
    success(result);
    return result.data as number | null;
  }
  const vote = (meeting: string, id = game) => ({
    meeting_id: meeting,
    game_id: id,
    profile_id: bea.id,
  });
  const publish = (meeting: string) =>
    admin.client.rpc('publish_meeting_games', { meeting_id: meeting, game_ids: [other] });

  await t.test('zero, brak gry, wiele spotkań i brak duplikatów', async () => {
    assert.equal(await total(bea.client), 0);
    assert.equal(await total(bea.client, crypto.randomUUID()), null);
    for (const meeting of meetings)
      success(await bea.client.from('game_votes').insert(vote(meeting)));
    success(await bea.client.from('game_votes').insert(vote(meetings[0], other)));
    assert.equal(
      (await bea.client.from('game_votes').insert(vote(meetings[0]))).error?.code,
      '23505',
    );
    success(
      await host.client.from('game_votes').insert({ ...vote(meetings[0]), profile_id: host.id }),
    );
    for (const { client } of [admin, bea, host, outside]) assert.equal(await total(client), 4);
    assert.equal(await total(outside.client, other), 1);
    assert.equal(await total(outside.client, zero), 0);
  });
  await t.test('publikacja, ponowne otwarcie, cofnięcie i ponowna publikacja', async () => {
    success(await publish(meetings[0]));
    assert.equal(await total(bea.client), 4);
    assert.ok((await host.client.rpc('reopen_voting', { meeting_id: meetings[0] })).error);
    success(await admin.client.rpc('reopen_voting', { meeting_id: meetings[0] }));
    success(await bea.client.from('game_votes').delete().match(vote(meetings[0])));
    assert.equal(await total(bea.client), 3);
    success(await publish(meetings[0]));
    assert.equal(await total(outside.client), 3);
  });
  await t.test('usunięcie otwartego i opublikowanego planu', async () => {
    const denied = await outside.client
      .from('meetings')
      .delete()
      .eq('id', meetings[0])
      .select('id');
    success(denied);
    assert.deepEqual(denied.data, []);
    success(await admin.client.from('meetings').delete().eq('id', meetings[0]));
    assert.equal(await total(outside.client), 2);
    assert.equal(await total(outside.client, other), 0);
    success(await admin.client.from('meetings').delete().eq('id', meetings[1]));
    assert.equal(await total(bea.client), 1);
  });
  await t.test('historia po rozpoczęciu, zakończeniu i usunięciu członka', async () => {
    success(await host.client.rpc('start_meeting', { meeting_id: meetings[2] }));
    assert.equal(await total(bea.client), 1);
    success(await host.client.rpc('finish_meeting', { meeting_id: meetings[2] }));
    success(
      await service
        .from('profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', bea.id),
    );
    assert.equal(await total(outside.client), 1);
    success(
      await admin.client
        .from('games')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', game),
    );
    assert.equal(await total(outside.client), 1);
  });
  await t.test('anon, usunięty członek i brak publicznego dostępu do migawek', async () => {
    assert.ok((await anonymous().rpc('game_vote_total', { game_id: game })).error);
    assert.equal(await total(bea.client), null);
    assert.ok((await outside.client.schema('private').from('meeting_voters').select('*')).error);
    const scalar = await total(outside.client);
    assert.equal(typeof scalar, 'number');
  });
});
