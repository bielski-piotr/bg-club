// Integration test. Creates two new, isolated local Supabase projects, never resets an existing one.
import { randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { backup } from './backup.mjs';
import { api, database, fileHash, hash, jsonFile, objectUrl, root, run } from './runtime.mjs';

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
const callCli = (dir, args) => run(process.execPath, [cli, ...args, '--workdir', dir]);
const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};

async function free(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(new Error(`Port ${port} is occupied; no existing stack was changed.`)),
    );
    server.listen(port, '0.0.0.0', () => server.close(resolve));
  });
}

async function stack(base, name, prefix, inspector) {
  const dir = path.join(base, name);
  await mkdir(path.join(dir, 'supabase'), { recursive: true, mode: 0o700 });
  const config = (await readFile(path.join(root, 'supabase/config.toml'), 'utf8'))
    .replace('project_id = "bg-club"', `project_id = "${name}"`)
    .replaceAll(/543(2[0-9])/g, `${prefix}4$1`)
    .replace('inspector_port = 8083', `inspector_port = ${inspector}`);
  await writeFile(path.join(dir, 'supabase/config.toml'), config, { mode: 0o600 });
  await cp(path.join(root, 'supabase/migrations'), path.join(dir, 'supabase/migrations'), {
    recursive: true,
  });
  await mkdir(path.join(dir, 'supabase/seed'));
  console.log(`Starting isolated ${name} on ${prefix}421/${prefix}422`);
  await callCli(dir, [
    'start',
    '-x',
    'realtime,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor,edge-runtime',
  ]);
  const status = JSON.parse(await callCli(dir, ['status', '-o', 'json']));
  const env = {
    ...process.env,
    PGHOST: 'host.docker.internal',
    PGPORT: String(prefix) + '422',
    PGDATABASE: 'postgres',
    PGUSER: 'postgres',
    PGPASSWORD: 'postgres',
    PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '10',
    SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    BG_BACKUP_QUIESCED: 'yes',
    BG_RESTORE_TARGET: status.API_URL,
    BG_PG_CLIENT: 'docker',
  };
  check(status.API_URL === `http://127.0.0.1:${prefix}421`, 'Unexpected stack endpoint.');
  return { dir, env, anon: status.ANON_KEY, storage: api(env), db: database(env) };
}

async function rest(stack, table, method = 'GET', body, query = '', token) {
  return stack.storage.request(`/rest/v1/${table}${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(token ? { Authorization: `Bearer ${token}`, apikey: stack.anon } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function rpc(stack, name, body, token) {
  return rest(stack, 'rpc/' + name, 'POST', body, '', token);
}

async function login(stack, hook, password, expected = true) {
  const response = await fetch(`${stack.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: stack.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: hook + '@users.bgclub.invalid', password }),
  });
  check(response.ok === expected, 'Unexpected login result.');
  return expected ? response.json() : null;
}

async function upload(stack, bucket, name, bytes) {
  return stack.storage.request(objectUrl(bucket, name), {
    method: 'POST',
    body: bytes,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'max-age=7200',
      'x-metadata': Buffer.from(JSON.stringify({ fixture: true, bucket })).toString('base64'),
    },
  });
}

