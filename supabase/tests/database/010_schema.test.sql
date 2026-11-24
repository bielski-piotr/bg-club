-- [003] Struktura schematu: encje PRD §6, typy czasu, indeksy, rozszerzenia, RLS.
begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- Wszystkie encje z PRD §6.
select tables_are(
  'public',
  array[
    'club', 'profiles', 'games', 'scorepads', 'scorepad_versions', 'meetings',
    'meeting_participants', 'game_votes', 'meeting_games', 'plays', 'play_results',
    'meeting_date_options', 'meeting_date_votes'
  ],
  'schemat public ma dokładnie encje z PRD §6'
);

select columns_are('public', 'club',
  array['id', 'name', 'logo_path', 'timezone', 'created_at', 'updated_at'], 'kolumny club');
select columns_are('public', 'profiles',
  array['id', 'hook', 'first_name', 'last_name', 'avatar_path', 'role', 'theme', 'created_at', 'deleted_at',
        'password_change_suggested'],
  'kolumny profiles');
select columns_are('public', 'games',
  array['id', 'title', 'title_search', 'cover_path', 'min_players', 'max_players', 'placement_points',
        'created_at', 'updated_at', 'deleted_at', 'complexity'], 'kolumny games');
select columns_are('public', 'scorepads',
  array['id', 'game_id', 'name', 'current_version_id', 'created_at', 'updated_at', 'deleted_at'],
  'kolumny scorepads');
select columns_are('public', 'scorepad_versions',
  array['id', 'scorepad_id', 'version', 'template', 'image_path', 'player_slots', 'created_at', 'teams'],
  'kolumny scorepad_versions');
select columns_are('public', 'meetings',
  array['id', 'title', 'starts_at', 'status', 'voting_open', 'host_id', 'created_by', 'started_at',
        'finished_at', 'created_at', 'updated_at', 'date_voting_open'], 'kolumny meetings');
select columns_are('public', 'meeting_date_options',
  array['id', 'meeting_id', 'starts_at', 'created_at'], 'kolumny meeting_date_options');
select columns_are('public', 'meeting_date_votes',
  array['option_id', 'meeting_id', 'profile_id', 'created_at'], 'kolumny meeting_date_votes');
select columns_are('public', 'meeting_participants',
  array['meeting_id', 'profile_id', 'added_at'], 'kolumny meeting_participants');
select columns_are('public', 'game_votes',
  array['meeting_id', 'game_id', 'profile_id', 'created_at'], 'kolumny game_votes');
select columns_are('public', 'meeting_games',
  array['meeting_id', 'game_id', 'position'], 'kolumny meeting_games');
select columns_are('public', 'plays',
  array['id', 'meeting_id', 'game_id', 'scorepad_version_id', 'status', 'sheet', 'sheet_image_path',
        'points_snapshot', 'started_by', 'started_at', 'saved_at', 'draft_version', 'draft_saved_at',
        'draft_saved_by'], 'kolumny plays');
select columns_are('public', 'play_results',
  array['play_id', 'meeting_id', 'profile_id', 'seat', 'scores', 'ranking_value', 'place', 'tied',
        'points', 'is_win'], 'kolumny play_results');

-- NFR-10: żadnej kolumny `timestamp without time zone` ani `date` w schemacie public.
select is_empty(
  $$ select table_name || '.' || column_name
       from information_schema.columns
      where table_schema = 'public'
        and data_type in ('timestamp without time zone', 'date', 'time without time zone') $$,
  'wszystkie znaczniki czasu to timestamptz (NFR-10)'
);
select col_type_is('public', 'meetings', 'starts_at', 'timestamp with time zone', 'meetings.starts_at to timestamptz');

-- Klucze główne zgodne z PRD §6.
select col_is_pk('public', 'meeting_participants', array['meeting_id', 'profile_id'], 'PK meeting_participants');
select col_is_pk('public', 'game_votes', array['meeting_id', 'game_id', 'profile_id'], 'PK game_votes');
select col_is_pk('public', 'play_results', array['play_id', 'profile_id'], 'PK play_results');

