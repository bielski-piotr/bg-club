-- Schemat danych BG Club.
--
-- Zasady:
-- - wszystkie znaczniki czasu to `timestamptz`,
-- - profile i gry usuwamy miękko (`deleted_at`), a klucze obce do nich są RESTRICT, więc historia
--   (partie, wyniki, osiągnięcia) nigdy nie traci autora ani gry,
-- - wersje notesów są niezmienne; partia wskazuje wersję i ma własny snapshot punktacji,
-- - globalnego limitu graczy nie ma: liczba graczy partii wynika z gry i notesu.
--
-- Reguły wymagające spojrzenia na inne wiersze (np. „uczestnik nie jest usunięty”) są
-- w wyzwalaczach w następnej migracji. RLS jest włączone tutaj na każdej tabeli (bez polityk,
-- więc klient nie ma dostępu); polityki, RPC i buckety Storage dochodzą.

-- ---------------------------------------------------------------------------------------------
-- club: jedyny klub instancji
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

comment on table public.club is 'Jedyny klub instancji. Drugi wiersz odrzuca klucz główny z CHECK (id = 1).';
comment on column public.club.timezone is 'Strefa IANA do wyświetlania dat i granic roku. Walidowana wyzwalaczem.';
comment on column public.club.logo_path is 'Ścieżka w buckecie covers; NULL = monogram nazwy.';

-- ---------------------------------------------------------------------------------------------
-- profiles: gracze
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  -- Ten sam uuid co auth.users.id, ale bez klucza obcego: profil zostaje w historii także po
  -- usunięciu konta Auth. Usunięcie konta Auth ustawia deleted_at (wyzwalacz).
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
  -- Administratora nie da się usunąć.
  constraint profiles_admin_not_deleted check (not (role = 'admin' and deleted_at is not null))
);

-- Dokładnie jeden administrator: drugi wiersz z role = 'admin' łamie unikalność.
create unique index profiles_single_admin on public.profiles ((true)) where role = 'admin';

comment on table public.profiles is 'Gracze klubu. id = auth.users.id bez kaskady; profil przeżywa usunięcie konta Auth.';
comment on column public.profiles.hook is 'Login, np. jan-kowalski-3f9a. Unikalny i niezmienny (wyzwalacz).';
comment on column public.profiles.created_at is 'Data dołączenia do klubu.';
comment on column public.profiles.deleted_at is 'Miękkie usunięcie. Profil zostaje w historii i statystykach.';

-- ---------------------------------------------------------------------------------------------
-- games: kolekcja gier
-- ---------------------------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null
    constraint games_title_not_blank check (btrim(title) <> '')
    constraint games_title_length check (char_length(title) <= 120),
  -- Postać tytułu do wyszukiwania: bez polskich znaków i wielkości liter.
  title_search text generated always as (public.search_text(title)) stored,
  cover_path text,
  -- Bez górnego limitu: o liczbie graczy partii decyduje notes.
  min_players int not null constraint games_min_players_check check (min_players >= 1),
  max_players int not null,
  -- Punkty za miejsca 1…max_players, liczby całkowite ≥ 0.
  placement_points int[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint games_players_range check (max_players >= min_players),
  constraint games_placement_points_check check (public.is_valid_points(placement_points, max_players))
);

create index games_title_search_trgm on public.games
  using gin (title_search extensions.gin_trgm_ops) where deleted_at is null;
-- Widżet kolekcji: pozostałe gry według daty dodania malejąco.
create index games_created_at_idx on public.games (created_at desc, id) where deleted_at is null;

comment on table public.games is 'Kolekcja gier. Usunięcie miękkie: partie i statystyki zostają.';
comment on column public.games.placement_points is 'Punkty leaderboardu za miejsca 1…max_players (długość = max_players).';
comment on column public.games.title_search is 'search_text(title); wyszukiwanie: title_search like ''%'' || search_text(q) || ''%''.';

-- ---------------------------------------------------------------------------------------------
-- scorepads i scorepad_versions: notesy gry i ich niezmienne wersje
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
  -- Szablon w formacie score-pad v2 z rozszerzeniem `ranking`. Bez zdjęcia w data URL.
  template jsonb not null constraint scorepad_versions_template_object check (jsonb_typeof(template) = 'object'),
  image_path text,
  -- Liczba miejsc dla graczy zdefiniowana w notesie. Bez górnego limitu.
  player_slots int not null constraint scorepad_versions_player_slots_check check (player_slots >= 1),
  created_at timestamptz not null default now(),
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
comment on table public.scorepad_versions is 'Niezmienne wersje szablonu notesu. Każda edycja notesu tworzy nową wersję.';

