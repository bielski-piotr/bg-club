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
  /** Zdjęcie w buckecie `avatars` (USR-3); brak = monogram. */
  readonly avatar_path?: string | null;
  /** Motyw z profilu (USR-8); brak = `system`. */
  readonly theme?: 'light' | 'dark' | 'system';
  /** Propozycja zmiany wygenerowanego hasła (AUTH-6); brak = `false`. */
  readonly password_change_suggested?: boolean;
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
      .replace(/ł/g, 'l')
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
  /** Klub (`null` = jeszcze nie założony). Zapis z aplikacji zmienia tę wartość. */
  club?: MockClub | null;
  /**
   * Zakładanie klubu odrzucone jak przy równoległej próbie (`23505`, klucz `club_pkey`):
   * w tej chwili inna karta zapisuje klub `club`.
   */
  clubConflict?: MockClub;
  /**
   * Odpowiedź Edge Function `create-member` (MEM-3). Domyślnie: członek utworzony z hookiem
   * z imienia i nazwiska, dopisany do `members`; inaczej podany status i treść błędu.
   */
  createMember?: { readonly status: number; readonly body: unknown };
  /**
   * Odpowiedź Auth na zmianę hasła (`PUT /auth/v1/user`, USR-5): kod błędu GoTrue, np.
   * `current_password_invalid`. Domyślnie: hasło zmienione.
   */
  updateUserError?: { readonly status: number; readonly code: string } | undefined;
}

/** Hasło, które atrapa `create-member` zwraca dla nowego członka (fikcyjne). */
export const NEW_MEMBER_PASSWORD = 'e2eHasloTestowe7';

export interface MockClub {
  readonly name: string;
  readonly logo_path: string | null;
  readonly timezone?: string;
}

/** Zapis klubu (`POST` = INSERT, `PATCH` = UPDATE) z treścią żądania. */
export interface ClubWrite {
  readonly method: 'POST' | 'PATCH';
  readonly body: Record<string, unknown>;
}

/** Plik 1×1 PNG odsyłany jako każdy obraz z prywatnego bucketu. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface SupabaseMock {
  readonly options: MockOptions;
  /** Żądania do API w kolejności, np. `POST /auth/v1/token?grant_type=password`. */
  readonly calls: string[];
  readonly passwordBodies: unknown[];
  readonly clubWrites: ClubWrite[];
  /** Ścieżki plików wysłanych do bucketu `covers` i z niego usuniętych. */
  readonly uploads: string[];
  readonly removed: string[];
  /** Treści żądań `POST /functions/v1/create-member`. */
  readonly memberBodies: unknown[];
  /** Zapisy własnego profilu (`PATCH /rest/v1/profiles`) z treścią żądania. */
  readonly profileWrites: Record<string, unknown>[];
  /** Treści żądań zmiany hasła (`PUT /auth/v1/user`). */
  readonly userUpdates: unknown[];
  /** Ścieżki plików wysłanych do bucketu `avatars` i z niego usuniętych. */
  readonly avatarUploads: string[];
  readonly avatarRemoved: string[];
}

