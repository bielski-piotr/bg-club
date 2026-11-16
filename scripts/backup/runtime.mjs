import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
export const qualified = (table) => table.split('.').map(identifier).join('.');
export const jsonFile = async (file) => JSON.parse(await readFile(file, 'utf8'));

// Never forward a child's stderr. psql errors can contain COPY rows, passwords or URLs.
export async function run(command, args, { env = process.env, input, output, digest } = {}) {
  const child = spawn(command, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume();
  child.stdin.on('error', () => {}); // Completion/pipeline reports failure without an unhandled EPIPE.
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`Cannot start ${path.basename(command)}.`)));
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${path.basename(command)} failed (${code}). Output withheld to protect data.`,
            ),
          ),
    );
  });
  // Observe rejections immediately, also while streaming a large input/output file.
  completed.catch(() => {});
  const tasks = [completed];
  if (output)
    tasks.push(pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 })));
  else
    child.stdout.on('data', (chunk) =>
      // JSON rows escape embedded CR. Strip only psql's Windows line-ending CR bytes.
      digest ? digest.update(chunk.filter((byte) => byte !== 13)) : chunks.push(chunk),
    );
  if (typeof input === 'string') child.stdin.end(input);
  else if (input) tasks.push(pipeline(input, child.stdin));
  else child.stdin.end();
  await Promise.all(tasks);
  return Buffer.concat(chunks).toString('utf8').trim();
}

export function database(env = process.env) {
  for (const name of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE']) {
    if (!env[name]) throw new Error(`Missing ${name}. Use a private environment file.`);
  }
  const pgEnv = {
    ...env,
    PGOPTIONS: '-c timezone=UTC -c datestyle=ISO,MDY',
    PGCLIENTENCODING: 'UTF8',
  };
  const pg = async (command, args, options = {}) => {
    if (env.BG_PG_CLIENT === 'native') return run(command, args, { env: pgEnv, ...options });
    const names = [
      'PGHOST',
      'PGPORT',
      'PGDATABASE',
      'PGUSER',
      'PGPASSWORD',
      'PGSSLMODE',
      'PGCONNECT_TIMEOUT',
      'PGOPTIONS',
      'PGCLIENTENCODING',
    ];
    return run(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '--add-host',
        'host.docker.internal:host-gateway',
        ...names.filter((name) => pgEnv[name]).flatMap((name) => ['-e', name]),
        env.BG_PG_IMAGE || 'public.ecr.aws/supabase/postgres:17.11.0.018',
        command,
        ...args,
      ],
      { env: pgEnv, ...options },
    );
  };
  const query = (sql) =>
    pg('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input: sql });
  return {
    query,
    json: async (sql) => JSON.parse(await query(sql)),
    dump: (args, file) =>
      pg('pg_dump', ['--no-owner', '--no-privileges', '--encoding=UTF8', ...args], {
        output: file,
      }),
    restore: (file) =>
      pg('psql', ['-X', '-q', '-1', '-v', 'ON_ERROR_STOP=1'], { input: createReadStream(file) }),
    fingerprint: async (table) => {
      const digest = createHash('sha256');
      await pg('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
        input: `select to_jsonb(t)::text from ${qualified(table)} t order by to_jsonb(t)::text collate "C";`,
        digest,
      });
      return {
        rows: Number(await query(`select count(*) from ${qualified(table)};`)),
        sha256: digest.digest('hex'),
      };
    },
  };
}

export function api(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Missing Supabase URL/service role key.');
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('Use HTTPS for remote Supabase.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Expected a plain Supabase API origin.');
  const request = async (pathname, { method = 'GET', body, headers = {}, raw = false } = {}) => {
    const response = await fetch(`${url.origin}${pathname}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...headers,
      },
      ...(body === undefined ? {} : { body }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const code = /^[a-zA-Z0-9_]{1,80}$/.test(detail.code || '') ? `, code ${detail.code}` : '';
      throw new Error(
        `Supabase request failed (HTTP ${response.status}${code}); details withheld.`,
      );
    }
    return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
  return { url: url.origin, request };
}

export function objectUrl(bucket, name) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(bucket) ||
    name.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Storage path contains segments that HTTP would normalize. Export stopped.');
  }
  return `/storage/v1/object/${[bucket, ...name.split('/')].map(encodeURIComponent).join('/')}`;
}

export async function externalDirectory(dir, { create = false } = {}) {
  if (!dir) throw new Error('Specify --dir with a private directory outside the checkout.');
  const absolute = path.resolve(dir);
  // Resolve existing ancestors to prevent symlink/junction paths into the checkout.
  let parent = absolute;
  const tail = [];
  while (true) {
    try {
      parent = await realpath(parent);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      tail.unshift(path.basename(parent));
      parent = path.dirname(parent);
    }
  }
  const resolved = path.join(parent, ...tail);
  const relative = path.relative(await realpath(root), resolved);
  if (
    !relative ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  ) {
    throw new Error('Backup directories must be outside the checkout.');
  }
  if (create) await mkdir(resolved, { mode: 0o700 }); // No recursive/existing directory reuse.
  return resolved;
}

export async function fileHash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
