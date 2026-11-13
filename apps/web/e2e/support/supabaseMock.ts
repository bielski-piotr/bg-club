import type { Page, Request, Route } from '@playwright/test';

/**
 * Atrapa API Supabase (Auth i PostgREST) dla E2E. Aplikacja jest zbudowana z adresem
 * `http://127.0.0.1:54321` (playwright.config.ts); każde żądanie pod ten adres obsługuje ta
 * atrapa, a nieznane dostaje 501, więc test nigdy nie trafi do prawdziwej bazy. Prawdziwe Auth
 * sprawdzają testy integracyjne (`pnpm test:auth`). Dane są fikcyjne.
 */
export const SUPABASE_URL = 'http://127.0.0.1:54321';
/** Klucz sesji supabase-js: `sb-<pierwszy człon hosta>-auth-token`. */
export const SESSION_STORAGE_KEY = 'sb-127-auth-token';

export interface MockProfile {
  readonly id: string;
  readonly hook: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly role: 'admin' | 'player';
  readonly deleted_at: string | null;
}

export const ADA: MockProfile = {
  id: '00000000-0000-4000-a000-000000000001',
  hook: 'ada-adminowska-a001',
  first_name: 'Ada',
  last_name: 'Adminowska',
  role: 'admin',
  deleted_at: null,
};

/** Fikcyjny członek klubu o numerze `n` (id i hook wyprowadzone z numeru). */
export function member(n: number, first: string, last: string, deleted = false): MockProfile {
  const suffix = n.toString(16).padStart(4, '0');
  return {
    id: `00000000-0000-4000-a000-${n.toString(16).padStart(12, '0')}`,
    hook: `${first}-${last}-${suffix}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9-]/g, ''),
    first_name: first,
    last_name: last,
    role: 'player',
    deleted_at: deleted ? '2026-11-01T10:00:00Z' : null,
  };
}

export const ADA_EMAIL = `${ADA.hook}@users.bgclub.invalid`;

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Token w formacie JWT (bez prawdziwego podpisu), ważny `seconds` sekund od teraz. */
function accessToken(seconds: number, serial: number): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({
      sub: ADA.id,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now,
      exp: now + seconds,
      n: serial,
    }),
    'podpis',
  ].join('.');
}

let serial = 0;

/** Sesja jak z `POST /auth/v1/token`. Ujemne `seconds` = token już wygasł. */
export function session(seconds = 3600) {
  serial += 1;
  return {
    access_token: accessToken(seconds, serial),
    token_type: 'bearer',
    expires_in: seconds,
    expires_at: Math.floor(Date.now() / 1000) + seconds,
    refresh_token: `refresh-${serial}`,
    user: {
      id: ADA.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: ADA_EMAIL,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-11-13T08:00:00Z',
    },
  };
}

export type AuthReply =
  | { readonly kind: 'session' }
  | { readonly kind: 'invalidCredentials' }
  | { readonly kind: 'accountInactive' }
  | { readonly kind: 'offline' };

export interface MockOptions {
  /** Odpowiedź na logowanie hasłem (domyślnie: sesja). */
  password?: AuthReply;
  /** Odpowiedź na odświeżenie sesji (domyślnie: nowa sesja). */
  refresh?: AuthReply;
  /** Profil zalogowanej Ady zwracany przez RLS (`null` = konto usunięte, RLS nic nie zwraca). */
  profile?: MockProfile | null;
  /** Pozostali członkowie klubu, także usunięci (`deleted_at`). */
  members?: readonly MockProfile[];
  /** Klub (`null` = jeszcze nie założony). */
  club?: { readonly name: string; readonly logo_path: string | null } | null;
}

export interface SupabaseMock {
  readonly options: MockOptions;
  /** Żądania do API w kolejności, np. `POST /auth/v1/token?grant_type=password`. */
  readonly calls: string[];
  readonly passwordBodies: unknown[];
}

async function reply(route: Route, kind: AuthReply) {
  switch (kind.kind) {
    case 'session':
      return route.fulfill({ json: session() });
    case 'invalidCredentials':
      return route.fulfill({
        status: 400,
        json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
      });
    case 'accountInactive':
      return route.fulfill({
        status: 403,
        json: { code: 403, error_code: 'unknown', msg: 'account_inactive' },
      });
    case 'offline':
      return route.abort('internetdisconnected');
  }
}

function describe(request: Request): string {
  const url = new URL(request.url());
  return `${request.method()} ${url.pathname}${url.search}`;
}

export async function mockSupabase(page: Page, options: MockOptions = {}): Promise<SupabaseMock> {
  const mock: SupabaseMock = { options, calls: [], passwordBodies: [] };
  await page.route(`${SUPABASE_URL}/**`, async (route, request) => {
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    mock.calls.push(describe(request));

    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      mock.passwordBodies.push(request.postDataJSON());
      return reply(route, mock.options.password ?? { kind: 'session' });
    }
    if (
      url.pathname === '/auth/v1/token' &&
      url.searchParams.get('grant_type') === 'refresh_token'
    ) {
      return reply(route, mock.options.refresh ?? { kind: 'session' });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/profiles') {
      const own = mock.options.profile === undefined ? ADA : mock.options.profile;
      // Konto usunięte nie widzi nic (RLS wymaga aktywnego profilu).
      let rows = own ? [own, ...(mock.options.members ?? [])] : [];
      const id = url.searchParams.get('id');
      if (id?.startsWith('eq.')) rows = rows.filter((row) => row.id === id.slice(3));
      if (url.searchParams.get('deleted_at') === 'is.null') {
        rows = rows.filter((row) => row.deleted_at === null);
      }
      rows = [...rows].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'pl'),
      );
      return route.fulfill({ json: rows });
    }
    if (url.pathname === '/rest/v1/club') {
      const club = mock.options.club ?? null;
      return route.fulfill({ json: club ? [club] : [] });
    }
    return route.fulfill({ status: 501, json: { msg: `brak atrapy: ${describe(request)}` } });
  });
  return mock;
}

/** Zapamiętana sesja w `localStorage` przed startem aplikacji (jak po wcześniejszym logowaniu). */
export async function storeSession(page: Page, value: ReturnType<typeof session>) {
  await page.addInitScript(
    ([key, json]) => {
      // Tylko przy pierwszym wczytaniu: przeładowanie strony ma widzieć stan zapisany przez aplikację.
      if (!sessionStorage.getItem('e2e-session-seeded')) {
        sessionStorage.setItem('e2e-session-seeded', '1');
        localStorage.setItem(key, json);
      }
    },
    [SESSION_STORAGE_KEY, JSON.stringify(value)] as const,
  );
}