-- ---------------------------------------------------------------------------------------------
-- meetings i powiązane: spotkania
-- ---------------------------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null
    constraint meetings_title_not_blank check (btrim(title) <> '')
    constraint meetings_title_length check (char_length(title) <= 120),
  starts_at timestamptz not null,
  status text not null default 'planned'
    constraint meetings_status_check check (status in ('planned', 'in_progress', 'finished')),
  -- Zapis zaplanowanego spotkania otwiera głosowanie.
  voting_open boolean not null default true,
  -- Prowadzący (uczestnik inny niż admin); NULL = prowadzi admin. Klucz obcy niżej.
  host_id uuid,
  created_by uuid not null references public.profiles (id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Głosowanie jest flagą statusu „zaplanowane”; rozpoczęcie je zamyka.
  constraint meetings_voting_only_planned check (not voting_open or status = 'planned'),
  constraint meetings_status_timestamps check (
    case status
      when 'planned' then started_at is null and finished_at is null
      when 'in_progress' then started_at is not null and finished_at is null
      when 'finished' then started_at is not null and finished_at is not null and finished_at >= started_at
    end
  )
);

-- Jednocześnie może trwać tylko jedno spotkanie.
create unique index meetings_single_in_progress on public.meetings ((true)) where status = 'in_progress';
-- Kolejność zdarzeń: starts_at, potem id; kalendarz i timeline.
create index meetings_starts_at_idx on public.meetings (starts_at, id);
-- Odebranie prowadzenia przy usunięciu członka.
create index meetings_host_id_idx on public.meetings (host_id) where host_id is not null;
create index meetings_created_by_idx on public.meetings (created_by);

comment on table public.meetings is 'Spotkania klubu. Statusy: planned → in_progress → finished.';
comment on column public.meetings.host_id is 'Prowadzący spotkania; NULL = admin. Musi być uczestnikiem (klucz obcy).';

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  added_at timestamptz not null default now(),
  primary key (meeting_id, profile_id)
);

create index meeting_participants_profile_id_idx on public.meeting_participants (profile_id);

comment on table public.meeting_participants is 'Uczestnicy spotkania. Bez limitu liczby uczestników.';

-- Prowadzący musi być uczestnikiem. Usunięcie go z uczestników oddaje prowadzenie adminowi
-- (host_id = NULL). Klucz jest odroczony, żeby spotkanie, jego uczestników i
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
  -- Jeden głos gracza na grę w spotkaniu.
  primary key (meeting_id, game_id, profile_id),
  -- Głosuje tylko uczestnik; usunięcie uczestnika kasuje jego głosy.
  foreign key (meeting_id, profile_id)
    references public.meeting_participants (meeting_id, profile_id) on delete cascade
);

create index game_votes_game_id_idx on public.game_votes (game_id);
create index game_votes_profile_id_idx on public.game_votes (profile_id, meeting_id);

comment on table public.game_votes is 'Jawne głosy na gry w spotkaniu.';

create table public.meeting_games (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  game_id uuid not null references public.games (id),
  position int not null constraint meeting_games_position_check check (position >= 0),
  primary key (meeting_id, game_id),
  constraint meeting_games_position_key unique (meeting_id, position) deferrable initially deferred
);

create index meeting_games_game_id_idx on public.meeting_games (game_id);

comment on table public.meeting_games is 'Gry opublikowane przy zamknięciu głosowania („Gramy w:”).';

-- ---------------------------------------------------------------------------------------------
-- plays i play_results: partie
-- ---------------------------------------------------------------------------------------------
create table public.plays (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: spotkania z partiami nie da się usunąć.
  meeting_id uuid not null references public.meetings (id),
  game_id uuid not null references public.games (id),
  -- Niezmienna wersja szablonu z chwili rozpoczęcia partii.
  scorepad_version_id uuid not null references public.scorepad_versions (id),
  status text not null default 'draft'
    constraint plays_status_check check (status in ('draft', 'saved')),
  -- Dane kartki (SheetData): szkic w trakcie, pełny zapis po oderwaniu.
  sheet jsonb constraint plays_sheet_object check (sheet is null or jsonb_typeof(sheet) = 'object'),
  sheet_image_path text,
  -- Snapshot punktacji gry z chwili rozpoczęcia partii. Ustawiany w bazie (wyzwalacz).
  points_snapshot int[] not null,
  started_by uuid not null references public.profiles (id),
  started_at timestamptz not null default now(),
  saved_at timestamptz,
  constraint plays_points_snapshot_check check (public.is_valid_points(points_snapshot, cardinality(points_snapshot))
    and cardinality(points_snapshot) >= 1),
  constraint plays_saved_at_check check ((status = 'saved') = (saved_at is not null)),
  -- Cel złożonego klucza obcego z play_results.
  constraint plays_id_meeting_key unique (id, meeting_id)
);

