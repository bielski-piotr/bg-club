import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  api,
  database,
  externalDirectory,
  fileHash,
  hash,
  jsonFile,
  objectUrl,
  qualified,
  root,
  run,
} from './runtime.mjs';

// Accounts keep their UUID, password hash, identity and soft deletion state. Existing sessions,
// OTP/login flows and audit logs are intentionally not migrated. BG Club has email/password only.
const accounts = ['auth.users', 'auth.identities'];
const transientAuth = [
  'audit_log_entries',
  'flow_state',
  'sessions',
  'refresh_tokens',
  'one_time_tokens',
  'mfa_amr_claims',
  'mfa_challenges',
  'saml_relay_states',
  'oauth_client_states',
  'webauthn_challenges',
];
const migrationDir = path.join(root, 'supabase/migrations');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const save = (file, data) =>
  writeFile(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });

async function inventory(db) {
  return db.json(`select json_build_object(
    'buckets', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'public', public,
      'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id collate "C") from storage.buckets), '[]'),
    'objects', coalesce((select json_agg(json_build_object('bucket', bucket_id, 'name', name,
      'metadata', metadata, 'user_metadata', user_metadata) order by bucket_id collate "C", name collate "C") from storage.objects), '[]')
  );`);
}

async function tables(db) {
  const application =
    await db.json(`select coalesce(json_agg(schemaname || '.' || tablename order by schemaname, tablename), '[]')
    from pg_tables where schemaname in ('public', 'private');`);
  return [...accounts, ...application];
}

async function unsupported(db) {
  const authTables = await db.json(
    `select json_agg(tablename order by tablename) from pg_tables where schemaname = 'auth';`,
  );
  for (const name of authTables.filter(
    (name) => !['users', 'identities', 'schema_migrations', ...transientAuth].includes(name),
  )) {
    check(
      Number(await db.query(`select count(*) from ${qualified('auth.' + name)};`)) === 0,
      'Unsupported Auth configuration contains data. This tool supports BG Club email/password accounts only.',
    );
  }
  check(
    Number(await db.query("select count(*) from auth.identities where provider <> 'email';")) === 0,
    'Unsupported identity provider.',
  );
  check(
    Number(await db.query('select count(*) from vault.secrets;')) === 0,
    'Vault secrets require a separate encryption-key migration.',
  );
  check(
    Number(await db.query('select count(*) from storage.buckets_vectors;')) === 0,
    'Vector storage is outside this backup format.',
  );
}

async function migrations(db) {
  const files = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
  const versions = await db.json(
    "select coalesce(json_agg(version order by version), '[]') from supabase_migrations.schema_migrations;",
  );
  check(
    equal(
      versions,
      files.map((name) => name.split('_')[0]),
    ),
    'Database migration history differs from this checkout.',
  );
  return Promise.all(
    files.map(async (name) => ({ name, sha256: await fileHash(path.join(migrationDir, name)) })),
  );
}

async function structure(db) {
  // Includes managed table layout and customizations on auth/storage without restoring their DDL.
  const layout = await db.json(`select json_build_object(
    'columns', (select json_agg(row_to_json(c) order by c.table_schema, c.table_name, c.ordinal_position)
      from (select table_schema, table_name, ordinal_position, column_name, data_type, udt_name,
        is_nullable, column_default, is_generated, generation_expression from information_schema.columns
        where table_schema in ('public', 'private', 'auth') or (table_schema = 'storage' and table_name in ('objects', 'buckets'))) c),
    'auth_version', (select json_agg(version order by version) from auth.schema_migrations),
    'triggers', (select json_agg(pg_get_triggerdef(t.oid) order by n.nspname,c.relname,t.tgname) from pg_trigger t
      join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
      where not t.tgisinternal and n.nspname in ('public','private','auth','storage') and pn.nspname in ('public','private')),
    'relations', (select json_agg(json_build_array(n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
        case when c.relkind='v' then pg_get_viewdef(c.oid,true) end,
        coalesce(c.relacl::text,'')) order by n.nspname,c.relname)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relkind in ('r','v','m','S')),
    'constraints', (select json_agg(json_build_array(n.nspname,cl.relname,c.conname,pg_get_constraintdef(c.oid)) order by n.nspname,cl.relname,c.conname)
      from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace
      where n.nspname in ('public','private','auth')),
    'indexes', (select json_agg(indexdef order by schemaname,tablename,indexname) from pg_indexes where schemaname in ('public','private')),
    'policies', (select json_agg(row_to_json(p) order by p.schemaname,p.tablename,p.policyname)
      from pg_policies p where p.schemaname in ('public','private','storage','auth'))
  );`);
  // Compare function source and EXECUTE grants, not randomized pg_dump headers.
  const schema =
    await db.query(`select coalesce(json_agg(json_build_array(pg_get_functiondef(p.oid),coalesce(p.proacl::text,'')) order by p.oid::regprocedure::text), '[]')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind in ('f','p');`);
  return hash(JSON.stringify(layout) + schema);
}

