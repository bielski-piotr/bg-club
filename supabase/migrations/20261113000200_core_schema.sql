-- [003] Schemat danych BG Club (PRD §6).
--
-- Zasady:
-- - wszystkie znaczniki czasu to `timestamptz` (NFR-10),
-- - profile i gry usuwamy miękko (`deleted_at`), a klucze obce do nich są RESTRICT, więc historia
--   (partie, wyniki) nigdy nie traci autora ani gry,
-- - wersje notesów są niezmienne; partia wskazuje wersję i ma własny snapshot punktacji (GAME-9),
-- - globalnego limitu graczy nie ma: liczba graczy partii wynika z gry i notesu (GAME-4, EDT-8).
--
-- Reguły wymagające spojrzenia na inne wiersze (np. „uczestnik nie jest usunięty”) są
-- w wyzwalaczach w następnej migracji. RLS jest włączone tutaj na każdej tabeli (bez polityk,
-- więc klient nie ma dostępu); polityki, RPC i buckety Storage dochodzą w zadaniu [004].

-- ---------------------------------------------------------------------------------------------
-- club: jedyny klub instancji (CLUB-2)
-- ---------------------------------------------------------------------------------------------
create table public.club (
  -- Klucz ma tylko jedną dozwoloną wartość, więc drugi wiersz łamie klucz główny.
  id smallint primary key default 1 constraint club_singleton check (id = 1),
  name text not null
    constraint club_name_not_blank check (btrim(name) <> '')
    constraint club_name_length check (char_length(name) <= 80),
  logo_path text,
  timezone text not null default 'Europe/Warsaw',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.club is 'Jedyny klub instancji (CLUB-2). Drugi wiersz odrzuca klucz główny z CHECK (id = 1).';
comment on column public.club.timezone is 'Strefa IANA do wyświetlania dat i granic roku (NFR-10). Walidowana wyzwalaczem.';
comment on column public.club.logo_path is 'Ścieżka w buckecie covers; NULL = monogram nazwy.';

-- ---------------------------------------------------------------------------------------------
-- profiles: gracze (§5.2)
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  -- Ten sam uuid co auth.users.id, ale bez klucza obcego: profil zostaje w historii także po
  -- usunięciu konta Auth (MEM-4). Usunięcie konta Auth ustawia deleted_at (wyzwalacz).
  id uuid primary key,
  hook text not null
    constraint profiles_hook_key unique
    constraint profiles_hook_format check (hook ~ '^([a-z0-9]+-)+[0-9a-f]{4}$')
    constraint profiles_hook_length check (char_length(hook) <= 64),
  first_name text not null
    constraint profiles_first_name_not_blank check (btrim(first_name) <> '')
    constraint profiles_first_name_length check (char_length(first_name) <= 50),
  last_name text not null
    constraint profiles_last_name_not_blank check (btrim(last_name) <> '')
    constraint profiles_last_name_length check (char_length(last_name) <= 50),
  avatar_path text,
  role text not null default 'player'
    constraint profiles_role_check check (role in ('admin', 'player')),
  theme text not null default 'system'
    constraint profiles_theme_check check (theme in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Administratora nie da się usunąć (MEM-4, USR-6).
  constraint profiles_admin_not_deleted check (not (role = 'admin' and deleted_at is not null))
);

-- Dokładnie jeden administrator (AUTH-3): drugi wiersz z role = 'admin' łamie unikalność.
create unique index profiles_single_admin on public.profiles ((true)) where role = 'admin';

comment on table public.profiles is 'Gracze klubu. id = auth.users.id bez kaskady; profil przeżywa usunięcie konta Auth.';
comment on column public.profiles.hook is 'Login, np. jan-kowalski-3f9a (USR-1). Unikalny i niezmienny (wyzwalacz).';
comment on column public.profiles.created_at is 'Data dołączenia do klubu.';
comment on column public.profiles.deleted_at is 'Miękkie usunięcie (MEM-4). Profil zostaje w historii i statystykach.';

-- ---------------------------------------------------------------------------------------------
-- games: kolekcja gier (§5.4)
-- ---------------------------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null
    constraint games_title_not_blank check (btrim(title) <> '')
    constraint games_title_length check (char_length(title) <= 120),
  -- Postać tytułu do wyszukiwania (GAME-2): bez polskich znaków i wielkości liter.
  title_search text generated always as (public.search_text(title)) stored,
  cover_path text,
  -- Bez górnego limitu (GAME-4): o liczbie graczy partii decyduje notes.
  min_players int not null constraint games_min_players_check check (min_players >= 1),
  max_players int not null,
  -- Punkty za miejsca 1…max_players, ≥ 0, najwyżej dwa miejsca po przecinku (GAME-5).
  placement_points numeric[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Skomplikowanie 1,00…5,00 (GAME-5); wymagane przy dodaniu gry przez aplikację (wyzwalacz).
  complexity numeric(3, 2) constraint games_complexity_range check (complexity between 1 and 5),
  -- Gra podstawowa dodatku; NULL = gra podstawowa (bez zagnieżdżania, wyzwalacz).
  base_game_id uuid references public.games (id),
  -- Oryginał okładki i kadr (`{"zoom", "x", "y"}`) do ponownego kadrowania.
  cover_source_path text,
  cover_crop jsonb,
  -- Niedostępna gra zostaje w kolekcji, ale nie do wyboru w głosowaniu, publikacji i partii.
  available boolean not null default true,
  constraint games_players_range check (max_players >= min_players),
  constraint games_placement_points_check check (public.is_valid_points(placement_points, max_players)),
  constraint games_expansion_not_self check (base_game_id is distinct from id),
  constraint games_cover_crop_object check (cover_crop is null or jsonb_typeof(cover_crop) = 'object')
);

create index games_title_search_trgm on public.games
  using gin (title_search extensions.gin_trgm_ops) where deleted_at is null;
-- Widżet kolekcji: pozostałe gry według daty dodania malejąco (GAME-1, Q11).
create index games_created_at_idx on public.games (created_at desc, id) where deleted_at is null;
create index games_base_game_id_idx on public.games (base_game_id);

comment on table public.games is 'Kolekcja gier. Usunięcie miękkie (GAME-8): partie i statystyki zostają.';
comment on column public.games.placement_points is
  'Punkty leaderboardu za miejsca 1…max_players (długość = max_players), ≥ 0, do dwóch miejsc po przecinku.';
comment on column public.games.complexity is
  'Skomplikowanie gry 1,00…5,00 (GAME-5); podstawa wzoru punktacji miejsc. NULL tylko w grach dodanych poza aplikacją.';
comment on column public.games.base_game_id is
  'Gra podstawowa dodatku; NULL = gra podstawowa. Dodatki nie są w kolekcji ani w głosowaniu.';
comment on column public.games.cover_source_path is
  'Oryginał okładki w buckecie covers (podstawa ponownego kadrowania); NULL = kadruje się okładkę.';
comment on column public.games.cover_crop is
  'Kadr okładki z oryginału: {"zoom", "x", "y"}, przesunięcie jako ułamek boku kadru.';
comment on column public.games.available is
  'Dostępność gry: false = widoczna w kolekcji i filtrach, ale nie do wyboru w głosowaniu, publikacji i partii.';
comment on column public.games.title_search is 'search_text(title); wyszukiwanie: title_search like ''%'' || search_text(q) || ''%''.';

-- ---------------------------------------------------------------------------------------------
-- scorepads i scorepad_versions: notesy gry (GAME-7) i ich niezmienne wersje (GAME-9)
-- ---------------------------------------------------------------------------------------------
create table public.scorepads (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id),
  name text not null
    constraint scorepads_name_not_blank check (btrim(name) <> '')
    constraint scorepads_name_length check (char_length(name) <= 80),
  -- NULL tylko chwilowo, zanim powstanie pierwsza wersja. Klucz obcy dodany niżej.
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index scorepads_game_id_idx on public.scorepads (game_id);

create table public.scorepad_versions (
  id uuid primary key default gen_random_uuid(),
  scorepad_id uuid not null references public.scorepads (id),
  -- Numer kolejny wersji w notesie (1, 2, …), nadawany przez wyzwalacz.
  version int not null constraint scorepad_versions_version_check check (version >= 1),
  -- Szablon w formacie score-pad v2 z rozszerzeniem `ranking` (EDT-7). Bez zdjęcia w data URL.
  template jsonb not null constraint scorepad_versions_template_object check (jsonb_typeof(template) = 'object'),
  image_path text,
  -- Liczba miejsc dla graczy zdefiniowana w notesie (PAD-3, EDT-8). Bez górnego limitu.
  player_slots int not null constraint scorepad_versions_player_slots_check check (player_slots >= 1),
  created_at timestamptz not null default now(),
  -- Kategoria „nazwa gracza” z `team: true`: kilku graczy na jednym miejscu kartki (PAD-3).
  teams boolean not null
    generated always as (
      jsonb_path_exists(template, '$.lines[*] ? (@.kind == "names" && @.team == true)')
    ) stored,
  constraint scorepad_versions_number_key unique (scorepad_id, version),
  -- Cel złożonego klucza obcego scorepads.current_version_id.
  constraint scorepad_versions_id_scorepad_key unique (id, scorepad_id)
);

-- Aktualna wersja musi należeć do tego samego notesu.
alter table public.scorepads
  add constraint scorepads_current_version_fkey
  foreign key (current_version_id, id) references public.scorepad_versions (id, scorepad_id);

create index scorepads_current_version_id_idx on public.scorepads (current_version_id);

comment on table public.scorepads is 'Notesy przypisane do gry (0…n na grę). Usunięcie miękkie.';
comment on column public.scorepads.current_version_id is 'Wersja używana przy rozpoczęciu nowej partii.';
comment on table public.scorepad_versions is 'Niezmienne wersje szablonu notesu. Każda edycja notesu tworzy nową wersję (GAME-9).';
comment on column public.scorepad_versions.teams is
  'Kategoria „nazwa gracza” przyjmuje zespoły (template.lines[].team): kilku graczy na jednym miejscu kartki.';

-- ---------------------------------------------------------------------------------------------
-- meetings i powiązane: spotkania (§5.8)
-- ---------------------------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null
    constraint meetings_title_not_blank check (btrim(title) <> '')
    constraint meetings_title_length check (char_length(title) <= 120),
  starts_at timestamptz not null,
  status text not null default 'planned'
    constraint meetings_status_check check (status in ('planned', 'in_progress', 'finished')),
  -- Zapis zaplanowanego spotkania otwiera głosowanie (PLAN-2).
  voting_open boolean not null default true,
  -- Prowadzący (uczestnik inny niż admin); NULL = prowadzi admin (§2). Klucz obcy niżej.
  host_id uuid,
  created_by uuid not null references public.profiles (id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Głosowanie na proponowane terminy (niezależne od głosowania na gry).
  date_voting_open boolean not null default false,
  -- Głosowanie jest flagą statusu „zaplanowane” (§5.8); rozpoczęcie je zamyka (RUN-1).
  constraint meetings_voting_only_planned check (not voting_open or status = 'planned'),
  constraint meetings_date_voting_only_planned check (not date_voting_open or status = 'planned'),
  constraint meetings_status_timestamps check (
    case status
      when 'planned' then started_at is null and finished_at is null
      when 'in_progress' then started_at is not null and finished_at is null
      when 'finished' then started_at is not null and finished_at is not null and finished_at >= started_at
    end
  )
);

-- Jednocześnie może trwać tylko jedno spotkanie (MTG-2).
create unique index meetings_single_in_progress on public.meetings ((true)) where status = 'in_progress';
-- Kolejność zdarzeń: starts_at, potem id (§5.6.6, Q24); kalendarz i timeline.
create index meetings_starts_at_idx on public.meetings (starts_at, id);
-- Odebranie prowadzenia przy usunięciu członka (MEM-6).
create index meetings_host_id_idx on public.meetings (host_id) where host_id is not null;
create index meetings_created_by_idx on public.meetings (created_by);

comment on table public.meetings is 'Spotkania klubu. Statusy: planned → in_progress → finished (§5.8).';
comment on column public.meetings.host_id is 'Prowadzący spotkania; NULL = admin. Musi być uczestnikiem (klucz obcy).';
comment on column public.meetings.date_voting_open is
  'Głosowanie na proponowane terminy otwarte; tylko w zaplanowanym spotkaniu.';

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (meeting_id, profile_id)
);

