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
let dateOptionSeq = 1;

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
  /** Partie spotkań osadzane w timeline i kalendarzu (MTG-3): liczba partii i zwycięzcy. */
  plays?: readonly MockPlay[];
  /** Gracze z partią w spotkaniu (`play_results`, PLAN-4). */
  playResults?: readonly { readonly meeting_id: string; readonly profile_id: string }[];
  /** Błąd PostgREST zwracany przez `save_meeting` (np. reguła z HINT). */
  saveMeetingError?: { readonly code: string; readonly hint?: string; readonly message: string };
  /** Głosy (`game_votes`, VOTE-2). Głos i cofnięcie z aplikacji zmieniają tę listę. */
  votes?: MockVote[];
  /** Opublikowane gry (`meeting_games`, VOTE-5) w kolejności `position`. */
  meetingGames?: { readonly meeting_id: string; readonly game_id: string }[];
  /** Błąd PostgREST zwracany przez `start_play` (np. reguła z HINT). */
  startPlayError?: { readonly code: string; readonly hint?: string; readonly message: string };
  /** Brak sieci przy zapisie szkicu (`save_play_draft` przerwane jak offline, PAD-4). */
  draftOffline?: boolean;
  /**
   * Zapis partii (`save_play`, PAD-5): tyle pierwszych żądań baza wykonuje, ale odpowiedź nie
   * dociera (przekroczony czas po zatwierdzeniu transakcji).
   */
  savePlayLostReplies?: number;
  /** Błąd PostgREST zwracany przez `save_play` (np. reguła z HINT). */
  savePlayError?: { readonly code: string; readonly hint?: string; readonly message: string };
  /** Upload obrazu karteczki (bucket `sheets`, PAD-6) przerwany jak offline. */
  sheetUploadOffline?: boolean;
  /** Osierocone obrazy spotkania zwracane przez `orphan_sheet_images`. */
  orphanSheets?: readonly string[];
  /** Tyle pierwszych usunięć plików z bucketu `sheets` kończy się błędem Storage (500). */
  sheetRemoveFailures?: number;
  /**
   * Wynik `leaderboard(kind, date_from, date_to, game_ids)` (LB-1, LB-4) w kolejności z bazy;
   * brak filtrów to `null`. Brakujące pola rozstrzygnięcia remisów dostają wartości domyślne.
   */
  leaderboard?: (kind: string, call: MockLeaderboardCall) => readonly MockLeaderboardRow[];
  /**
   * Wynik `game_stats(game_id)` (GAME-11, migracja `20261113001800_game_stats.sql`); domyślnie
   * statystyki bez partii.
   */
  gameStats?: (gameId: string) => unknown;
  /**
   * Wiersze `meeting_leaderboard_changes(meeting_id, game_ids)` (podsumowanie spotkania);
   * `games` = wybrane gry filtra (`null` = wszystkie). Domyślnie puste podsumowanie.
   */
  meetingSummary?: (meetingId: string, games: readonly string[] | null) => readonly unknown[];
  /** Wiersze `meeting_play_records(meeting_id)` (rekordy w partiach); domyślnie brak. */
  meetingRecords?: (meetingId: string) => readonly unknown[];
  /** Wiersze `play_record_preview(play_id, results)`; domyślnie brak rekordów. */
  recordPreview?: (playId: string) => readonly unknown[];
  /** Proponowane terminy spotkań (`meeting_date_options`). Zapis formularza zmienia listę. */
  dateOptions?: MockDateOption[];
  /** Głosy na terminy (`meeting_date_votes`). Głos i cofnięcie z aplikacji zmieniają listę. */
  dateVotes?: MockDateVote[];
  /**
   * Wynik `player_stats(profile_id, date_from, date_to, game_ids)` (STAT-1–STAT-3, migracja
   * `20261124000000_profile_records_without_achievements.sql`). Domyślnie zero partii.
   */
  playerStats?: (profileId: string, call: MockFilterCall) => unknown;
  /** Wiersze `player_records(profile_id, date_from, date_to, game_ids)`; domyślnie brak gier. */
  playerRecords?: (profileId: string, call: MockFilterCall) => readonly unknown[];
}

/** Filtry wywołania statystyk i rekordów gracza (jak w rankingu). */
export interface MockFilterCall {
  readonly date_from: string | null;
  readonly date_to: string | null;
  readonly game_ids: readonly string[] | null;
}

/** `game_stats` gry bez zapisanych partii. */
export const EMPTY_GAME_STATS = {
  play_count: 0,
  last_played_at: null,
  top_winners: [],
  record: null,
  winner_average: null,
  ranking: [],
} as const;

/** `player_stats` gracza bez zapisanych partii. */
export const EMPTY_PLAYER_STATS = {
  meetings: 0,
  plays: 0,
  wins: 0,
  points: 0,
  wins_total: 0,
  streak_record: 0,
  streak_current: 0,
  places: { points: null, wins: null },
  favorite_game: null,
  best_game: null,
  recent_meetings: [],
} as const;

/** Wiersz `leaderboard(…)` (migracja `20261123000000_leaderboard_ties_filters.sql`). */
export interface MockLeaderboardRow {
  readonly place: number;
  readonly profile_id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly avatar_path: string | null;
  readonly deleted: boolean;
  readonly podium: boolean;
  readonly value: number;
  readonly tied?: boolean;
  readonly reached_meeting_id?: string | null;
  readonly reached_meeting_title?: string | null;
  readonly reached_at?: string | null;
  readonly reached_points?: number | null;
  readonly wins?: number;
}

/** Argumenty wywołania `leaderboard`. */
export interface MockLeaderboardCall {
  readonly kind: string;
  readonly date_from: string | null;
  readonly date_to: string | null;
  readonly game_ids: readonly string[] | null;
}

/** Wywołanie `save_play` (PAD-5): kartka i wyniki graczy bez punktów. */
export interface PlaySave {
  readonly play_id: string;
  readonly scorepad_version_id: string;
  readonly sheet: Record<string, unknown>;
  readonly results: readonly {
    readonly profile_id: string;
    readonly seat: number;
    readonly place: number;
    readonly scores: Record<string, number | null>;
    readonly ranking_value: number | null;
  }[];
}

/** Wywołanie `save_play_draft` (PAD-4): wpisy kartki i wersja, od której zaczyna zapis. */
export interface DraftSave {
  readonly play_id: string;
  readonly sheet: Record<string, unknown>;
  readonly base_version: number;
}

