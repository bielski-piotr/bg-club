-- [004] Kontrakt uprawnień w katalogu bazy: prawa ról klienta, EXECUTE funkcji, polityki RLS,
-- search_path funkcji SECURITY DEFINER i buckety Storage.
-- Nowa tabela, kolumna z prawem zapisu albo funkcja dostępna dla klienta wymaga świadomej
-- zmiany oczekiwań w tym pliku.
begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- ---------------------------------------------------------------------------------------------
-- anon: żadnych praw (PRD §6.1: odczyt tylko dla zalogowanych)
-- ---------------------------------------------------------------------------------------------
select is_empty(
  $$ select table_name || ' ' || privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema in ('public', 'private') $$,
  'anon nie ma praw do tabel public'
);
select is_empty(
  $$ select table_name || '.' || column_name from information_schema.column_privileges
      where grantee = 'anon' and table_schema in ('public', 'private') $$,
  'anon nie ma praw do kolumn tabel public'
);
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon nie wykona żadnej funkcji public ani private'
);
select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon nie ma dostępu do schematu private'
);

-- ---------------------------------------------------------------------------------------------
-- authenticated: dokładnie te prawa, których potrzebuje SPA (resztę robią RPC i Edge Functions)
-- ---------------------------------------------------------------------------------------------
select results_eq(
  $$ select table_name::text collate "default", string_agg(privilege_type::text, ',' order by privilege_type) collate "default"
       from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'public'
      group by table_name
      order by table_name $$,
  $$ values
       ('achievement_unlocks', 'SELECT'),
       ('club', 'SELECT'),
       ('game_collection', 'SELECT'),
       ('game_votes', 'DELETE,SELECT'),
       ('games', 'SELECT'),
       ('meeting_games', 'SELECT'),
       ('meeting_participants', 'SELECT'),
       ('meetings', 'DELETE,SELECT'),
       ('play_results', 'SELECT'),
       ('plays', 'SELECT'),
       ('profiles', 'SELECT'),
       ('scorepad_versions', 'SELECT'),
       ('scorepads', 'SELECT') $$,
  'authenticated: prawa do całych tabel (bez TRUNCATE, REFERENCES, TRIGGER)'
);
select results_eq(
  $$ select table_name::text collate "default", privilege_type::text collate "default",
            string_agg(column_name::text, ',' order by column_name) collate "default"
       from information_schema.column_privileges
      where grantee = 'authenticated' and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE')
      group by table_name, privilege_type
      order by table_name, privilege_type $$,
  $$ values
       ('club', 'INSERT', 'logo_path,name,timezone'),
       ('club', 'UPDATE', 'logo_path,name,timezone'),
       ('game_votes', 'INSERT', 'game_id,meeting_id,profile_id'),
       ('games', 'INSERT', 'cover_path,id,max_players,min_players,placement_points,title'),
       ('games', 'UPDATE', 'cover_path,deleted_at,max_players,min_players,placement_points,title'),
       ('profiles', 'UPDATE', 'avatar_path,first_name,last_name,password_change_suggested,theme'),
       ('scorepads', 'UPDATE', 'current_version_id,deleted_at,name') $$,
  'authenticated: zapis tylko dozwolonych kolumn (profil bez role, hook, deleted_at; notesy przez save_scorepad, spotkania przez save_meeting, gry spotkania przez publish_meeting_games)'
);
select results_eq(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and has_function_privilege('authenticated', p.oid, 'execute')
      order by p.oid::regprocedure::text collate "C" $$,
  $$ values
       ('attach_play_sheet_image(uuid,text)'),
       ('delete_play(uuid)'),
       ('discard_play(uuid)'),
       ('f_unaccent(text)'),
       ('finish_meeting(uuid)'),
       ('game_stats(uuid)'),
       ('is_valid_points(integer[],integer)'),
       ('is_valid_timezone(text)'),
       ('leaderboard(text,integer)'),
       ('leaderboard_years()'),
       ('meeting_summary(uuid)'),
       ('orphan_sheet_images(uuid)'),
       ('player_stats(uuid,integer)'),
       ('private.club_timezone()'),
       ('private.is_active_member()'),
       ('private.is_admin()'),
       ('private.is_meeting_runner(uuid)'),
       ('private.is_voting_open(uuid)'),
       ('private.scorepad_ranking(jsonb)'),
       ('private.try_uuid(text)'),
       ('publish_meeting_games(uuid,uuid[])'),
       ('reopen_voting(uuid)'),
       ('save_meeting(uuid,text,date,time without time zone,uuid[],uuid,boolean)'),
       ('save_play(uuid,uuid,jsonb,jsonb)'),
       ('save_play_draft(uuid,jsonb,integer)'),
       ('save_scorepad(uuid,uuid,text,jsonb,text,integer)'),
       ('search_games(text)'),
       ('search_text(text)'),
       ('start_meeting(uuid)'),
       ('start_play(uuid,uuid,uuid,uuid[])') $$,
  'authenticated wykona tylko funkcje czyste, sprawdzające role, wyszukiwanie gier, zapis notesu, RPC spotkań, rozpoczęcie, szkic, porzucenie, zapis i usunięcie partii, obrazy karteczek, rankingi, statystyki gry, podsumowanie spotkania i statystyki gracza'
);