create index meeting_participants_profile_id_idx on public.meeting_participants (profile_id);

comment on table public.meeting_participants is 'Uczestnicy spotkania. Bez limitu liczby uczestników (Q12).';

-- Prowadzący musi być uczestnikiem. Usunięcie go z uczestników oddaje prowadzenie adminowi
-- (host_id = NULL, MEM-6). Klucz jest odroczony, żeby spotkanie, jego uczestników i
-- prowadzącego dało się zapisać w jednej transakcji w dowolnej kolejności.
alter table public.meetings
  add constraint meetings_host_participant_fkey
  foreign key (id, host_id) references public.meeting_participants (meeting_id, profile_id)
  on delete set null (host_id)
  deferrable initially deferred;

create table public.game_votes (
  meeting_id uuid not null,
  game_id uuid not null references public.games (id),
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  -- Jeden głos gracza na grę w spotkaniu (VOTE-2).
  primary key (meeting_id, game_id, profile_id),
  -- Głosuje tylko uczestnik; usunięcie uczestnika kasuje jego głosy (MEM-6).
  foreign key (meeting_id, profile_id)
    references public.meeting_participants (meeting_id, profile_id) on delete cascade
);

create index game_votes_game_id_idx on public.game_votes (game_id);
create index game_votes_profile_id_idx on public.game_votes (profile_id, meeting_id);