-- Profil bez klucza obcego do auth.users (przeżywa usunięcie konta Auth).
select is_empty(
  $$ select conname from pg_constraint
      where conrelid = 'public.profiles'::regclass and contype = 'f' $$,
  'profiles nie ma klucza obcego do auth.users'
);

-- Indeksy.
select has_index('public', 'profiles', 'profiles_single_admin', 'indeks: jeden admin');
select has_index('public', 'meetings', 'meetings_single_in_progress', 'indeks: jedno spotkanie w trakcie');
select has_index('public', 'meetings', 'meetings_starts_at_idx', 'indeks: kolejność spotkań (Q24)');
select has_index('public', 'plays', 'plays_meeting_order_idx', 'indeks: kolejność partii (Q24)');
select has_index('public', 'games', 'games_title_search_trgm', 'indeks trigramowy wyszukiwania gier');
-- Każdy klucz obcy ma pełny (nie częściowy) indeks zaczynający się od pierwszej kolumny klucza,
-- żeby usuwanie wierszy nadrzędnych i złączenia nie skanowały całych tabel.
select is_empty(
  $$ select c.conrelid::regclass || ' ' || c.conname
       from pg_constraint c
      where c.contype = 'f'
        and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
           where i.indrelid = c.conrelid
             and i.indpred is null
             and i.indkey[0] = c.conkey[1]
        ) $$,
  'każdy klucz obcy ma indeks'
);

-- Rozszerzenia i wyszukiwanie bez polskich znaków (GAME-2).
select has_extension('extensions', 'unaccent', 'unaccent w schemacie extensions');
select has_extension('extensions', 'pg_trgm', 'pg_trgm w schemacie extensions');
select is(public.search_text('Łąka ŻÓŁW Ćma'), 'laka zolw cma', 'search_text usuwa polskie znaki i wielkość liter');
select volatility_is('public', 'search_text', array['text'], 'immutable', 'search_text jest immutable (indeksowalna)');

-- RLS włączone na każdej tabeli public (polityki i prawa ról: 050, 060).
select is_empty(
  $$ select relname from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity $$,
  'RLS włączone na wszystkich tabelach public'
);

-- Funkcje pomocnicze z bezpiecznym search_path.
select is_empty(
  $$ select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') $$,
  'każda funkcja w public ma ustawiony search_path'
);

-- Wyzwalacz Auth → profil.
select trigger_is('auth', 'users', 'on_auth_user_deleted', 'public', 'handle_auth_user_deleted',
  'usunięcie konta Auth oznacza profil jako usunięty');