async function fixture(stack) {
  const users = [];
  for (const [index, role] of ['admin', 'player', 'player'].entries()) {
    const password = randomBytes(24).toString('base64url');
    const hook = `restore-test-${index}-` + randomBytes(2).toString('hex');
    const user = await stack.storage.request('/auth/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: hook + '@users.bgclub.invalid',
        password,
        email_confirm: true,
        app_metadata: { bg_club: { first_name: 'Fikcyjny', last_name: `Tester ${index}`, role } },
      }),
    });
    users.push({ id: user.id, hook, password });
  }
  const token = (await login(stack, users[0].hook, users[0].password)).access_token;
  const ids = {
    game: randomUUID(),
    pad: randomUUID(),
    meeting: randomUUID(),
    play: randomUUID(),
    draft: randomUUID(),
  };
  // Valid PNG bytes embedded in the test; no real photos or external assets.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uoAAAAASUVORK5CYII=',
    'base64',
  );
  const images = [
    ['avatars', users[0].id + '/avatar.png'],
    ['covers', 'club/logo.png'],
    ['covers', 'games/cover with space.png'],
    ['scorepads', ids.game + '/template.png'],
    ['sheets', ids.meeting + '/' + ids.play + '-aaaaaaaaaaaa.png'],
  ];
  for (const [bucket, name] of images) await upload(stack, bucket, name, png);
  // Extra bucket and nested/orphan objects prove discovery is not a hard-coded four-bucket list.
  await stack.storage.request('/storage/v1/bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'drill-extra',
      name: 'drill-extra',
      public: false,
      file_size_limit: 1024,
      allowed_mime_types: ['image/png'],
    }),
  });
  await upload(stack, 'drill-extra', 'nested/orphan/unreferenced.png', png);
  images.push(['drill-extra', 'nested/orphan/unreferenced.png']);
  await rest(
    stack,
    'profiles',
    'PATCH',
    { avatar_path: images[0][1], theme: 'dark' },
    `?id=eq.${users[0].id}`,
    token,
  );
  await rest(
    stack,
    'club',
    'POST',
    { name: 'Fikcyjny klub restore-drill', timezone: 'Europe/Warsaw', logo_path: images[1][1] },
    '',
    token,
  );
  await rest(
    stack,
    'games',
    'POST',
    {
      id: ids.game,
      title: 'Fikcyjna gra',
      min_players: 2,
      max_players: 3,
      placement_points: [10, 6, 4],
      cover_path: images[2][1],
    },
    '',
    token,
  );
  const template = {
    v: 2,
    lines: [
      { id: 'names', kind: 'names' },
      { id: 'a', kind: 'input' },
      { id: 'total', kind: 'total' },
    ],
    ranking: { line: 'a', dir: 'desc', tiebreak: [] },
  };
  const version = await rpc(
    stack,
    'save_scorepad',
    {
      game_id: ids.game,
      scorepad_id: ids.pad,
      name: 'Snapshot pierwszy',
      template,
      image_path: images[3][1],
      player_slots: 3,
    },
    token,
  );
  await rpc(
    stack,
    'save_meeting',
    {
      meeting_id: ids.meeting,
      title: 'Fikcyjne spotkanie',
      local_date: '2026-11-10',
      local_time: '18:00',
      participant_ids: users.map((u) => u.id),
      host_id: users[1].id,
    },
    token,
  );
  await rest(
    stack,
    'game_votes',
    'POST',
    { meeting_id: ids.meeting, game_id: ids.game, profile_id: users[0].id },
    '',
    token,
  );
  await rpc(
    stack,
    'publish_meeting_games',
    { meeting_id: ids.meeting, game_ids: [ids.game] },
    token,
  );
  await rpc(stack, 'start_meeting', { meeting_id: ids.meeting }, token);
  for (const play of [ids.play, ids.draft])
    await rpc(
      stack,
      'start_play',
      {
        play_id: play,
        meeting_id: ids.meeting,
        scorepad_id: ids.pad,
        player_ids: users.map((u) => u.id),
      },
      token,
    );
  const sheet = {
    game: 1,
    names: ['Fikcyjny A', 'Fikcyjny B', 'Fikcyjny C'],
    cells: { a: [7, 7, 1] },
  };
  await rpc(stack, 'save_play_draft', { play_id: ids.draft, sheet, base_version: 0 }, token);
  await rpc(
    stack,
    'save_play',
    {
      play_id: ids.play,
      scorepad_version_id: version.id,
      sheet,
      results: users.map((user, i) => ({
        profile_id: user.id,
        seat: i + 1,
        place: i === 2 ? 3 : 1,
        scores: { a: i === 2 ? 1 : 7 },
        ranking_value: i === 2 ? 1 : 7,
      })),
    },
    token,
  );
  await rpc(
    stack,
    'attach_play_sheet_image',
    { play_id: ids.play, image_path: images[4][1] },
    token,
  );
  // Change live settings after start. Historical points/template must survive without recomputation.
  await rest(
    stack,
    'games',
    'PATCH',
    { placement_points: [100, 60, 40] },
    `?id=eq.${ids.game}`,
    token,
  );
  await rpc(
    stack,
    'save_scorepad',
    {
      game_id: ids.game,
      scorepad_id: ids.pad,
      name: 'Snapshot drugi',
      template: { ...template, ranking: { ...template.ranking, dir: 'asc' } },
      image_path: images[3][1],
      player_slots: 3,
    },
    token,
  );
  await rest(
    stack,
    'profiles',
    'PATCH',
    { deleted_at: new Date().toISOString() },
    `?id=eq.${users[2].id}`,
  );
  await stack.storage.request('/auth/v1/admin/users/' + users[2].id, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ should_soft_delete: true }),
  });
  return { users, ids, images, version, sheet, png };
}