comment on table public.game_votes is 'Jawne głosy na gry w spotkaniu (§5.8.4).';

create table public.meeting_games (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  game_id uuid not null references public.games (id),
  position int not null constraint meeting_games_position_check check (position >= 0),
  primary key (meeting_id, game_id),
  constraint meeting_games_position_key unique (meeting_id, position) deferrable initially deferred
);

create index meeting_games_game_id_idx on public.meeting_games (game_id);

comment on table public.meeting_games is 'Gry opublikowane przy zamknięciu głosowania („Gramy w:”, VOTE-5).';

create table public.meeting_date_options (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  starts_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint meeting_date_options_unique unique (meeting_id, starts_at),
  constraint meeting_date_options_id_meeting_key unique (id, meeting_id)
);

create index meeting_date_options_created_by_idx on public.meeting_date_options (created_by);

comment on table public.meeting_date_options is
  'Proponowane terminy spotkania (głosowanie na termin); dodają je uczestnicy i administrator.';

create table public.meeting_date_votes (
  option_id uuid not null,
  meeting_id uuid not null,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (option_id, profile_id),
  foreign key (option_id, meeting_id)
    references public.meeting_date_options (id, meeting_id) on delete cascade,
  -- Głosuje tylko uczestnik; usunięcie uczestnika kasuje jego głosy.
  foreign key (meeting_id, profile_id)
    references public.meeting_participants (meeting_id, profile_id) on delete cascade
);