-- Kolejność partii w spotkaniu: saved_at, potem id.
create index plays_meeting_order_idx on public.plays (meeting_id, saved_at, id);
create index plays_game_id_idx on public.plays (game_id, saved_at);
create index plays_scorepad_version_id_idx on public.plays (scorepad_version_id);
create index plays_started_by_idx on public.plays (started_by);

comment on table public.plays is 'Partie: szkic (draft) albo zapisana karteczka (saved). Szkice nie liczą się do statystyk.';
comment on column public.plays.points_snapshot is 'Kopia games.placement_points z chwili utworzenia szkicu; ustawiana wyzwalaczem.';

create table public.play_results (
  play_id uuid not null,
  -- Powielone z plays, żeby klucz obcy wymusił udział gracza w spotkaniu.
  meeting_id uuid not null,
  profile_id uuid not null,
  -- Miejsce gracza w notesie (kolumna lub wiersz), numerowane od 1. Górną granicę
  -- (player_slots wersji notesu) sprawdza wyzwalacz.
  seat int not null constraint play_results_seat_check check (seat >= 1),
  -- Wartości kategorii gracza z kartki (`values` zdarzenia zapisu kartki; nazwa `values` jest słowem
  -- zastrzeżonym SQL, stąd `scores`).
  scores jsonb not null default '{}'::jsonb
    constraint play_results_scores_object check (jsonb_typeof(scores) = 'object'),
  -- Wyniki uzupełniane przy zapisie partii (RPC save_play); w szkicu są NULL.
  ranking_value numeric,
  place int constraint play_results_place_check check (place >= 1),
  tied boolean,
  points int constraint play_results_points_check check (points >= 0),
  is_win boolean,
  -- Jedna partia danego gracza na karteczce i jeden gracz na miejsce w notesie.
  primary key (play_id, profile_id),
  constraint play_results_seat_key unique (play_id, seat),
  constraint play_results_outcome_complete check (
    (place is null and tied is null and points is null and is_win is null)
    or (place is not null and tied is not null and points is not null and is_win is not null)
  ),
  -- Wygrana = miejsce 1, także wspólne.
  constraint play_results_win_is_first_place check (is_win is null or is_win = (place = 1)),
  foreign key (play_id, meeting_id) references public.plays (id, meeting_id) on delete cascade,
  -- Gracz jest uczestnikiem spotkania; uczestnika z partią nie da się usunąć.
  foreign key (meeting_id, profile_id) references public.meeting_participants (meeting_id, profile_id)
);

create index play_results_profile_id_idx on public.play_results (profile_id);
create index play_results_meeting_profile_idx on public.play_results (meeting_id, profile_id);

comment on table public.play_results is 'Wyniki graczy partii: miejsce, remis, punkty leaderboardu, wygrana.';
comment on column public.play_results.ranking_value is 'Wartość kategorii decydującej; podstawa rekordów gry.';

-- ---------------------------------------------------------------------------------------------
-- achievement_unlocks: odblokowane osiągnięcia
-- ---------------------------------------------------------------------------------------------
create table public.achievement_unlocks (
  profile_id uuid not null references public.profiles (id),
  -- Identyfikator z katalogu w kodzie, np. meet-10, beginners-luck.
  achievement_id text not null
    constraint achievement_unlocks_id_format check (achievement_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Data spotkania, na którym warunek spełniono po raz pierwszy.
  unlocked_at timestamptz not null,
  -- Osiągnięcia są przeliczane po usunięciu partii lub spotkania; kaskada usuwa
  -- odblokowania wskazujące usunięte zdarzenie, zanim przeliczenie je odtworzy.
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  play_id uuid references public.plays (id) on delete cascade,
  primary key (profile_id, achievement_id)
);

create index achievement_unlocks_meeting_id_idx on public.achievement_unlocks (meeting_id);
create index achievement_unlocks_play_id_idx on public.achievement_unlocks (play_id);

comment on table public.achievement_unlocks is 'Odblokowane osiągnięcia. Katalog jest w kodzie.';

-- ---------------------------------------------------------------------------------------------
-- RLS: włączone wszędzie, bez polityk = brak dostępu dla anon i authenticated.
-- Polityki dochodzą.
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
alter table public.plays enable row level security;
alter table public.play_results enable row level security;
alter table public.achievement_unlocks enable row level security;