/** Wywołanie `start_play` (RUN-2): miejsca notesu z NULL dla wolnych. */
export interface PlayStart {
  readonly play_id: string;
  readonly meeting_id: string;
  readonly scorepad_id: string;
  readonly player_ids: (string | null)[];
  readonly expansion_ids?: string[];
}

export interface MockDateOption {
  readonly id: string;
  readonly meeting_id: string;
  readonly starts_at: string;
}

export interface MockDateVote {
  readonly option_id: string;
  readonly meeting_id: string;
  readonly profile_id: string;
  readonly created_at?: string;
}

export interface MockVote {
  readonly meeting_id: string;
  readonly game_id: string;
  readonly profile_id: string;
}

/**
 * Partia spotkania z wynikami: osadzona w wierszu `meetings` (MTG-3) i zwracana przez
 * `GET /rest/v1/plays` (VIEW-3). Pola karty partii są opcjonalne (domyślne w `playRow`).
 */
export interface MockPlay {
  readonly id: string;
  readonly meeting_id: string;
  readonly status: 'draft' | 'saved';
  readonly saved_at: string | null;
  readonly started_at?: string;
  readonly game_id?: string;
  /** Szkic kartki (PAD-4): wpisy, wersja i kto ją zapisał. Zapis z aplikacji je zmienia. */
  readonly sheet?: Record<string, unknown> | null;
  readonly draft_version?: number;
  readonly draft_saved_at?: string | null;
  readonly draft_saved_by?: string | null;
  /** Notes partii (`options.scorepads`): szablon i liczba miejsc notesu partii. */
  readonly scorepad_id?: string;
  /** Snapshot punktacji z rozpoczęcia partii (GAME-9); domyślnie 10/6/4/2. */
  readonly points_snapshot?: readonly number[];
  /** Treść ostatniego `save_play` (ponowienie z tą samą treścią zwraca zapisaną partię). */
  readonly saved_payload?: string;
  /** Obraz oderwanej karteczki w buckecie `sheets` (PAD-6). */
  readonly sheet_image_path?: string | null;
  /** Dodatki partii (`plays.expansion_ids`). */
  readonly expansion_ids?: readonly string[];
  readonly play_results: readonly {
    readonly profile_id: string;
    readonly is_win: boolean | null;
    readonly seat?: number;
    readonly place?: number | null;
    readonly points?: number | null;
    readonly ranking_value?: number | null;
  }[];
}