select is(
  (select prosecdef from pg_proc where oid = 'public.handle_auth_user_deleted()'::regprocedure),
  true, 'handle_auth_user_deleted jest security definer'
);
-- Wyjątek: RPC klienta `security definer`, które zaczynają od strażnika roli (README,
-- „Uprawnienia”); lista jest jawna, a każde z nich sprawdza test poniżej.
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and (p.prorettype = 'trigger'::regtype or p.prosecdef)
        and p.oid not in (
          'public.save_scorepad(uuid,uuid,text,jsonb,text,int)'::regprocedure,
          'public.save_meeting(uuid,text,date,time,uuid[],uuid,boolean,jsonb)'::regprocedure,
          'public.decide_meeting_date(uuid,uuid)'::regprocedure,
          'public.reopen_date_voting(uuid)'::regprocedure,
          'public.start_meeting(uuid)'::regprocedure,
          'public.finish_meeting(uuid)'::regprocedure,
          'public.publish_meeting_games(uuid,uuid[])'::regprocedure,
          'public.reopen_voting(uuid)'::regprocedure,
          'public.start_play(uuid,uuid,uuid,uuid[],int[])'::regprocedure,
          'public.save_play_draft(uuid,jsonb,int)'::regprocedure,
          'public.discard_play(uuid)'::regprocedure,
          'public.save_play(uuid,uuid,jsonb,jsonb)'::regprocedure,
          'public.attach_play_sheet_image(uuid,text)'::regprocedure,
          'public.orphan_sheet_images(uuid)'::regprocedure,
          'public.delete_play(uuid)'::regprocedure,
          'public.reopen_meeting(uuid)'::regprocedure
        )
        and (has_function_privilege('anon', p.oid, 'execute')
             or has_function_privilege('authenticated', p.oid, 'execute')) $$,
  'anon i authenticated nie mają EXECUTE na funkcjach wyzwalaczy i security definer (poza RPC klienta)'
);
select ok(
  (select prosrc ~ '^\s*declare[^$]*begin\s+perform private\.require_admin\(\);'
     from pg_proc where oid = 'public.save_scorepad(uuid,uuid,text,jsonb,text,int)'::regprocedure),
  'save_scorepad (security definer) zaczyna od strażnika private.require_admin()'
);
select ok(
  (select prosrc ~ '^\s*declare[^$]*begin\s+perform private\.require_admin\(\);'
     from pg_proc where oid = 'public.save_meeting(uuid,text,date,time,uuid[],uuid,boolean,jsonb)'::regprocedure),
  'save_meeting (security definer) zaczyna od strażnika private.require_admin()'
);
select ok(
  (select bool_and(prosrc ~ '^\s*declare[^$]*begin\s+perform private\.require_admin\(\);')
     from pg_proc where oid in ('public.decide_meeting_date(uuid,uuid)'::regprocedure,
                                'public.reopen_date_voting(uuid)'::regprocedure)),
  'decide_meeting_date i reopen_date_voting (security definer) zaczynają od strażnika private.require_admin()'
);
select ok(
  (select bool_and(prosrc ~ '^\s*declare[^$]*begin\s+perform private\.require_meeting_runner\(')
     from pg_proc where oid in ('public.start_meeting(uuid)'::regprocedure, 'public.finish_meeting(uuid)'::regprocedure)),
  'start_meeting i finish_meeting (security definer) zaczynają od strażnika private.require_meeting_runner()'
);
select ok(
  (select prosrc ~ '^\s*declare[^$]*begin\s+perform private\.require_meeting_runner\(start_play\.meeting_id\);'
     from pg_proc where oid = 'public.start_play(uuid,uuid,uuid,uuid[],int[])'::regprocedure),
  'start_play (security definer) zaczyna od strażnika private.require_meeting_runner()'
);
select ok(
  (select bool_and(prosrc ~ '^\s*declare[^$]*begin\s+play_meeting_id := private\.play_meeting\(\w+\.play_id\);\s+perform private\.require_meeting_runner\(play_meeting_id\);')
     from pg_proc where oid in ('public.save_play_draft(uuid,jsonb,int)'::regprocedure, 'public.discard_play(uuid)'::regprocedure,
                                'public.save_play(uuid,uuid,jsonb,jsonb)'::regprocedure,
                                'public.attach_play_sheet_image(uuid,text)'::regprocedure)),
  'save_play_draft, discard_play, save_play i attach_play_sheet_image (security definer) zaczynają od strażnika private.require_meeting_runner()'
);
select ok(
  (select prosrc ~ '^\s*begin\s+perform private\.require_meeting_runner\(orphan_sheet_images\.meeting_id\);'
     from pg_proc where oid = 'public.orphan_sheet_images(uuid)'::regprocedure),
  'orphan_sheet_images (security definer) zaczyna od strażnika private.require_meeting_runner()'
);
select ok(
  (select bool_and(prosrc ~ '^\s*declare[^$]*begin\s+perform private\.require_admin\(\);')
     from pg_proc where oid in ('public.publish_meeting_games(uuid,uuid[])'::regprocedure, 'public.reopen_voting(uuid)'::regprocedure)),
  'publish_meeting_games i reopen_voting (security definer) zaczynają od strażnika private.require_admin()'
);
select ok(
  (select prosrc ~ '^\s*declare[^$]*begin\s+(--[^\n]*\s+)*perform private\.require_admin\(\);'
     from pg_proc where oid = 'public.delete_play(uuid)'::regprocedure),
  'delete_play (security definer) zaczyna od strażnika private.require_admin()'
);

-- Wartości domyślne.
select col_default_is('public', 'club', 'timezone', 'Europe/Warsaw', 'domyślna strefa klubu Europe/Warsaw');
select col_default_is('public', 'meetings', 'voting_open', 'true', 'zapis spotkania otwiera głosowanie (PLAN-2)');

select * from finish();

rollback;