/** Wiersz `profiles` z wartościami domyślnymi kolumn, których test nie podał. */
function withDefaults(profile: MockProfile) {
  return {
    avatar_path: null,
    theme: 'system',
    password_change_suggested: false,
    ...profile,
  };
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
  const mock: SupabaseMock = {
    options,
    calls: [],
    passwordBodies: [],
    clubWrites: [],
    uploads: [],
    removed: [],
    memberBodies: [],
    profileWrites: [],
    userUpdates: [],
    avatarUploads: [],
    avatarRemoved: [],
  };
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
    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
      mock.userUpdates.push(request.postDataJSON());
      const failure = mock.options.updateUserError;
      if (failure) {
        return route.fulfill({
          status: failure.status,
          json: { code: failure.status, error_code: failure.code, msg: failure.code },
        });
      }
      return route.fulfill({ json: session().user });
    }
    if (url.pathname === '/rest/v1/profiles' && request.method() === 'PATCH') {
      // RLS: tylko własny wiersz (USR-7). Atrapa zmienia profil Ady.
      const body = request.postDataJSON() as Record<string, unknown>;
      mock.profileWrites.push(body);
      const own = mock.options.profile === undefined ? ADA : mock.options.profile;
      const target = url.searchParams.get('id');
      if (!own || target !== `eq.${own.id}`) return route.fulfill({ json: [] });
      const next = { ...own, ...body } as MockProfile;
      mock.options.profile = next;
      if (!url.searchParams.has('select')) return route.fulfill({ status: 204 });
      return route.fulfill({ json: withDefaults(next) });
    }
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
      return route.fulfill({ json: rows.map(withDefaults) });
    }
    if (url.pathname === '/functions/v1/create-member' && request.method() === 'POST') {
      const body = request.postDataJSON() as { firstName: string; lastName: string };
      mock.memberBodies.push(body);
      if (mock.options.createMember) {
        const { status, body: reply } = mock.options.createMember;
        return route.fulfill({
          status,
          json: reply,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      const created = member(0x7c1e, body.firstName, body.lastName);
      mock.options.members = [...(mock.options.members ?? []), created];
      return route.fulfill({
        status: 201,
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
        json: { member: created, password: NEW_MEMBER_PASSWORD },
      });
    }
    if (url.pathname === '/rest/v1/club') {
      const method = request.method();
      if (method === 'POST' || method === 'PATCH') {
        const body = request.postDataJSON() as Record<string, unknown>;
        mock.clubWrites.push({ method, body });
        const current = mock.options.club ?? null;
        if (method === 'POST' && (current || mock.options.clubConflict)) {
          if (mock.options.clubConflict) mock.options.club = mock.options.clubConflict;
          return route.fulfill({
            status: 409,
            json: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "club_pkey"',
            },
          });
        }
        const next = { ...(current ?? {}), ...body } as unknown as MockClub;
        mock.options.club = next;
        // `.single()` prosi o obiekt (`Accept: application/vnd.pgrst.object+json`).
        return route.fulfill({ json: next });
      }
      const club = mock.options.club ?? null;
      return route.fulfill({ json: club ? [{ timezone: 'Europe/Warsaw', ...club }] : [] });
    }
    // Storage (bucket `covers`): wysyłka, podpisany URL, pobranie i usunięcie pliku.
    const objectPrefix = '/storage/v1/object/';
    if (url.pathname.startsWith(`${objectPrefix}sign/covers/`)) {
      const path = url.pathname.slice(`${objectPrefix}sign/covers/`.length);
      if (request.method() === 'GET') {
        return route.fulfill({ contentType: 'image/png', body: PIXEL_PNG });
      }
      return route.fulfill({ json: { signedURL: `/object/sign/covers/${path}?token=e2e` } });
    }
    if (url.pathname.startsWith(`${objectPrefix}covers/`) && request.method() === 'POST') {
      mock.uploads.push(decodeURIComponent(url.pathname.slice(`${objectPrefix}covers/`.length)));
      return route.fulfill({ json: { Key: url.pathname.slice(objectPrefix.length) } });
    }
    if (url.pathname === `${objectPrefix}covers` && request.method() === 'DELETE') {
      const { prefixes } = request.postDataJSON() as { prefixes: string[] };
      mock.removed.push(...prefixes);
      return route.fulfill({ json: [] });
    }
    // Bucket `avatars` (USR-3): to samo dla zdjęć profilowych.
    if (url.pathname.startsWith(`${objectPrefix}sign/avatars/`)) {
      const path = url.pathname.slice(`${objectPrefix}sign/avatars/`.length);
      if (request.method() === 'GET') {
        return route.fulfill({ contentType: 'image/png', body: PIXEL_PNG });
      }
      return route.fulfill({ json: { signedURL: `/object/sign/avatars/${path}?token=e2e` } });
    }
    if (url.pathname.startsWith(`${objectPrefix}avatars/`) && request.method() === 'POST') {
      mock.avatarUploads.push(
        decodeURIComponent(url.pathname.slice(`${objectPrefix}avatars/`.length)),
      );
      return route.fulfill({ json: { Key: url.pathname.slice(objectPrefix.length) } });
    }
    if (url.pathname === `${objectPrefix}avatars` && request.method() === 'DELETE') {
      const { prefixes } = request.postDataJSON() as { prefixes: string[] };
      mock.avatarRemoved.push(...prefixes);
      return route.fulfill({ json: [] });
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