async function fingerprints(db, names) {
  const result = {};
  for (const name of names) result[name] = await db.fingerprint(name);
  return result;
}

async function assertApiPair(db, storage) {
  const expected = await db.json(
    "select coalesce(json_agg(id::text order by id), '[]') from auth.users;",
  );
  const ids = [];
  for (let page = 1; ; page++) {
    const { users } = await storage.request(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    ids.push(...users.map((user) => user.id));
    if (users.length < 1000) break;
  }
  check(
    equal(expected, ids.sort()),
    'Database and API account inventories differ. Check the connection pair.',
  );
  const buckets = await storage.request('/storage/v1/bucket');
  const local = await inventory(db);
  check(
    equal(
      local.buckets.map((b) => b.id),
      buckets.map((b) => b.id).sort(),
    ),
    'Database and Storage API bucket inventories differ.',
  );
}

async function references(db) {
  check(
    Number(
      await db.query(`select count(*) from auth.users u left join public.profiles p on p.id=u.id
    where u.deleted_at is null and p.id is null;`),
    ) === 0,
    'An Auth account has no corresponding profile.',
  );
  check(
    Number(
      await db.query(`select count(*) from public.profiles p left join auth.users u on u.id=p.id
    where p.deleted_at is null and (u.id is null or u.deleted_at is not null or u.email <> p.hook || '@users.bgclub.invalid');`),
    ) === 0,
    'An active profile has no matching Auth account.',
  );
  const missing = Number(
    await db.query(`select count(*) from (
    select 'avatars' bucket, avatar_path name from public.profiles where avatar_path is not null
    union all select 'covers', cover_path from public.games where cover_path is not null
    union all select 'covers', logo_path from public.club where logo_path is not null
    union all select 'scorepads', image_path from public.scorepad_versions where image_path is not null
    union all select 'sheets', sheet_image_path from public.plays where sheet_image_path is not null
  ) r left join storage.objects o on o.bucket_id=r.bucket and o.name=r.name where o.id is null;`),
  );
  check(missing === 0, 'An application image reference is missing from Storage.');
  // FK triggers were disabled while COPYing cyclic historical data. Recheck every FK explicitly,
  // including composite references. VALIDATE CONSTRAINT alone skips already-valid constraints.
  await db.query(`do $$ declare c record; cols text; target_cols text; present text; invalid boolean; begin
    for c in select con.*, ns.nspname from pg_constraint con join pg_class cl on cl.oid=con.conrelid
      join pg_namespace ns on ns.oid=cl.relnamespace
      where con.contype='f' and ns.nspname in ('public','private','auth') loop
      select string_agg(format('s.%I',a.attname), ',' order by k.n),
        string_agg(format('d.%I',b.attname), ',' order by k.n),
        string_agg(format('s.%I is not null',a.attname), ' and ' order by k.n)
        into cols,target_cols,present
        from unnest(c.conkey,c.confkey) with ordinality k(a,b,n)
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.a
        join pg_attribute b on b.attrelid=c.confrelid and b.attnum=k.b;
      if exists(select 1 from pg_class where oid=c.conrelid) then
        execute format('select exists(select 1 from %s s where %s and not exists(select 1 from %s d where row(%s)=row(%s)))',
          c.conrelid::regclass,present,c.confrelid::regclass,cols,target_cols) into strict invalid;
        if invalid then raise exception 'Foreign key check failed'; end if;
      end if;
    end loop;
  end $$;`);
}

async function checkedBundle(dir) {
  const manifest = await jsonFile(path.join(dir, 'manifest.json'));
  check(manifest.format === 1 && manifest.complete === true, 'Incomplete or unsupported backup.');
  for (const [name, sha256] of Object.entries(manifest.files)) {
    check(
      /^(data\.sql|schema-reference\.sql|migrations\/[a-zA-Z0-9_.-]+\.sql|objects\/[0-9]+\.bin)$/.test(
        name,
      ),
      'Unsafe backup filename.',
    );
    check((await fileHash(path.join(dir, name))) === sha256, 'Backup file checksum mismatch.');
  }
  check(
    manifest.files['data.sql'] && manifest.files['schema-reference.sql'],
    'Missing database backup files.',
  );
  for (const item of manifest.objects) {
    check(/^objects\/[0-9]+\.bin$/.test(item.file), 'Unsafe object filename.');
    objectUrl(item.bucket, item.name); // Validate every path before the first target mutation.
    check(
      manifest.files[item.file] && manifest.files[item.file] === item.sha256,
      'Missing object checksum.',
    );
  }
  for (const item of manifest.migrations) {
    check(manifest.files['migrations/' + item.name] === item.sha256, 'Missing migration checksum.');
  }
  return manifest;
}

export async function backup(command, directory, env = process.env) {
  check(
    ['export', 'verify', 'restore'].includes(command),
    'Use export, verify or restore --dir <private-directory>.',
  );
  const dir = await externalDirectory(directory, { create: command === 'export' });
  if (command === 'verify') {
    const manifest = await checkedBundle(dir);
    return {
      status: 'verified',
      objects: manifest.objects.length,
      tables: Object.keys(manifest.tables).length,
    };
  }
  check(env.BG_BACKUP_QUIESCED === 'yes', 'Stop all writers, then set BG_BACKUP_QUIESCED=yes.');
  const db = database(env);
  const storage = api(env);
  const apiUrl = new URL(storage.url);
  const project = /^([a-z0-9]+)\.supabase\.co$/.exec(apiUrl.hostname)?.[1];
  if (project) {
    check(
      env.PGHOST === `db.${project}.supabase.co` || env.PGUSER === `postgres.${project}`,
      'API and database project refs differ. Check the connection pair.',
    );
    check(
      !(env.PGHOST.endsWith('.pooler.supabase.com') && env.PGPORT === '6543'),
      'Use the Session pooler, not the transaction pooler.',
    );
  } else if (['127.0.0.1', 'localhost'].includes(apiUrl.hostname)) {
    check(
      Number(env.PGPORT) === Number(apiUrl.port) + 1,
      'Local API/DB ports must match the Supabase CLI mapping. Check the connection pair.',
    );
  }
  if (command === 'export') {
    await unsupported(db);
    await references(db);
    await assertApiPair(db, storage);
    const names = await tables(db);
    const manifest = {
      format: 1,
      complete: false,
      createdAt: new Date().toISOString(),
      source: storage.url,
      revision: await run('git', ['-C', root, 'rev-parse', 'HEAD']),
      structure: await structure(db),
      migrations: await migrations(db),
      tables: await fingerprints(db, names),
      ...(await inventory(db)),
      files: {},
    };
    await mkdir(path.join(dir, 'migrations'), { mode: 0o700 });
    await mkdir(path.join(dir, 'objects'), { mode: 0o700 });
    for (const item of manifest.migrations)
      await copyFile(path.join(migrationDir, item.name), path.join(dir, 'migrations', item.name));
    await db.dump(
      ['--schema-only', '--schema=public', '--schema=private'],
      path.join(dir, 'schema-reference.sql'),
    );
    await db.dump(
      ['--data-only', ...names.map((name) => '--table=' + qualified(name))],
      path.join(dir, 'data.sql'),
    );
    for (const [index, item] of manifest.objects.entries()) {
      const bytes = await storage.request(objectUrl(item.bucket, item.name), { raw: true });
      check(
        Number(item.metadata?.size) === bytes.length,
        'Storage size differs from its database metadata.',
      );
      item.file = `objects/${index}.bin`;
      item.sha256 = hash(bytes);
      item.bytes = bytes.length;
      await writeFile(path.join(dir, item.file), bytes, { flag: 'wx', mode: 0o600 });
    }
    check(
      equal(manifest.tables, await fingerprints(db, names)) &&
        manifest.structure === (await structure(db)) &&
        equal(manifest.migrations, await migrations(db)) &&
        equal(
          {
            buckets: manifest.buckets,
            objects: manifest.objects.map(({ bucket, name, metadata, user_metadata }) => ({
              bucket,
              name,
              metadata,
              user_metadata,
            })),
          },
          await inventory(db),
        ),
      'Source changed during export. Discard this incomplete backup and stop writers.',
    );
    const files = [
      'data.sql',
      'schema-reference.sql',
      ...manifest.migrations.map((m) => 'migrations/' + m.name),
      ...manifest.objects.map((o) => o.file),
    ];
    for (const name of files) manifest.files[name] = await fileHash(path.join(dir, name));
    manifest.complete = true;
    await save(path.join(dir, 'manifest.json'), manifest);
    return { status: 'exported', objects: manifest.objects.length, tables: names.length };
  }

  const manifest = await checkedBundle(dir); // Validate every byte before any target mutation.
  check(
    env.BG_RESTORE_TARGET === storage.url,
    'Set BG_RESTORE_TARGET to the exact reviewed target API origin.',
  );
  check(
    storage.url !== manifest.source,
    'Restore requires a separate project, never the backup source.',
  );
  await unsupported(db);
  await assertApiPair(db, storage);
  check(equal(manifest.migrations, await migrations(db)), 'Target migration files/history differ.');
  check(
    manifest.structure === (await structure(db)),
    'Target schema/Auth layout differs. Use matching service versions and migrations.',
  );
  const names = await tables(db);
  check(equal(names, Object.keys(manifest.tables)), 'Target table inventory differs.');
  const before = await fingerprints(db, names);
  check(
    Object.values(before).every((item) => item.rows === 0),
    'Target contains accounts or application data. Nothing was overwritten.',
  );
  const targetInventory = await inventory(db);
  check(
    targetInventory.objects.length === 0,
    'Target Storage contains objects. Nothing was overwritten.',
  );
  const existing = new Map(targetInventory.buckets.map((b) => [b.id, b]));
  check(
    [...existing.keys()].every((id) => manifest.buckets.some((b) => b.id === id)),
    'Target has extra buckets.',
  );
  for (const bucket of manifest.buckets) {
    check(
      !existing.has(bucket.id) || equal(existing.get(bucket.id), bucket),
      'Target bucket settings differ.',
    );
  }
  // Upload first. A failed SQL transaction leaves only files on this disposable target, no half accounts.
  // Never COPY storage.objects: its metadata and the physical bytes must be created together by Storage.
  for (const bucket of manifest.buckets) {
    if (!existing.has(bucket.id))
      await storage.request('/storage/v1/bucket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: bucket.id,
          name: bucket.name,
          public: bucket.public,
          file_size_limit: bucket.file_size_limit,
          allowed_mime_types: bucket.allowed_mime_types,
        }),
      });
  }
  for (const item of manifest.objects) {
    await storage.request(objectUrl(item.bucket, item.name), {
      method: 'POST',
      headers: {
        'Content-Type': item.metadata?.mimetype || 'application/octet-stream',
        'Cache-Control': item.metadata?.cacheControl || 'max-age=3600',
        'x-upsert': 'false',
        ...(item.user_metadata
          ? { 'x-metadata': Buffer.from(JSON.stringify(item.user_metadata)).toString('base64') }
          : {}),
      },
      body: await readFile(path.join(dir, item.file)),
    });
    check(
      hash(await storage.request(objectUrl(item.bucket, item.name), { raw: true })) === item.sha256,
      'Restored object checksum differs.',
    );
  }
  // A private temporary wrapper avoids rewriting the backup. psql -1 rolls back on any COPY error.
  const restoreFile = path.join(dir, 'restore-' + Date.now() + '.sql');
  // Stream construction below keeps SQL data off the command line and out of errors.
  const { createReadStream, createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const { Readable } = await import('node:stream');
  async function* sql() {
    yield 'SET session_replication_role = replica;\n';
    yield* createReadStream(path.join(dir, 'data.sql'));
    yield '\nSET session_replication_role = origin;\n';
  }
  try {
    await pipeline(
      Readable.from(sql()),
      createWriteStream(restoreFile, { flags: 'wx', mode: 0o600 }),
    );
    await db.restore(restoreFile);
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(restoreFile, { force: true });
  }
  check(
    equal(manifest.tables, await fingerprints(db, names)),
    'Restored database row checksums differ. Keep the target offline.',
  );
  await references(db);
  await assertApiPair(db, storage);
  const after = await inventory(db);
  const objectProperties = (item) => [
    item.bucket,
    item.name,
    Number(item.metadata?.size),
    item.metadata?.mimetype,
    item.metadata?.cacheControl,
    item.user_metadata,
  ];
  check(
    equal(after.buckets, manifest.buckets) &&
      equal(after.objects.map(objectProperties), manifest.objects.map(objectProperties)),
    'Restored Storage inventory differs.',
  );
  return { status: 'restored', objects: manifest.objects.length, tables: names.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, flag, dir, ...extra] = process.argv.slice(2);
    check(
      flag === '--dir' && !extra.length,
      'Usage: node scripts/backup/backup.mjs export|verify|restore --dir <private-directory>',
    );
    console.log(JSON.stringify(await backup(command, dir)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Backup operation failed.');
    process.exitCode = 1;
  }
}