/** Spotkanie z identyfikatorami uczestników (jak wiersz `meetings` z osadzonymi uczestnikami). */
export interface MockMeeting {
  readonly id: string;
  readonly title: string;
  readonly starts_at: string;
  readonly status: 'planned' | 'in_progress' | 'finished';
  readonly voting_open: boolean;
  /** Głosowanie na proponowane terminy; domyślnie zamknięte. */
  readonly date_voting_open?: boolean;
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
    date_voting_open: false,
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
  /** `null` = termin bez zmian (edycja). */
  readonly local_date: string | null;
  readonly local_time: string | null;
  readonly participant_ids: string[];
  readonly host_id: string | null;
  readonly is_new: boolean;
  /** Proponowane terminy; brak = lista bez zmian. */
  readonly date_options?: readonly { readonly date: string; readonly time: string }[];
  /** Głosowanie na termin; brak = bez zmian. */
  readonly date_voting?: boolean;
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
  readonly complexity: number | null;
  readonly created_at: string;
  readonly last_played_at: string | null;
  readonly deleted_at: string | null;
  /** Dodatek: gra podstawowa; `null` = gra podstawowa. */
  readonly base_game_id?: string | null;
  readonly cover_source_path?: string | null;
  readonly cover_crop?: unknown;
  /** Dodatek: liczba partii z nim. */
  readonly play_count?: number | null;
  /** Dostępność gry (domyślnie dostępna). */
  readonly available?: boolean;
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
    complexity: 2,
    created_at: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`,
    last_played_at: null,
    deleted_at: null,
    base_game_id: null,
    cover_source_path: null,
    cover_crop: null,
    play_count: null,
    available: true,
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
/** Obraz karteczki w historii (PAD-6): w atrapie ten sam piksel. */
const SHEET_PNG = PIXEL_PNG;

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
  /** Wywołania `publish_meeting_games` i `reopen_voting` (treść żądania). */
  readonly publishes: { meeting_id: string; game_ids: string[] }[];
  readonly reopens: string[];
  /** Wywołania `start_meeting` i `finish_meeting` (RUN-1, RUN-4). */
  readonly runs: { action: 'start' | 'finish' | 'reopen'; meeting_id: string }[];
  /** Wywołania `start_play` (RUN-2). */
  readonly playStarts: PlayStart[];
  /** Wywołania `save_play_draft` (PAD-4) i `discard_play` (PAD-8, id partii). */
  readonly draftSaves: DraftSave[];
  readonly discards: string[];
  /** Wywołania `save_play` (PAD-5), także ponowienia. */
  readonly playSaves: PlaySave[];
  /** Obrazy karteczek (PAD-6): wgrane pliki, dołączenia do partii i usunięte pliki. */
  readonly sheetUploads: { readonly path: string; readonly type: string; readonly size: number }[];
  readonly sheetAttaches: { readonly play_id: string; readonly image_path: string }[];
  readonly sheetRemoved: string[];
  /** Wywołania `delete_play` (VIEW-6, id partii), także odrzucone. */
  readonly playDeletes: string[];
  /** Wywołania `leaderboard` (rodzaj i filtry). */
  readonly leaderboardCalls: MockLeaderboardCall[];
  /** Wywołania `player_stats` (gracz i filtry). */
  readonly playerStatsCalls: ({ readonly profileId: string } & MockFilterCall)[];
  /** Wywołania `player_records` (gracz i filtry). */
  readonly playerRecordsCalls: ({ readonly profileId: string } & MockFilterCall)[];
  /** Wywołania `meeting_leaderboard_changes` (filtr gier podsumowania). */
  readonly summaryCalls: { readonly meetingId: string; readonly games: string[] | null }[];
  /** Propozycje `propose_meeting_date`. */
  readonly dateProposals: {
    readonly meeting_id: string;
    readonly local_date: string;
    readonly local_time: string;
  }[];
  /** Decyzje `decide_meeting_date`. */
  readonly dateDecisions: { readonly meetingId: string; readonly optionId: string }[];
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
    publishes: [],
    reopens: [],
    runs: [],
    playStarts: [],
    draftSaves: [],
    discards: [],
    playDeletes: [],
    playSaves: [],
    sheetUploads: [],
    sheetAttaches: [],
    sheetRemoved: [],
    leaderboardCalls: [],
    playerStatsCalls: [],
    playerRecordsCalls: [],
    summaryCalls: [],
    dateDecisions: [],
    dateProposals: [],
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
      const statusParam = url.searchParams.get('status') ?? '';
      const status = /^in\.\((.*)\)$/.exec(statusParam);
      if (status) {
        const allowed = (status[1] ?? '').split(',');
        rows = rows.filter((row) => allowed.includes(row.status));
      }
      if (statusParam.startsWith('eq.')) {
        rows = rows.filter((row) => row.status === statusParam.slice(3));
      }
      // Zakres terminów kalendarza (`gte` / `lt` na `starts_at`).
      for (const filter of url.searchParams.getAll('starts_at')) {
        const [op, value = ''] = filter.split(/\.(.*)/s);
        const bound = new Date(value).getTime();
        rows = rows.filter((row) => {
          const at = new Date(row.starts_at).getTime();
          return op === 'gte' ? at >= bound : op === 'lt' ? at < bound : true;
        });
      }
      // `order=status.asc,starts_at.desc,id.desc` (kolejność z zapytania, domyślnie rosnąco).
      const order = (url.searchParams.get('order') ?? 'status,starts_at,id')
        .split(',')
        .map((part) => {
          const [column = '', direction] = part.split('.');
          return { column: column as 'status' | 'starts_at' | 'id', desc: direction === 'desc' };
        });
      rows.sort((a, b) => {
        for (const { column, desc } of order) {
          const diff =
            column === 'starts_at'
              ? new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
              : a[column].localeCompare(b[column]);
          if (diff !== 0) return desc ? -diff : diff;
        }
        return 0;
      });
      const withPlays = (url.searchParams.get('select') ?? '').includes('plays');
      const limit = Number(url.searchParams.get('limit') ?? rows.length);
      const json = rows.slice(0, limit).map(({ participants, ...row }) => ({
        ...row,
        meeting_participants: participants.map((profile_id) => ({ profile_id })),
        ...(withPlays
          ? {
              plays: (mock.options.plays ?? [])
                .filter((play) => play.meeting_id === row.id)
                .map(({ meeting_id: _meeting, ...play }) => play),
            }
          : {}),
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
      if (
        target &&
        [...(mock.options.playResults ?? []), ...(mock.options.plays ?? [])].some(
          (r) => r.meeting_id === target.id,
        )
      ) {
        return route.fulfill({ status: 409, json: { code: '23503', message: 'plays fkey' } });
      }
      mock.options.meetings = (mock.options.meetings ?? []).filter((row) => row.id !== id);
      mock.options.votes = (mock.options.votes ?? []).filter((vote) => vote.meeting_id !== id);
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
      if (!existing && !body.is_new) {
        return route.fulfill({
          status: 404,
          json: { code: 'P0002', hint: 'meetings_not_found', message: 'does not exist' },
        });
      }
      const base = existing ?? mockMeeting(0, '');
      let saved: MockMeeting = {
        ...base,
        id: body.meeting_id,
        title: body.title,
        starts_at:
          body.local_date && body.local_time
            ? zonedToIso(body.local_date, body.local_time, timeZone)
            : base.starts_at,
        participants: body.participant_ids,
        host_id: body.host_id,
      };
      if (body.date_options) {
        const wanted = [
          ...new Set(body.date_options.map((o) => zonedToIso(o.date, o.time, timeZone))),
        ];
        const others = (mock.options.dateOptions ?? []).filter((o) => o.meeting_id !== saved.id);
        const kept = (mock.options.dateOptions ?? []).filter(
          (o) => o.meeting_id === saved.id && wanted.includes(new Date(o.starts_at).toISOString()),
        );
        const added = wanted
          .filter((at) => !kept.some((o) => new Date(o.starts_at).toISOString() === at))
          .map((at, i) => ({
            id: `00000000-0000-4000-9000-${String(dateOptionSeq++ + i).padStart(12, '0')}`,
            meeting_id: saved.id,
            starts_at: at,
          }));
        mock.options.dateOptions = [...others, ...kept, ...added];
        mock.options.dateVotes = (mock.options.dateVotes ?? []).filter((v) =>
          (mock.options.dateOptions ?? []).some((o) => o.id === v.option_id),
        );
      }
      if (body.date_voting !== undefined) saved = { ...saved, date_voting_open: body.date_voting };
      mock.options.meetings = existing
        ? (mock.options.meetings ?? []).map((row) => (row.id === saved.id ? saved : row))
        : [...(mock.options.meetings ?? []), saved];
      const { participants, ...row } = saved;
      return route.fulfill({ json: { ...row, participant_count: participants.length } });
    }
    // Głosowanie (VOTE-1…VOTE-6): głosy jak RLS i wyzwalacze, publikacja i ponowne otwarcie.
    const meetingById = (id: string | undefined) =>
      (mock.options.meetings ?? []).find((row) => row.id === id);
    const setMeeting = (next: MockMeeting) => {
      mock.options.meetings = (mock.options.meetings ?? []).map((row) =>
        row.id === next.id ? next : row,
      );
    };
    if (url.pathname === '/rest/v1/game_votes') {
      const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');
      const votes = mock.options.votes ?? [];
      if (request.method() === 'GET') {
        const meetingId = eq('meeting_id');
        return route.fulfill({
          json: votes
            .filter((v) => v.meeting_id === meetingId)
            .map(({ game_id, profile_id }) => ({ game_id, profile_id })),
        });
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as MockVote;
        const target = meetingById(body.meeting_id);
        if (!target?.voting_open) {
          return route.fulfill({
            status: 400,
            json: { code: '23514', message: `voting is closed in meeting ${body.meeting_id}` },
          });
        }
        if (!target.participants.includes(body.profile_id)) {
          return route.fulfill({ status: 409, json: { code: '23503', message: 'fkey' } });
        }
        if (
          votes.some(
            (v) =>
              v.meeting_id === body.meeting_id &&
              v.game_id === body.game_id &&
              v.profile_id === body.profile_id,
          )
        ) {
          return route.fulfill({ status: 409, json: { code: '23505', message: 'pkey' } });
        }
        mock.options.votes = [...votes, body];
        return route.fulfill({ status: 201, body: '' });
      }
      if (request.method() === 'DELETE') {
        const [meetingId, gameId, profileId] = [eq('meeting_id'), eq('game_id'), eq('profile_id')];
        if (!meetingById(meetingId)?.voting_open) return route.fulfill({ json: [] });
        const hit = (v: MockVote) =>
          v.meeting_id === meetingId && v.game_id === gameId && v.profile_id === profileId;
        const removed = votes.filter(hit);
        mock.options.votes = votes.filter((v) => !hit(v));
        return route.fulfill({ json: removed.map((v) => ({ game_id: v.game_id })) });
      }
    }
    // Głosowanie na termin: propozycje, głosy jak RLS i wyzwalacz, decyzja administratora.
    if (url.pathname === '/rest/v1/meeting_date_options' && request.method() === 'GET') {
      const meetingId = url.searchParams.get('meeting_id')?.replace(/^eq\./, '');
      const json = (mock.options.dateOptions ?? [])
        .filter((o) => o.meeting_id === meetingId)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
        .map((o) => ({
          id: o.id,
          starts_at: o.starts_at,
          meeting_date_votes: (mock.options.dateVotes ?? [])
            .filter((v) => v.option_id === o.id)
            .map((v) => ({
              profile_id: v.profile_id,
              created_at: v.created_at ?? '2026-11-01T10:00:00Z',
            })),
        }));
      return route.fulfill({ json });
    }
    if (url.pathname === '/rest/v1/meeting_date_votes') {
      const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');
      const votes = mock.options.dateVotes ?? [];
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as MockDateVote;
        const target = meetingById(body.meeting_id);
        if (!target?.date_voting_open) {
          return route.fulfill({
            status: 400,
            json: {
              code: '23514',
              hint: 'meeting_date_voting_closed',
              message: `date voting is closed in meeting ${body.meeting_id}`,
            },
          });
        }
        if (!target.participants.includes(body.profile_id)) {
          return route.fulfill({ status: 409, json: { code: '23503', message: 'fkey' } });
        }
        if (votes.some((v) => v.option_id === body.option_id && v.profile_id === body.profile_id)) {
          return route.fulfill({ status: 409, json: { code: '23505', message: 'pkey' } });
        }
        mock.options.dateVotes = [...votes, { ...body, created_at: new Date().toISOString() }];
        return route.fulfill({ status: 201, body: '' });
      }
      if (request.method() === 'DELETE') {
        const [optionId, profileId] = [eq('option_id'), eq('profile_id')];
        const option = (mock.options.dateOptions ?? []).find((o) => o.id === optionId);
        if (!meetingById(option?.meeting_id)?.date_voting_open) return route.fulfill({ json: [] });
        const hit = (v: MockDateVote) => v.option_id === optionId && v.profile_id === profileId;
        const removed = votes.filter(hit);
        mock.options.dateVotes = votes.filter((v) => !hit(v));
        return route.fulfill({ json: removed.map((v) => ({ option_id: v.option_id })) });
      }
    }
    if (url.pathname === '/rest/v1/rpc/propose_meeting_date' && request.method() === 'POST') {
      const body = request.postDataJSON() as {
        meeting_id: string;
        local_date: string;
        local_time: string;
      };
      mock.dateProposals.push(body);
      const target = meetingById(body.meeting_id);
      if (!target?.date_voting_open) {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'meeting_date_voting_closed', message: 'closed' },
        });
      }
      const me = mock.options.profile?.id ?? ADA.id;
      const at = zonedToIso(
        body.local_date,
        body.local_time,
        mock.options.club?.timezone ?? 'Europe/Warsaw',
      );
      let option = (mock.options.dateOptions ?? []).find(
        (o) => o.meeting_id === target.id && new Date(o.starts_at).toISOString() === at,
      );
      if (!option) {
        option = {
          id: `00000000-0000-4000-9000-${String(dateOptionSeq++).padStart(12, '0')}`,
          meeting_id: target.id,
          starts_at: at,
        };
        mock.options.dateOptions = [...(mock.options.dateOptions ?? []), option];
      }
      const optionId = option.id;
      if (
        target.participants.includes(me) &&
        !(mock.options.dateVotes ?? []).some((v) => v.option_id === optionId && v.profile_id === me)
      ) {
        mock.options.dateVotes = [
          ...(mock.options.dateVotes ?? []),
          { option_id: optionId, meeting_id: target.id, profile_id: me },
        ];
      }
      return route.fulfill({ json: option });
    }
    if (url.pathname === '/rest/v1/rpc/decide_meeting_date' && request.method() === 'POST') {
      const { meeting_id, option_id } = request.postDataJSON() as {
        meeting_id: string;
        option_id: string;
      };
      mock.dateDecisions.push({ meetingId: meeting_id, optionId: option_id });
      const target = meetingById(meeting_id);
      const option = (mock.options.dateOptions ?? []).find(
        (o) => o.id === option_id && o.meeting_id === meeting_id,
      );
      if (!target || target.status !== 'planned' || !option) {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'meetings_schedule_locked', message: 'locked' },
        });
      }
      const saved = { ...target, starts_at: option.starts_at, date_voting_open: false };
      setMeeting(saved);
      return route.fulfill({ json: saved });
    }
    if (url.pathname === '/rest/v1/rpc/reopen_date_voting' && request.method() === 'POST') {
      const { meeting_id } = request.postDataJSON() as { meeting_id: string };
      const target = meetingById(meeting_id);
      if (!target || target.status !== 'planned') {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'meetings_reopen_planned', message: 'has started' },
        });
      }
      const saved = { ...target, date_voting_open: true };
      setMeeting(saved);
      return route.fulfill({ json: saved });
    }
    if (url.pathname === '/rest/v1/meeting_games' && request.method() === 'GET') {
      const meetingId = url.searchParams.get('meeting_id')?.replace(/^eq\./, '');
      const json = (mock.options.meetingGames ?? [])
        .filter((row) => row.meeting_id === meetingId)
        .map((row, position) => {
          const g = (mock.options.games ?? []).find((x) => x.id === row.game_id);
          return {
            position,
            games: g
              ? {
                  id: g.id,
                  title: g.title,
                  cover_path: g.cover_path,
                  min_players: g.min_players,
                  max_players: g.max_players,
                }
              : null,
          };
        });
      return route.fulfill({ json });
    }
    if (url.pathname === '/rest/v1/rpc/publish_meeting_games' && request.method() === 'POST') {
      const body = request.postDataJSON() as { meeting_id: string; game_ids: string[] };
      mock.publishes.push(body);
      const target = meetingById(body.meeting_id);
      if (!target) {
        return route.fulfill({
          status: 404,
          json: { code: 'P0002', hint: 'meetings_not_found', message: 'does not exist' },
        });
      }
      if (target.status !== 'planned') {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'meeting_games_planned', message: 'not planned' },
        });
      }
      mock.options.meetingGames = [
        ...(mock.options.meetingGames ?? []).filter((row) => row.meeting_id !== target.id),
        ...body.game_ids.map((game_id) => ({ meeting_id: target.id, game_id })),
      ];
      const saved = { ...target, voting_open: false };
      setMeeting(saved);
      return route.fulfill({ json: saved });
    }
    if (url.pathname === '/rest/v1/rpc/reopen_voting' && request.method() === 'POST') {
      const { meeting_id } = request.postDataJSON() as { meeting_id: string };
      mock.reopens.push(meeting_id);
      const target = meetingById(meeting_id);
      if (!target || target.status !== 'planned') {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'meetings_reopen_planned', message: 'has started' },
        });
      }
      mock.options.meetingGames = (mock.options.meetingGames ?? []).filter(
        (row) => row.meeting_id !== meeting_id,
      );
      const saved = { ...target, voting_open: true };
      setMeeting(saved);
      return route.fulfill({ json: saved });
    }
    // Partia z kartką i szkicem (PAD-4), jak `plays?id=eq.…&select=…scorepad_versions(…)`.
    const playId = url.searchParams.get('id')?.replace(/^eq\./, '');
    if (url.pathname === '/rest/v1/plays' && request.method() === 'GET' && playId) {
      const play = (mock.options.plays ?? []).find((p) => p.id === playId);
      // `.maybeSingle()` przy GET czyta tablicę (pusta = brak partii).
      if (!play) return route.fulfill({ json: [] });
      const gameId = play.game_id ?? '00000000-0000-4000-b000-000000000001';
      const game = (mock.options.games ?? []).find((g) => g.id === gameId);
      const pad = (mock.options.scorepads ?? []).find((p) => p.id === play.scorepad_id);
      const select = url.searchParams.get('select') ?? '';
      // Konflikt szkicu: aplikacja pyta tylko o pola szkicu.
      if (!select.includes('games')) {
        return route.fulfill({
          json: [
            {
              sheet: play.sheet ?? null,
              draft_version: play.draft_version ?? 0,
              draft_saved_at: play.draft_saved_at ?? null,
              draft_saved_by: play.draft_saved_by ?? null,
            },
          ],
        });
      }
      return route.fulfill({
        json: [
          {
            id: play.id,
            meeting_id: play.meeting_id,
            status: play.status,
            started_at: play.started_at ?? '2026-11-28T17:10:00+00:00',
            sheet: play.sheet ?? null,
            draft_version: play.draft_version ?? 0,
            draft_saved_at: play.draft_saved_at ?? null,
            draft_saved_by: play.draft_saved_by ?? null,
            points_snapshot: play.points_snapshot ?? [10, 6, 4, 2],
            saved_at: play.saved_at,
            sheet_image_path: play.sheet_image_path ?? null,
            meetings: (() => {
              const m = meetingById(play.meeting_id);
              return m ? { id: m.id, title: m.title, starts_at: m.starts_at } : null;
            })(),
            scorepad_version_id: pad?.current.id ?? '00000000-0000-4000-e000-00000000ffff',
            game_id: gameId,
            games: game ? { id: game.id, title: game.title, cover_path: game.cover_path } : null,
            scorepad_versions: pad
              ? { player_slots: pad.current.player_slots, scorepads: { name: pad.name } }
              : null,
            play_results: play.play_results.map((r, index) => ({
              profile_id: r.profile_id,
              seat: r.seat ?? index + 1,
              ranking_value: r.ranking_value ?? null,
              place: r.place ?? null,
              points: r.points ?? null,
              is_win: r.is_win,
            })),
          },
        ],
      });
    }
    // Galeria karteczek gry (GAME-10): zapisane partie gry od najnowszej.
    const galleryGame = url.searchParams.get('game_id')?.replace(/^eq\./, '');
    if (url.pathname === '/rest/v1/plays' && request.method() === 'GET' && galleryGame) {
      const json = (mock.options.plays ?? [])
        .filter(
          (p) =>
            p.status === 'saved' &&
            (p.game_id ?? '00000000-0000-4000-b000-000000000001') === galleryGame,
        )
        .sort(
          (a, b) => (b.saved_at ?? '').localeCompare(a.saved_at ?? '') || b.id.localeCompare(a.id),
        )
        .map((p) => ({
          id: p.id,
          saved_at: p.saved_at,
          sheet_image_path: p.sheet_image_path ?? null,
          meetings: { title: meetingById(p.meeting_id)?.title ?? '' },
          play_results: p.play_results.map((r) => ({ profile_id: r.profile_id, is_win: r.is_win })),
        }));
      return route.fulfill({ json });
    }
    // Obraz karteczki (PAD-6) jak `attach_play_sheet_image`: tylko zapisana partia, pierwszy
    // obraz zostaje; `orphan_sheet_images` podaje pliki do sprzątania.
    if (url.pathname === '/rest/v1/rpc/attach_play_sheet_image' && request.method() === 'POST') {
      const body = request.postDataJSON() as { play_id: string; image_path: string };
      mock.sheetAttaches.push(body);
      const play = (mock.options.plays ?? []).find((p) => p.id === body.play_id);
      const fail = (code: string, hint: string) =>
        route.fulfill({ status: 400, json: { code, hint, message: hint } });
      if (!play) return fail('P0002', 'plays_not_found');
      if (play.status !== 'saved') return fail('23514', 'plays_sheet_image_not_saved');
      if (!mock.sheetUploads.some((u) => u.path === body.image_path)) {
        return fail('23503', 'plays_sheet_image_missing');
      }
      const path = play.sheet_image_path ?? body.image_path;
      mock.options.plays = (mock.options.plays ?? []).map((p) =>
        p.id === play.id ? { ...p, sheet_image_path: path } : p,
      );
      return route.fulfill({ json: { id: play.id, sheet_image_path: path } });
    }
    if (url.pathname === '/rest/v1/rpc/orphan_sheet_images' && request.method() === 'POST') {
      return route.fulfill({ json: mock.options.orphanSheets ?? [] });
    }
    // Szkic kartki (PAD-4) z kontrolą wersji jak `save_play_draft`.
    if (url.pathname === '/rest/v1/rpc/save_play_draft' && request.method() === 'POST') {
      const body = request.postDataJSON() as DraftSave;
      mock.draftSaves.push(body);
      if (mock.options.draftOffline) return route.abort('internetdisconnected');
      const fail = (status: number, code: string, hint: string) =>
        route.fulfill({ status, json: { code, hint, message: hint } });
      const play = (mock.options.plays ?? []).find((p) => p.id === body.play_id);
      if (!play) return fail(404, 'P0002', 'plays_not_found');
      if (play.status !== 'draft') return fail(400, '23514', 'plays_not_draft');
      const target = meetingById(play.meeting_id);
      if (target?.status !== 'in_progress') return fail(400, '23514', 'plays_meeting_in_progress');
      if ((play.draft_version ?? 0) !== body.base_version) {
        return fail(409, 'PT409', 'plays_draft_conflict');
      }
      const saved: MockPlay = {
        ...play,
        sheet: body.sheet,
        draft_version: body.base_version + 1,
        draft_saved_at: new Date().toISOString(),
        draft_saved_by: ADA.id,
      };
      mock.options.plays = (mock.options.plays ?? []).map((p) => (p.id === play.id ? saved : p));
      return route.fulfill({
        json: {
          id: saved.id,
          status: saved.status,
          draft_version: saved.draft_version,
          draft_saved_at: saved.draft_saved_at,
        },
      });
    }
    // Zapis partii (PAD-5) jak `save_play`: punkty i wygrane liczy „baza” ze snapshotu,
    // ponowienie z tą samą treścią zwraca zapisaną partię, inna treść jest odrzucana.
    if (url.pathname === '/rest/v1/rpc/save_play' && request.method() === 'POST') {
      const body = request.postDataJSON() as PlaySave;
      mock.playSaves.push(body);
      const fail = (status: number, code: string, hint: string) =>
        route.fulfill({ status, json: { code, hint, message: hint } });
      if (mock.options.savePlayError) {
        return route.fulfill({ status: 400, json: mock.options.savePlayError });
      }
      const play = (mock.options.plays ?? []).find((p) => p.id === body.play_id);
      if (!play) return fail(404, 'P0002', 'plays_not_found');
      const payload = JSON.stringify({ sheet: body.sheet, results: body.results });
      let saved = play;
      if (play.status === 'saved') {
        if (play.saved_payload !== payload) return fail(400, '23514', 'plays_already_saved');
      } else {
        const pad = (mock.options.scorepads ?? []).find((p) => p.id === play.scorepad_id);
        if (pad && pad.current.id !== body.scorepad_version_id) {
          return fail(400, '23514', 'plays_scorepad_version_mismatch');
        }
        if (body.results.some((r) => 'points' in r || 'is_win' in r)) {
          return fail(400, '23514', 'plays_results_invalid');
        }
        const snapshot = play.points_snapshot ?? [10, 6, 4, 2];
        // Jak `public.play_points`: miejsca po stronach (miejscach w notesie), n stron liczy
        // ostatnie n pozycji punktacji, remis = średnia w dół do setnych.
        const sides = new Map(body.results.map((r) => [r.seat, r.place]));
        const places = [...sides.values()];
        const shift = snapshot.length - places.length;
        saved = {
          ...play,
          status: 'saved',
          saved_at: new Date().toISOString(),
          sheet: body.sheet,
          saved_payload: payload,
          play_results: body.results.map((r) => {
            const tied = places.filter((p) => p === r.place).length;
            const start = shift + r.place - 1;
            const sum = snapshot
              .slice(start, start + tied)
              .reduce((a, b) => a + Math.round(b * 100), 0);
            return {
              profile_id: r.profile_id,
              seat: r.seat,
              place: r.place,
              ranking_value: r.ranking_value,
              points: Math.floor(sum / tied) / 100,
              is_win: r.place === 1,
            };
          }),
        };
        mock.options.plays = (mock.options.plays ?? []).map((p) => (p.id === play.id ? saved : p));
      }
      if ((mock.options.savePlayLostReplies ?? 0) > 0) {
        mock.options.savePlayLostReplies = (mock.options.savePlayLostReplies ?? 0) - 1;
        return route.abort('timedout');
      }
      return route.fulfill({ json: { id: saved.id } });
    }
    // Porzucenie partii w toku (PAD-8): szkic znika razem z graczami.
    if (url.pathname === '/rest/v1/rpc/discard_play' && request.method() === 'POST') {
      const { play_id } = request.postDataJSON() as { play_id: string };
      mock.discards.push(play_id);
      const play = (mock.options.plays ?? []).find((p) => p.id === play_id);
      if (!play) {
        return route.fulfill({
          status: 404,
          json: { code: 'P0002', hint: 'plays_not_found', message: 'plays_not_found' },
        });
      }
      if (play.status !== 'draft') {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'plays_not_draft', message: 'plays_not_draft' },
        });
      }
      mock.options.plays = (mock.options.plays ?? []).filter((p) => p.id !== play_id);
      return route.fulfill({ status: 204, body: '' });
    }
    // Usunięcie zapisanej partii przez admina (VIEW-6): partia znika z wynikami, RPC zwraca
    // ścieżkę obrazu karteczki do usunięcia przez API Storage.
    if (url.pathname === '/rest/v1/rpc/delete_play' && request.method() === 'POST') {
      const { play_id } = request.postDataJSON() as { play_id: string };
      mock.playDeletes.push(play_id);
      if ((mock.options.profile ?? ADA).role !== 'admin') {
        return route.fulfill({ status: 403, json: { code: '42501', message: 'admin only' } });
      }
      const play = (mock.options.plays ?? []).find((p) => p.id === play_id);
      if (!play) {
        return route.fulfill({
          status: 404,
          json: { code: 'P0002', hint: 'plays_not_found', message: 'plays_not_found' },
        });
      }
      if (play.status !== 'saved') {
        return route.fulfill({
          status: 400,
          json: { code: '23514', hint: 'plays_not_saved', message: 'plays_not_saved' },
        });
      }
      mock.options.plays = (mock.options.plays ?? []).filter((p) => p.id !== play_id);
      return route.fulfill({ json: play.sheet_image_path ?? null });
    }
    // Partie spotkania z grą i wynikami (VIEW-3), jak `plays?meeting_id=eq.…&select=…games(…)`.
    if (url.pathname === '/rest/v1/plays' && request.method() === 'GET') {
      const meetingId = url.searchParams.get('meeting_id')?.replace(/^eq\./, '');
      const json = (mock.options.plays ?? [])
        .filter((play) => play.meeting_id === meetingId)
        .map((play) => {
          const gameId = play.game_id ?? '00000000-0000-4000-b000-000000000001';
          const game = (mock.options.games ?? []).find((g) => g.id === gameId);
          return {
            id: play.id,
            status: play.status,
            started_at: play.started_at ?? play.saved_at ?? '2026-11-28T17:10:00+00:00',
            saved_at: play.saved_at,
            started_by: ADA.id,
            sheet_image_path: play.sheet_image_path ?? null,
            game_id: gameId,
            expansion_ids: play.expansion_ids ?? [],
            games: game ? { id: game.id, title: game.title, cover_path: game.cover_path } : null,
            play_results: play.play_results.map((r, index) => ({
              profile_id: r.profile_id,
              seat: r.seat ?? index + 1,
              ranking_value: r.ranking_value ?? null,
              place: r.place ?? null,
              points: r.points ?? null,
              is_win: r.is_win,
            })),
          };
        });
      return route.fulfill({ json });
    }
    // Rozpoczęcie i zakończenie spotkania (RUN-1, RUN-4, MTG-2) z regułami jak w bazie.
    const run = /^\/rest\/v1\/rpc\/(start|finish|reopen)_meeting$/.exec(url.pathname);
    if (run && request.method() === 'POST') {
      const action = run[1] as 'start' | 'finish' | 'reopen';
      const { meeting_id } = request.postDataJSON() as { meeting_id: string };
      mock.runs.push({ action, meeting_id });
      const target = meetingById(meeting_id);
      const fail = (status: number, code: string, hint: string) =>
        route.fulfill({ status, json: { code, hint, message: hint } });
      if (!target) return fail(404, 'P0002', 'meetings_not_found');
      if (action === 'reopen') {
        if ((mock.options.profile ?? ADA).role !== 'admin')
          return fail(403, '42501', 'admin_required');
        if (target.status !== 'finished') return fail(400, '23514', 'meetings_reopen_finished');
        if ((mock.options.meetings ?? []).some((m) => m.status === 'in_progress')) {
          return fail(409, '23505', 'meetings_single_in_progress');
        }
        const saved = { ...target, status: 'in_progress' as const, finished_at: null };
        setMeeting(saved);
        return route.fulfill({ json: saved });
      }
      if (action === 'start') {
        if (target.status !== 'planned') return fail(400, '23514', 'meetings_start_planned');
        const other = (mock.options.meetings ?? []).some(
          (m) => m.id !== target.id && m.status === 'in_progress',
        );
        if (other) return fail(409, '23505', 'meetings_single_in_progress');
        const saved = {
          ...target,
          status: 'in_progress' as const,
          voting_open: false,
          started_at: new Date().toISOString(),
        };
        setMeeting(saved);
        return route.fulfill({ json: saved });
      }
      if (target.status !== 'in_progress') return fail(400, '23514', 'meetings_finish_in_progress');
      const drafts = (mock.options.plays ?? []).some(
        (p) => p.meeting_id === target.id && p.status === 'draft',
      );
      if (drafts) return fail(400, '23514', 'meetings_no_drafts_when_finished');
      const saved = {
        ...target,
        status: 'finished' as const,
        finished_at: new Date().toISOString(),
      };
      setMeeting(saved);
      return route.fulfill({ json: saved });
    }
    // Nowa partia (RUN-2, PAD-3): szkic z graczami w miejscach, reguły jak `start_play`.
    if (url.pathname === '/rest/v1/rpc/start_play' && request.method() === 'POST') {
      const body = request.postDataJSON() as PlayStart;
      mock.playStarts.push(body);
      const fail = (status: number, code: string, hint: string) =>
        route.fulfill({ status, json: { code, hint, message: hint } });
      if (mock.options.startPlayError) {
        return route.fulfill({ status: 400, json: mock.options.startPlayError });
      }
      const target = meetingById(body.meeting_id);
      if (target?.status !== 'in_progress') return fail(400, '23514', 'plays_meeting_in_progress');
      const pad = (mock.options.scorepads ?? []).find((p) => p.id === body.scorepad_id);
      if (!pad) return fail(404, 'P0002', 'plays_scorepad_unavailable');
      const players = body.player_ids.filter((id): id is string => id !== null);
      if (new Set(players).size !== players.length) {
        return fail(400, '23514', 'plays_players_unique');
      }
      const play: MockPlay = {
        id: body.play_id,
        meeting_id: body.meeting_id,
        status: 'draft',
        saved_at: null,
        started_at: new Date().toISOString(),
        // Notes dodatku: partia należy do gry podstawowej.
        game_id:
          (mock.options.games ?? []).find((g) => g.id === pad.game_id)?.base_game_id ?? pad.game_id,
        scorepad_id: pad.id,
        expansion_ids: body.expansion_ids ?? [],
        play_results: body.player_ids.flatMap((id, index) =>
          id ? [{ profile_id: id, is_win: null, seat: index + 1 }] : [],
        ),
      };
      mock.options.plays = [...(mock.options.plays ?? []), play];
      return route.fulfill({ json: { id: play.id, status: 'draft' } });
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
      const base = url.searchParams.get('base_game_id');
      if (base === 'is.null') rows = rows.filter((row) => (row.base_game_id ?? null) === null);
      else if (base === 'not.is.null')
        rows = rows.filter((row) => (row.base_game_id ?? null) !== null);
      else if (base?.startsWith('eq.'))
        rows = rows.filter((row) => row.base_game_id === base.slice(3));
      if (base && base !== 'is.null')
        rows.sort((a, b) => searchText(a.title).localeCompare(searchText(b.title)));
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
    if (url.pathname === '/rest/v1/rpc/leaderboard' && request.method() === 'POST') {
      const body = request.postDataJSON() as Partial<MockLeaderboardCall> & { kind: string };
      const call: MockLeaderboardCall = {
        kind: body.kind,
        date_from: body.date_from ?? null,
        date_to: body.date_to ?? null,
        game_ids: body.game_ids ?? null,
      };
      mock.leaderboardCalls.push(call);
      const rows = mock.options.leaderboard?.(call.kind, call) ?? [];
      return route.fulfill({
        json: rows.map((row) => ({
          tied: false,
          reached_meeting_id: null,
          reached_meeting_title: null,
          reached_at: null,
          reached_points: null,
          wins: 0,
          ...row,
        })),
      });
    }
    if (url.pathname === '/rest/v1/rpc/game_vote_total' && request.method() === 'POST') {
      const { game_id } = request.postDataJSON() as { game_id: string };
      return route.fulfill({
        json: (mock.options.votes ?? []).filter((vote) => vote.game_id === game_id).length,
      });
    }
    if (url.pathname === '/rest/v1/rpc/game_stats' && request.method() === 'POST') {
      const { game_id } = request.postDataJSON() as { game_id: string };
      return route.fulfill({ json: mock.options.gameStats?.(game_id) ?? EMPTY_GAME_STATS });
    }
    if (url.pathname === '/rest/v1/rpc/player_stats' && request.method() === 'POST') {
      const { profile_id, ...call } = request.postDataJSON() as {
        profile_id: string;
      } & MockFilterCall;
      mock.playerStatsCalls.push({ profileId: profile_id, ...call });
      return route.fulfill({
        json: mock.options.playerStats?.(profile_id, call) ?? EMPTY_PLAYER_STATS,
      });
    }
    if (url.pathname === '/rest/v1/rpc/player_records' && request.method() === 'POST') {
      const { profile_id, ...call } = request.postDataJSON() as {
        profile_id: string;
      } & MockFilterCall;
      mock.playerRecordsCalls.push({ profileId: profile_id, ...call });
      return route.fulfill({ json: mock.options.playerRecords?.(profile_id, call) ?? [] });
    }
    if (
      url.pathname === '/rest/v1/rpc/meeting_leaderboard_changes' &&
      request.method() === 'POST'
    ) {
      const { meeting_id, game_ids } = request.postDataJSON() as {
        meeting_id: string;
        game_ids: string[] | null;
      };
      mock.summaryCalls.push({ meetingId: meeting_id, games: game_ids });
      return route.fulfill({ json: mock.options.meetingSummary?.(meeting_id, game_ids) ?? [] });
    }
    if (url.pathname === '/rest/v1/rpc/meeting_play_records' && request.method() === 'POST') {
      const { meeting_id } = request.postDataJSON() as { meeting_id: string };
      return route.fulfill({ json: mock.options.meetingRecords?.(meeting_id) ?? [] });
    }
    if (url.pathname === '/rest/v1/rpc/play_record_preview' && request.method() === 'POST') {
      const { play_id } = request.postDataJSON() as { play_id: string };
      return route.fulfill({ json: mock.options.recordPreview?.(play_id) ?? [] });
    }
    if (url.pathname === '/rest/v1/rpc/search_games' && request.method() === 'POST') {
      const { query } = request.postDataJSON() as { query: string };
      mock.gameSearches.push(query);
      const needle = searchText(query.trim());
      const rows = activeGames()
        .filter((g) => (g.base_game_id ?? null) === null && searchText(g.title).includes(needle))
        .sort((a, b) => searchText(a.title).localeCompare(searchText(b.title)));
      return route.fulfill({ json: rows });
    }
    if (url.pathname === '/rest/v1/games') {
      const method = request.method();
      // Tytuły gier i dodatków po id (dodatki partii w historii), także usuniętych.
      if (method === 'GET') {
        const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|\)$/g, '').split(',');
        const rows = (mock.options.games ?? [])
          .filter((g) => ids.includes(g.id))
          .map((g) => ({ id: g.id, title: g.title }));
        return route.fulfill({ json: rows });
      }
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
    // Pobranie okładki albo oryginału do ponownego kadrowania.
    if (
      /^\/storage\/v1\/object\/(?:authenticated\/)?covers\//.test(url.pathname) &&
      request.method() === 'GET'
    ) {
      return route.fulfill({ contentType: 'image/png', body: PIXEL_PNG });
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
    // Bucket `sheets` (PAD-6): obrazy karteczek, podpisane adresy (też hurtem) i usuwanie.
    if (url.pathname.startsWith(`${objectPrefix}sheets/`) && request.method() === 'POST') {
      if (mock.options.sheetUploadOffline) return route.abort('internetdisconnected');
      const path = decodeURIComponent(url.pathname.slice(`${objectPrefix}sheets/`.length));
      const body = request.postDataBuffer();
      // supabase-js wysyła Blob jako multipart: typ pliku jest w nagłówku części.
      const type = /content-type:\s*(image\/[a-z]+)/i.exec(body?.toString('latin1') ?? '')?.[1];
      mock.sheetUploads.push({
        path,
        type: type ?? request.headers()['content-type'] ?? '',
        size: body?.length ?? 0,
      });
      return route.fulfill({ json: { Key: url.pathname.slice(objectPrefix.length) } });
    }
    if (url.pathname === `${objectPrefix}sign/sheets` && request.method() === 'POST') {
      const { paths } = request.postDataJSON() as { paths: string[] };
      return route.fulfill({
        json: paths.map((path) => ({
          path,
          signedURL: `/object/sign/sheets/${path}?token=e2e`,
          error: null,
        })),
      });
    }
    if (url.pathname.startsWith(`${objectPrefix}sign/sheets/`)) {
      const path = url.pathname.slice(`${objectPrefix}sign/sheets/`.length);
      if (request.method() === 'GET') {
        return route.fulfill({ contentType: 'image/png', body: SHEET_PNG });
      }
      return route.fulfill({ json: { signedURL: `/object/sign/sheets/${path}?token=e2e` } });
    }
    if (url.pathname === `${objectPrefix}sheets` && request.method() === 'DELETE') {
      const { prefixes } = request.postDataJSON() as { prefixes: string[] };
      if ((mock.options.sheetRemoveFailures ?? 0) > 0) {
        mock.options.sheetRemoveFailures = (mock.options.sheetRemoveFailures ?? 0) - 1;
        return route.fulfill({
          status: 500,
          json: { statusCode: '500', error: 'internal', message: 'storage unavailable' },
        });
      }
      mock.sheetRemoved.push(...prefixes);
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
