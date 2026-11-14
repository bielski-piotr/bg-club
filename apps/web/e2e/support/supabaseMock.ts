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
  /**
   * Odpowiedź Edge Function `delete-member` (MEM-4). Domyślnie: członek z `members` dostaje
   * `deleted_at` i odpowiedź 200; inaczej podany status i treść błędu.
   */
  deleteMember?: { readonly status: number; readonly body: unknown } | undefined;
  /**
   * Odpowiedź Edge Function `delete-own-account` (USR-6). Domyślnie: hasło
   * {@link OWN_ACCOUNT_PASSWORD} usuwa konto (RLS przestaje zwracać profil), inne daje
   * `wrong_password`; inaczej podany status i treść błędu.
   */
  deleteOwnAccount?: { readonly status: number; readonly body: unknown } | undefined;
  /** Gry kolekcji, także usunięte (`deleted_at`). Zapis z aplikacji zmienia tę listę. */
  games?: MockGame[];
  /** Notesy gier (GAME-7) z aktualną wersją; domyślnie brak. */
  scorepads?: MockScorepad[];
  /** Spotkania (§5.8). Zapis z aplikacji (`save_meeting`, DELETE) zmienia tę listę. */
  meetings?: MockMeeting[];
  /** Gracze z partią w spotkaniu (`play_results`, PLAN-4). */
  playResults?: readonly { readonly meeting_id: string; readonly profile_id: string }[];
  /** Błąd PostgREST zwracany przez `save_meeting` (np. reguła z HINT). */
  saveMeetingError?: { readonly code: string; readonly hint?: string; readonly message: string };
}

/** Spotkanie z identyfikatorami uczestników (jak wiersz `meetings` z osadzonymi uczestnikami). */
export interface MockMeeting {
  readonly id: string;
  readonly title: string;
  readonly starts_at: string;
  readonly status: 'planned' | 'in_progress' | 'finished';
  readonly voting_open: boolean;
  readonly host_id: string | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly participants: readonly string[];
}

export function mockMeeting(
  n: number,
  title: string,
  extra: Partial<MockMeeting> = {},
): MockMeeting {
  return {
    id: `00000000-0000-4000-c000-${n.toString(16).padStart(12, '0')}`,
    title,
    starts_at: '2026-11-28T17:00:00+00:00',
    status: 'planned',
    voting_open: true,
    host_id: null,
    started_at: null,
    finished_at: null,
    participants: [ADA.id],
    ...extra,
  };
}

/** Treść wywołania `save_meeting` (PLAN-1). */
export interface MeetingSave {
  readonly meeting_id: string;
  readonly title: string;
  readonly local_date: string;
  readonly local_time: string;
  readonly participant_ids: string[];
  readonly host_id: string | null;
}

/** Data i godzina w strefie `timeZone` → chwila ISO (jak `save_meeting` w bazie). */
function zonedToIso(date: string, time: string, timeZone: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(guess)
      .map((part) => [part.type, part.value]),
  );
  const shown = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString();
}

/** Notes gry z aktualną wersją: szablon w bazie bez zdjęcia, zdjęcie w buckecie `scorepads`. */
export interface MockScorepad {
  readonly id: string;
  readonly game_id: string;
  readonly name: string;
  readonly created_at: string;
  readonly current: {
    readonly id: string;
    readonly version: number;
    readonly image_path: string;
    readonly player_slots: number;
    readonly created_at: string;
  };
  readonly template: Record<string, unknown>;
  /** Zdjęcie kartki zwracane z bucketu `scorepads`. */
  readonly image: Buffer;
}

/** Wywołanie RPC `save_scorepad` (EDT-1) z treścią żądania. */
export type ScorepadSave = Record<string, unknown>;

/** Wiersz `games` z datą ostatniej partii z widoku `game_collection` (GAME-1). */
export interface MockGame {
  readonly id: string;
  readonly title: string;
  readonly cover_path: string | null;
  readonly min_players: number;
  readonly max_players: number;
  readonly placement_points: readonly number[];
  readonly created_at: string;
  readonly last_played_at: string | null;
  readonly deleted_at: string | null;
}