create index meeting_date_votes_meeting_idx on public.meeting_date_votes (meeting_id, profile_id);

comment on table public.meeting_date_votes is
  'Jawne głosy uczestników na proponowane terminy; opinia, termin ustala administrator.';

-- ---------------------------------------------------------------------------------------------
-- plays i play_results: partie (§5.5.1, §5.6)
-- ---------------------------------------------------------------------------------------------
create table public.plays (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: spotkania z partiami nie da się usunąć (PLAN-5, Q4).
  meeting_id uuid not null references public.meetings (id),
  game_id uuid not null references public.games (id),
  -- Niezmienna wersja szablonu z chwili rozpoczęcia partii (GAME-9, Q23).
  scorepad_version_id uuid not null references public.scorepad_versions (id),
  status text not null default 'draft'
    constraint plays_status_check check (status in ('draft', 'saved')),
  -- Dane kartki (SheetData, PAD-4/PAD-6): szkic w trakcie, pełny zapis po oderwaniu.
  sheet jsonb constraint plays_sheet_object check (sheet is null or jsonb_typeof(sheet) = 'object'),
  sheet_image_path text,
  -- Snapshot punktacji gry z chwili rozpoczęcia partii (GAME-9). Ustawiany w bazie (wyzwalacz).
  points_snapshot numeric[] not null,
  started_by uuid not null references public.profiles (id),
  started_at timestamptz not null default now(),
  saved_at timestamptz,
  -- Szkic kartki (PAD-4): wersja rośnie o 1 przy każdym zapisie `save_play_draft` ([028]).
  draft_version int not null default 0 constraint plays_draft_version_check check (draft_version >= 0),
  draft_saved_at timestamptz,
  draft_saved_by uuid references public.profiles (id),
  -- Dodatki gry użyte w partii (games.id z base_game_id = game_id); niezmienne.
  expansion_ids uuid[] not null default '{}'
    constraint plays_expansion_ids_shape check (
      array_position(expansion_ids, null) is null
      and (cardinality(expansion_ids) = 0 or array_ndims(expansion_ids) = 1)
    ),
  constraint plays_points_snapshot_check check (public.is_valid_points(points_snapshot, cardinality(points_snapshot))
    and cardinality(points_snapshot) >= 1),
  constraint plays_saved_at_check check ((status = 'saved') = (saved_at is not null)),
  -- Cel złożonego klucza obcego z play_results.
  constraint plays_id_meeting_key unique (id, meeting_id)
);