-- Odmowa domyślna dla przyszłych obiektów: Supabase nie nada praw nowym tabelom i funkcjom.
select is_empty(
  $$ select d.defaclobjtype::text || ' ' || a.grantee::regrole::text
       from pg_default_acl d
       cross join lateral aclexplode(d.defaclacl) a
      where d.defaclrole = 'postgres'::regrole
        and d.defaclnamespace = 'public'::regnamespace
        and a.grantee in ('anon'::regrole, 'authenticated'::regrole) $$,
  'domyślne prawa postgres w public nie obejmują anon i authenticated'
);

-- service_role (Edge Functions) zachowuje pełny dostęp i omija RLS.
select ok(
  has_table_privilege('service_role', 'public.profiles', 'insert, update, delete')
    and (select rolbypassrls from pg_roles where rolname = 'service_role'),
  'service_role ma pełny dostęp do profili i omija RLS'
);

-- ---------------------------------------------------------------------------------------------
-- Polityki RLS
-- ---------------------------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and not exists (
          select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('SELECT', 'ALL')
        ) $$,
  'każda tabela public ma politykę odczytu'
);
select is_empty(
  $$ select schemaname || '.' || tablename || ' ' || policyname from pg_policies
      where (schemaname = 'public' or (schemaname = 'storage' and policyname like 'bg\_club\_%'))
        and roles <> '{authenticated}' $$,
  'wszystkie polityki dotyczą tylko roli authenticated'
);
select is_empty(
  $$ select schemaname || '.' || tablename || ' ' || policyname from pg_policies
      where (schemaname = 'public' or (schemaname = 'storage' and policyname like 'bg\_club\_%'))
        and coalesce(qual, '') || coalesce(with_check, '') not like '%private.is\_%' $$,
  'każda polityka sprawdza aktywne konto, admina albo prowadzącego'
);
select results_eq(
  $$ select tablename::text collate "default", string_agg(cmd, ',' order by cmd)
       from pg_policies where schemaname = 'public'
      group by tablename order by tablename $$,
  $$ values
       ('achievement_unlocks', 'SELECT'),
       ('club', 'INSERT,SELECT,UPDATE'),
       ('game_votes', 'DELETE,INSERT,SELECT'),
       ('games', 'INSERT,SELECT,UPDATE'),
       ('meeting_games', 'SELECT'),
       ('meeting_participants', 'SELECT'),
       ('meetings', 'DELETE,SELECT'),
       ('play_results', 'SELECT'),
       ('plays', 'SELECT'),
       ('profiles', 'SELECT,UPDATE'),
       ('scorepad_versions', 'INSERT,SELECT'),
       ('scorepads', 'INSERT,SELECT,UPDATE') $$,
  'polityki według macierzy uprawnień (PRD §2.1, §6.1)'
);

-- ---------------------------------------------------------------------------------------------
-- SECURITY DEFINER: pusty search_path
-- ---------------------------------------------------------------------------------------------
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and p.prosecdef
        and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'każda funkcja SECURITY DEFINER ma pusty search_path'
);
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace = 'private'::regnamespace
        and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') $$,
  'każda funkcja w private ma ustawiony search_path'
);
select results_eq(
  $$ select proname::text collate "default" from pg_proc
      where pronamespace = 'private'::regnamespace and prosecdef order by 1 $$,
  $$ values ('is_active_member'), ('is_admin'), ('is_meeting_runner'), ('is_voting_open') $$,
  'tylko funkcje sprawdzające role są SECURITY DEFINER (omijają RLS bez rekurencji polityk)'
);

-- ---------------------------------------------------------------------------------------------
-- Storage: prywatne buckety z limitami (PRD §6, NFR-7)
-- ---------------------------------------------------------------------------------------------
select results_eq(
  $$ select id collate "default", public, file_size_limit, allowed_mime_types
       from storage.buckets where id in ('avatars', 'covers', 'scorepads', 'sheets') order by id $$,
  $$ values
       ('avatars', false, 1048576::bigint, array['image/webp', 'image/jpeg', 'image/png']),
       ('covers', false, 2097152::bigint, array['image/webp', 'image/jpeg', 'image/png']),
       ('scorepads', false, 5242880::bigint, array['image/webp', 'image/jpeg', 'image/png']),
       ('sheets', false, 2097152::bigint, array['image/webp', 'image/jpeg', 'image/png']) $$,
  'buckety avatars, covers, scorepads, sheets są prywatne i mają limity'
);
select results_eq(
  $$ select string_agg(policyname || ':' || cmd, ',' order by policyname) collate "default"
       from pg_policies where schemaname = 'storage' and policyname like 'bg\_club\_%' $$,
  $$ values ('bg_club_admin_assets_delete:DELETE,bg_club_admin_assets_insert:INSERT,'
             'bg_club_admin_assets_update:UPDATE,bg_club_avatars_delete_own:DELETE,'
             'bg_club_avatars_insert_own:INSERT,bg_club_avatars_update_own:UPDATE,'
             'bg_club_objects_select:SELECT,bg_club_sheets_delete_admin:DELETE,'
             'bg_club_sheets_delete_unused:DELETE,bg_club_sheets_insert_runner:INSERT') $$,
  'polityki Storage: odczyt aktywni, zapis według bucketu'
);

select * from finish();

rollback;