/** Fikcyjna gra o numerze `n` (id wyprowadzone z numeru, data dodania: `n` października). */
export function mockGame(n: number, title: string, extra: Partial<MockGame> = {}): MockGame {
  return {
    id: `00000000-0000-4000-b000-${n.toString(16).padStart(12, '0')}`,
    title,
    cover_path: null,
    min_players: 2,
    max_players: 4,
    placement_points: [10, 6, 4, 2],
    created_at: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`,
    last_played_at: null,
    deleted_at: null,
    ...extra,
  };
}

/** Zapis gry (`POST` = INSERT, `PATCH` = UPDATE) z treścią i filtrem `id`. */
export interface GameWrite {
  readonly method: 'POST' | 'PATCH';
  readonly body: Record<string, unknown>;
  readonly id: string | null;
}

/** Jak `search_text` w bazie: małe litery, bez polskich znaków (GAME-2). */
function searchText(value: string): string {
  return value.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '');
}

/** Kolejność widżetu kolekcji (GAME-1, Q11): ostatnio grane, potem ostatnio dodane. */
function byWidgetOrder(a: MockGame, b: MockGame): number {
  const played = (b.last_played_at ?? '').localeCompare(a.last_played_at ?? '');
  if (played !== 0) return played;
  return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}

/** Hasło zalogowanej Ady, które przyjmuje atrapa `delete-own-account` (fikcyjne). */
export const OWN_ACCOUNT_PASSWORD = 'e2eMojeHaslo123';

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
  /** Treści żądań `POST /functions/v1/delete-member` i `delete-own-account`. */
  readonly deleteMemberBodies: unknown[];
  readonly deleteOwnBodies: unknown[];
  /** Zapisy gier (`/rest/v1/games`) i zapytania wyszukiwania (`search_games`). */
  readonly gameWrites: GameWrite[];
  readonly gameSearches: string[];
  /** Pliki wysłane do bucketu `scorepads` i wywołania `save_scorepad`. */
  readonly scorepadUploads: string[];
  readonly scorepadSaves: ScorepadSave[];
  /** Wywołania `save_meeting` i usunięte spotkania (id). */
  readonly meetingSaves: MeetingSave[];
  readonly meetingDeletes: string[];
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
    deleteMemberBodies: [],
    deleteOwnBodies: [],
    gameWrites: [],
    gameSearches: [],
    scorepadUploads: [],
    scorepadSaves: [],
    meetingSaves: [],
    meetingDeletes: [],
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
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (url.pathname === '/functions/v1/delete-member' && request.method() === 'POST') {
      const body = request.postDataJSON() as { memberId: string };
      mock.deleteMemberBodies.push(body);
      if (mock.options.deleteMember) {
        const { status, body: reply } = mock.options.deleteMember;
        return route.fulfill({ status, json: reply, headers: cors });
      }
      mock.options.members = (mock.options.members ?? []).map((row) =>
        row.id === body.memberId ? { ...row, deleted_at: '2026-11-13T12:00:00Z' } : row,
      );
      return route.fulfill({ json: { memberId: body.memberId }, headers: cors });
    }
    if (url.pathname === '/functions/v1/delete-own-account' && request.method() === 'POST') {
      const body = request.postDataJSON() as { password: string };
      mock.deleteOwnBodies.push(body);
      if (mock.options.deleteOwnAccount) {
        const { status, body: reply } = mock.options.deleteOwnAccount;
        return route.fulfill({ status, json: reply, headers: cors });
      }
      if (body.password !== OWN_ACCOUNT_PASSWORD) {
        return route.fulfill({ status: 400, json: { error: 'wrong_password' }, headers: cors });
      }
      // Konto usunięte: RLS nie zwraca już danych, a odświeżenie sesji jest odrzucane.
      mock.options.profile = null;
      mock.options.refresh = { kind: 'accountInactive' };
      return route.fulfill({ json: { deleted: true }, headers: cors });
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
    // Spotkania (PLAN-1…PLAN-5): odczyt z osadzonymi uczestnikami, zapis RPC, usunięcie.
    if (url.pathname === '/rest/v1/meetings' && request.method() === 'GET') {
      let rows = [...(mock.options.meetings ?? [])];
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (id) rows = rows.filter((row) => row.id === id);
      const status = /^in\.\((.*)\)$/.exec(url.searchParams.get('status') ?? '');
      if (status) {
        const allowed = (status[1] ?? '').split(',');
        rows = rows.filter((row) => allowed.includes(row.status));
      }
      rows.sort(
        (a, b) =>
          a.status.localeCompare(b.status) ||
          a.starts_at.localeCompare(b.starts_at) ||
          a.id.localeCompare(b.id),
      );
      const limit = Number(url.searchParams.get('limit') ?? rows.length);
      const json = rows.slice(0, limit).map(({ participants, ...row }) => ({
        ...row,
        meeting_participants: participants.map((profile_id) => ({ profile_id })),
      }));
      const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (single) {
        return json[0]
          ? route.fulfill({ json: json[0] })
          : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
      }
      return route.fulfill({ json });
    }
    if (url.pathname === '/rest/v1/meetings' && request.method() === 'DELETE') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const target = (mock.options.meetings ?? []).find((row) => row.id === id);
      if (target?.status === 'in_progress') {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'meetings_delete_in_progress', message: 'in progress' },
        });
      }
      if (target && (mock.options.playResults ?? []).some((r) => r.meeting_id === target.id)) {
        return route.fulfill({ status: 409, json: { code: '23503', message: 'plays fkey' } });
      }
      mock.options.meetings = (mock.options.meetings ?? []).filter((row) => row.id !== id);
      if (target) mock.meetingDeletes.push(target.id);
      return route.fulfill({ json: target ? [{ id: target.id }] : [] });
    }
    if (url.pathname === '/rest/v1/rpc/save_meeting' && request.method() === 'POST') {
      const body = request.postDataJSON() as MeetingSave;
      mock.meetingSaves.push(body);
      if (mock.options.saveMeetingError) {
        return route.fulfill({ status: 400, json: mock.options.saveMeetingError });
      }
      const timeZone = mock.options.club?.timezone ?? 'Europe/Warsaw';
      const existing = (mock.options.meetings ?? []).find((row) => row.id === body.meeting_id);
      const saved: MockMeeting = {
        ...(existing ?? mockMeeting(0, '')),
        id: body.meeting_id,
        title: body.title,
        starts_at: zonedToIso(body.local_date, body.local_time, timeZone),
        participants: body.participant_ids,
        host_id: body.host_id,
      };
      mock.options.meetings = existing
        ? (mock.options.meetings ?? []).map((row) => (row.id === saved.id ? saved : row))
        : [...(mock.options.meetings ?? []), saved];
      const { participants, ...row } = saved;
      return route.fulfill({ json: { ...row, participant_count: participants.length } });
    }
    if (url.pathname === '/rest/v1/play_results' && request.method() === 'GET') {
      const meetingId = url.searchParams.get('meeting_id')?.replace(/^eq\./, '');
      const rows = (mock.options.playResults ?? [])
        .filter((row) => row.meeting_id === meetingId)
        .map((row) => ({ profile_id: row.profile_id }));
      return route.fulfill({ json: rows });
    }
    // Kolekcja gier (GAME-1…GAME-8): widok, wyszukiwanie i zapis jak RLS dla admina.
    const activeGames = () => (mock.options.games ?? []).filter((g) => g.deleted_at === null);
    if (url.pathname === '/rest/v1/game_collection') {
      let rows = [...activeGames()].sort(byWidgetOrder);
      const id = url.searchParams.get('id');
      if (id?.startsWith('eq.')) rows = rows.filter((row) => row.id === id.slice(3));
      const total = rows.length;
      const limit = Number(url.searchParams.get('limit') ?? rows.length);
      rows = rows.slice(0, limit);
      const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (single) {
        return rows[0]
          ? route.fulfill({ json: rows[0] })
          : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
      }
      return route.fulfill({
        json: rows,
        headers: {
          'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${total}`,
          'Access-Control-Expose-Headers': 'Content-Range',
        },
      });
    }
    // Notesy gry (GAME-7): lista z `options.scorepads` (filtr `id` albo `game_id`).
    if (url.pathname === '/rest/v1/scorepads' && request.method() === 'GET') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const gameId = url.searchParams.get('game_id')?.replace(/^eq\./, '');
      const rows = (mock.options.scorepads ?? [])
        .filter((p) => (!id || p.id === id) && (!gameId || p.game_id === gameId))
        .map((p) => ({
          id: p.id,
          game_id: p.game_id,
          name: p.name,
          created_at: p.created_at,
          current: p.current,
        }));
      const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (single) {
        return rows[0]
          ? route.fulfill({ json: rows[0] })
          : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
      }
      return route.fulfill({ json: rows });
    }
    // Szablon wersji notesu (edycja istniejącego notesu).
    if (url.pathname === '/rest/v1/scorepad_versions' && request.method() === 'GET') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const pad = (mock.options.scorepads ?? []).find((p) => p.current.id === id);
      return pad
        ? route.fulfill({ json: { template: pad.template, image_path: pad.current.image_path } })
        : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
    }
    // Zapis nowej wersji notesu (EDT-1): numer wersji po istniejącej.
    if (url.pathname === '/rest/v1/rpc/save_scorepad' && request.method() === 'POST') {
      const body = request.postDataJSON() as ScorepadSave;
      mock.scorepadSaves.push(body);
      const pad = (mock.options.scorepads ?? []).find((p) => p.id === body.scorepad_id);
      return route.fulfill({ json: { version: (pad?.current.version ?? 0) + 1 } });
    }
    if (url.pathname === '/rest/v1/rpc/search_games' && request.method() === 'POST') {
      const { query } = request.postDataJSON() as { query: string };
      mock.gameSearches.push(query);
      const needle = searchText(query.trim());
      const rows = activeGames()
        .filter((g) => searchText(g.title).includes(needle))
        .sort((a, b) => searchText(a.title).localeCompare(searchText(b.title)));
      return route.fulfill({ json: rows });
    }
    if (url.pathname === '/rest/v1/games') {
      const method = request.method();
      if (method === 'POST' || method === 'PATCH') {
        const body = request.postDataJSON() as Record<string, unknown>;
        const id = url.searchParams.get('id')?.replace(/^eq\./, '') ?? null;
        mock.gameWrites.push({ method, body, id });
        let saved: MockGame | undefined;
        if (method === 'POST') {
          saved = {
            ...mockGame(0, ''),
            ...body,
            created_at: '2026-11-13T12:00:00Z',
          } as unknown as MockGame;
          mock.options.games = [...(mock.options.games ?? []), saved];
        } else {
          mock.options.games = (mock.options.games ?? []).map((g) => {
            if (g.id !== id || g.deleted_at !== null) return g;
            saved = {
              ...g,
              ...body,
              ...(body.deleted_at ? { deleted_at: '2026-11-13T12:00:00Z' } : {}),
            } as MockGame;
            return saved;
          });
        }
        if (!url.searchParams.has('select')) return route.fulfill({ status: 204 });
        if (!saved) {
          return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } });
        }
        return route.fulfill({ status: method === 'POST' ? 201 : 200, json: saved });
      }
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
    // Bucket `scorepads` (EDT-1): wysyłka zdjęcia kartki i pobranie zdjęcia wersji.
    if (url.pathname.startsWith(`${objectPrefix}scorepads/`) && request.method() === 'POST') {
      mock.scorepadUploads.push(
        decodeURIComponent(url.pathname.slice(`${objectPrefix}scorepads/`.length)),
      );
      return route.fulfill({ json: { Key: url.pathname.slice(objectPrefix.length) } });
    }
    const scorepadObject = /^\/storage\/v1\/object\/(?:authenticated\/)?scorepads\/(.+)$/.exec(
      url.pathname,
    );
    if (scorepadObject && request.method() === 'GET') {
      const path = decodeURIComponent(scorepadObject[1] ?? '');
      const pad = (mock.options.scorepads ?? []).find((p) => p.current.image_path === path);
      return pad
        ? route.fulfill({ contentType: 'image/png', body: pad.image })
        : route.fulfill({ status: 400, json: { statusCode: '404', error: 'not_found' } });
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