-- Kolejność partii w spotkaniu: saved_at, potem id (§5.6.6, Q24).
create index plays_meeting_order_idx on public.plays (meeting_id, saved_at, id);
create index plays_game_id_idx on public.plays (game_id, saved_at);
create index plays_scorepad_version_id_idx on public.plays (scorepad_version_id);
create index plays_started_by_idx on public.plays (started_by);
create index plays_expansion_ids_idx on public.plays using gin (expansion_ids)
  where cardinality(expansion_ids) > 0;

comment on table public.plays is 'Partie: szkic (draft) albo zapisana karteczka (saved). Szkice nie liczą się do statystyk.';
comment on column public.plays.points_snapshot is 'Kopia games.placement_points z chwili utworzenia szkicu; ustawiana wyzwalaczem.';
comment on column public.plays.expansion_ids is
  'Dodatki gry użyte w partii (games.id z base_game_id = game_id); niezmienne. Wyniki liczą się dla gry podstawowej.';

create table public.play_results (
  play_id uuid not null,
  -- Powielone z plays, żeby klucz obcy wymusił udział gracza w spotkaniu.
  meeting_id uuid not null,
  profile_id uuid not null,
  -- Miejsce gracza w notesie (kolumna lub wiersz), numerowane od 1. Górną granicę
  -- (player_slots wersji notesu) sprawdza wyzwalacz.
  seat int not null constraint play_results_seat_check check (seat >= 1),
  -- Wartości kategorii gracza z kartki (`values` z PAD-7; nazwa `values` jest słowem
  -- zastrzeżonym SQL, stąd `scores`).
  scores jsonb not null default '{}'::jsonb
    constraint play_results_scores_object check (jsonb_typeof(scores) = 'object'),
  -- Wyniki uzupełniane przy zapisie partii (RPC save_play); w szkicu są NULL.
  ranking_value numeric,
  place int constraint play_results_place_check check (place >= 1),
  tied boolean,
  points numeric constraint play_results_points_check check (points >= 0 and points = round(points, 2)),
  is_win boolean,
  -- Jedna partia danego gracza na karteczce. Kilku graczy na miejscu kartki tylko w notesie
  -- z zespołami (`scorepad_versions.teams`); pilnuje tego wyzwalacz `play_results_before_write`.
  primary key (play_id, profile_id),
  constraint play_results_outcome_complete check (
    (place is null and tied is null and points is null and is_win is null)
    or (place is not null and tied is not null and points is not null and is_win is not null)
  ),
  -- Wygrana = miejsce 1, także wspólne (§5.6.3).
  constraint play_results_win_is_first_place check (is_win is null or is_win = (place = 1)),
  foreign key (play_id, meeting_id) references public.plays (id, meeting_id) on delete cascade,
  -- Gracz jest uczestnikiem spotkania; uczestnika z partią nie da się usunąć (PLAN-4).
  foreign key (meeting_id, profile_id) references public.meeting_participants (meeting_id, profile_id)
);

create index play_results_profile_id_idx on public.play_results (profile_id);
create index play_results_meeting_profile_idx on public.play_results (meeting_id, profile_id);
create index play_results_play_seat_idx on public.play_results (play_id, seat);

comment on table public.play_results is 'Wyniki graczy partii: miejsce, remis, punkty leaderboardu, wygrana (§5.6).';
comment on column public.play_results.ranking_value is 'Wartość kategorii decydującej (EDT-2); podstawa rekordów gry (GAME-11).';

-- ---------------------------------------------------------------------------------------------
-- RLS: włączone wszędzie, bez polityk = brak dostępu dla anon i authenticated.
-- Polityki dochodzą w zadaniu [004].
-- ---------------------------------------------------------------------------------------------
alter table public.club enable row level security;
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.scorepads enable row level security;
alter table public.scorepad_versions enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.game_votes enable row level security;
alter table public.meeting_games enable row level security;
alter table public.meeting_date_options enable row level security;
alter table public.meeting_date_votes enable row level security;
alter table public.plays enable row level security;
alter table public.play_results enable row level security;