async function expectFailure(task, message) {
  let failed = false;
  try {
    await task();
  } catch (error) {
    failed = error.message.includes(message);
  }
  check(failed, 'Expected failure was not detected: ' + message);
}

async function projections(stack, fixture, token) {
  return {
    ranking: await rpc(stack, 'leaderboard', { kind: 'points' }, token),
    records: await rpc(stack, 'player_records', { profile_id: fixture.users[0].id }, token),
    plays: await rest(stack, 'plays', 'GET', undefined, '?select=*&order=id', token),
    results: await rest(
      stack,
      'play_results',
      'GET',
      undefined,
      '?select=*&order=play_id,seat',
      token,
    ),
  };
}

async function main() {
  // Only fixed unused test ports are accepted. A collision stops before creating any containers.
  for (const port of [
    ...Array.from({ length: 10 }, (_, i) => 55420 + i),
    ...Array.from({ length: 10 }, (_, i) => 56420 + i),
    18083,
    18084,
  ])
    await free(port);
  const base = await mkdtemp(path.join(os.tmpdir(), 'bg-club-restore-45-'));
  console.log(`Private drill directory: ${base}`);
  await expectFailure(() => backup('verify', root), 'outside the checkout');
  pass('Backup/restore directories inside the checkout are refused');
  const suffix = randomBytes(4).toString('hex');
  const source = await stack(base, 'bg45-source-' + suffix, '55', 18083);
  const target = await stack(base, 'bg45-target-' + suffix, '56', 18084);
  const fixtureData = await fixture(source);
  pass(
    'Fictional Auth accounts, soft deletion, two template versions, saved play, draft, results, unlocks, voter snapshot and six real images created',
  );
  const sourceToken = (
    await login(source, fixtureData.users[0].hook, fixtureData.users[0].password)
  ).access_token;
  const expected = await projections(source, fixtureData, sourceToken);
  await source.db.query("alter database postgres set timezone = 'Europe/Warsaw';");
  pass(
    'Source database default timezone differs from target; backup must normalize timestamps to UTC',
  );
  const dir = path.join(base, 'backup');
  const exported = await backup('export', dir, source.env);
  check(exported.objects === 6, 'Export missed Storage objects.');
  await backup('verify', dir);
  pass('Export and offline SHA-256 verification of database, migrations and all five buckets');
  // Every rejection below must leave the target empty, with no uploaded files/accounts.
  const object = (await jsonFile(path.join(dir, 'manifest.json'))).objects[0];
  const objectFile = path.join(dir, object.file);
  const original = await readFile(objectFile);
  await writeFile(objectFile, Buffer.from('corrupt'));
  await expectFailure(() => backup('restore', dir, target.env), 'checksum mismatch');
  await writeFile(objectFile, original);
  pass('Corrupt image rejected before target mutation');
  await expectFailure(
    () => backup('restore', dir, { ...target.env, BG_RESTORE_TARGET: source.env.SUPABASE_URL }),
    'exact reviewed target',
  );
  await expectFailure(
    () => backup('restore', dir, { ...target.env, PGPORT: source.env.PGPORT }),
    'Check the connection pair',
  );
  await expectFailure(() => backup('restore', dir, source.env), 'never the backup source');
  pass('Wrong target confirmation and restore to source rejected');
  await target.db.query('create table public.drill_schema_mismatch (id int);');
  await expectFailure(() => backup('restore', dir, target.env), 'schema/Auth layout differs');
  await target.db.query('drop table public.drill_schema_mismatch;');
  pass('Schema mismatch rejected before mutation');
  await rest(target, 'club', 'POST', { name: 'Must not overwrite', timezone: 'UTC' });
  await expectFailure(() => backup('restore', dir, target.env), 'Target contains');
  await rest(target, 'club', 'DELETE', undefined, '?id=eq.1');
  pass('Nonempty database refused without overwrite');
  await upload(target, 'covers', 'must-not-overwrite.png', fixtureData.png);
  await expectFailure(() => backup('restore', dir, target.env), 'Storage contains');
  await target.storage.request('/storage/v1/object/covers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: ['must-not-overwrite.png'] }),
  });
  check(
    Number(await target.db.query('select count(*) from auth.users;')) === 0 &&
      Number(await target.db.query('select count(*) from storage.objects;')) === 0,
    'Rejected restore mutated the target.',
  );
  pass('Nonempty Storage refused without overwrite');
  // A trusted but failing SQL bundle must roll back all accounts/data. Storage is not transactional.
  const manifestFile = path.join(dir, 'manifest.json');
  const dataFile = path.join(dir, 'data.sql');
  const savedManifest = await readFile(manifestFile);
  const savedData = await readFile(dataFile);
  const modified = await jsonFile(manifestFile);
  await writeFile(dataFile, Buffer.concat([savedData, Buffer.from('\nSELECT 1/0;\n')]));
  modified.files['data.sql'] = await fileHash(dataFile);
  await writeFile(manifestFile, JSON.stringify(modified));
  await expectFailure(() => backup('restore', dir, target.env), 'failed');
  check(
    Number(await target.db.query('select count(*) from auth.users;')) === 0 &&
      Number(await target.db.query('select count(*) from public.plays;')) === 0 &&
      Number(await target.db.query('select count(*) from public.profiles;')) === 0,
    'SQL failure left partial accounts or history.',
  );
  check(
    Number(await target.db.query('select count(*) from storage.objects;')) === 6,
    'SQL failure fixture did not upload real files.',
  );
  for (const bucket of modified.buckets) {
    const prefixes = modified.objects.filter((o) => o.bucket === bucket.id).map((o) => o.name);
    if (prefixes.length)
      await target.storage.request('/storage/v1/object/' + bucket.id, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes }),
      });
  }
  await writeFile(dataFile, savedData);
  await writeFile(manifestFile, savedManifest);
  pass(
    'Real SQL import failure rolls back all accounts/history; Storage leftovers confirmed and removed only from the disposable target',
  );
  // Prove the bundle is self-contained: destroy a real source file and saved play through API.
  await source.storage.request('/storage/v1/object/drill-extra', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: ['nested/orphan/unreferenced.png'] }),
  });
  await rpc(source, 'delete_play', { play_id: fixtureData.ids.play }, sourceToken);
  pass('Actual source data loss: saved play deleted and one physical Storage object removed');
  const restored = await backup('restore', dir, target.env);
  check(restored.objects === 6, 'Restore missed objects.');
  pass('Restore into separate empty stack; every table row and object SHA-256 matched the export');
  await expectFailure(() => backup('restore', dir, target.env), 'Target contains');
  pass('Accidental second restore rejected');
  const targetSession = await login(
    target,
    fixtureData.users[0].hook,
    fixtureData.users[0].password,
  );
  const playerSession = await login(
    target,
    fixtureData.users[1].hook,
    fixtureData.users[1].password,
  );
  check(
    targetSession.user.id === fixtureData.users[0].id &&
      playerSession.user.id === fixtureData.users[1].id,
    'Restored Auth UUID changed.',
  );
  await login(target, fixtureData.users[2].hook, fixtureData.users[2].password, false);
  pass('Original passwords log in admin/player with identical UUID; deleted account cannot log in');
  const actual = await projections(target, fixtureData, targetSession.access_token);
  check(same(actual, expected), 'History/ranking/record projections changed.');
  check(
    actual.results
      .filter((r) => r.play_id === fixtureData.ids.play)
      .map((r) => r.points)
      .join(',') === '8,8,4',
    'Historical tie points changed.',
  );
  check(
    actual.plays.find((p) => p.id === fixtureData.ids.play).scorepad_version_id ===
      fixtureData.version.id,
    'Historical template version changed.',
  );
  pass(
    'Authenticated history, ranking, unlocks, old snapshot and tied points 8/8/4 are unchanged after live settings changed',
  );
  for (const [bucket, name] of fixtureData.images) {
    const response = await fetch(`${target.env.SUPABASE_URL}${objectUrl(bucket, name)}`, {
      headers: { apikey: target.anon, Authorization: `Bearer ${playerSession.access_token}` },
    });
    // An extra bucket has no app read policy; service role can verify it, regular players cannot.
    if (bucket === 'drill-extra') check(!response.ok, 'Extra private bucket leaked to a player.');
    else
      check(
        response.ok && hash(Buffer.from(await response.arrayBuffer())) === hash(fixtureData.png),
        'Player could not read restored image bytes.',
      );
    const anonymous = await fetch(`${target.env.SUPABASE_URL}${objectUrl(bucket, name)}`, {
      headers: { apikey: target.anon },
    });
    check(!anonymous.ok, 'Private image leaked anonymously.');
  }
  pass('Restored app image bytes readable by an active player, private images denied anonymously');
  const draft = actual.plays.find((p) => p.id === fixtureData.ids.draft);
  await rpc(
    target,
    'save_play_draft',
    {
      play_id: draft.id,
      sheet: { ...fixtureData.sheet, game: 2 },
      base_version: draft.draft_version,
    },
    targetSession.access_token,
  );
  const newcomer = await target.storage.request('/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'restore-new-a123@users.bgclub.invalid',
      password: randomBytes(24).toString('hex'),
      email_confirm: true,
      app_metadata: { bg_club: { first_name: 'Nowy', last_name: 'Fikcyjny', role: 'player' } },
    }),
  });
  check(
    (await rest(target, 'profiles', 'GET', undefined, `?id=eq.${newcomer.id}`)).length === 1,
    'Auth profile trigger did not resume.',
  );
  pass('After restore draft saving works and Auth trigger creates a profile for a new account');
  const refresh = await fetch(`${target.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: target.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: playerSession.refresh_token }),
  });
  check(refresh.ok, 'Session refresh failed after restore.');
  await rest(
    target,
    'profiles',
    'PATCH',
    { deleted_at: new Date().toISOString() },
    `?id=eq.${fixtureData.users[1].id}`,
  );
  await login(target, fixtureData.users[1].hook, fixtureData.users[1].password, false);
  pass(
    'Session refresh works; configured Auth hook refuses an existing account after profile deactivation',
  );
  const manifest = await jsonFile(manifestFile);
  const report = {
    date: new Date().toISOString(),
    node: process.version,
    cli: await callCli(source.dir, ['--version']),
    postgres: await source.db.query('show server_version;'),
    images: await Promise.all(
      ['db', 'auth', 'storage'].map((name) =>
        run('docker', [
          'inspect',
          `supabase_${name}_${path.basename(source.dir)}`,
          '--format',
          '{{.Config.Image}}',
        ]),
      ),
    ),
    migrations: manifest.migrations.length,
    tableCounts: Object.fromEntries(
      Object.entries(manifest.tables).map(([name, data]) => [name, data.rows]),
    ),
    exported,
    restored,
    checks,
  };
  await writeFile(path.join(base, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  // Stop only these exact generated projects and remove their disposable volumes.
  await callCli(source.dir, ['stop', '--no-backup']);
  await callCli(target.dir, ['stop', '--no-backup']);
  console.log(
    `PASS ${checks.length} checks. Disposable stacks removed. Private backup/report retained outside Git.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : 'Restore drill failed.');
  console.error(
    'Only generated bg45 projects may remain. Inspect their private configs; never reset another installation.',
  );
  process.exitCode = 1;
}
