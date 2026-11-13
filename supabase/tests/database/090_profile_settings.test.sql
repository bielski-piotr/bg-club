-- [010] Profil i ustawienia (PRD USR-3, USR-5, USR-7, USR-8, AUTH-6): propozycja zmiany
-- wygenerowanego hasła, motyw w profilu, edycja wyłącznie własnego profilu (także dla admina)
-- i zdjęcie profilowe we własnym folderze. Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

set constraints all immediate;
set local storage.allow_delete_query = 'true';

select plan(21);

-- ---------------------------------------------------------------------------------------------
-- Propozycja zmiany hasła przy tworzeniu konta (AUTH-6)
-- ---------------------------------------------------------------------------------------------
select col_not_null('public', 'profiles', 'password_change_suggested', 'flaga propozycji hasła jest wymagana');
select col_default_is('public', 'profiles', 'password_change_suggested', 'false', 'domyślnie bez propozycji (wiersz spoza wyzwalacza)');

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001@users.bgclub.invalid',
   '{"bg_club": {"first_name": "Ada", "last_name": "Adminowska", "role": "admin", "password_generated": false}}'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002@users.bgclub.invalid',
   '{"bg_club": {"first_name": "Bartek", "last_name": "Testowy", "role": "player", "password_generated": true}}'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003@users.bgclub.invalid',
   '{"bg_club": {"first_name": "Celina", "last_name": "Przykładowa"}}');

select results_eq(
  $$ select hook, password_change_suggested from public.profiles order by hook $$,
  $$ values ('ada-adminowska-a001'::text, false),
            ('bartek-testowy-b002'::text, true),
            ('celina-przykladowa-c003'::text, true) $$,
  'własne hasło z bootstrapu: bez propozycji; hasło wygenerowane (także bez flagi): z propozycją'
);

insert into storage.objects (bucket_id, name, owner_id) values
  ('avatars', '00000000-0000-4000-a000-000000000003/avatar-celina.webp', '00000000-0000-4000-a000-000000000003');
update public.profiles set avatar_path = '00000000-0000-4000-a000-000000000003/avatar-celina.webp'
 where id = '00000000-0000-4000-a000-000000000003';

-- ---------------------------------------------------------------------------------------------
-- Gracz: własny profil (USR-5, USR-8)
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select results_eq(
  $$ with u as (update public.profiles
                   set first_name = 'Bartłomiej', last_name = 'Nowy', theme = 'dark',
                       password_change_suggested = false
                 where id = '00000000-0000-4000-a000-000000000002'
             returning first_name, last_name, theme, password_change_suggested, hook)
     select * from u $$,
  $$ values ('Bartłomiej'::text, 'Nowy'::text, 'dark'::text, false, 'bartek-testowy-b002'::text) $$,
  'gracz: zmienia imię, nazwisko, motyw i pomija propozycję hasła; hook bez zmian (USR-1)'
);
select throws_ok(
  $$ update public.profiles set theme = 'sepia' where id = '00000000-0000-4000-a000-000000000002' $$,
  '23514', null, 'gracz: motyw tylko jasny, ciemny albo systemowy');
select throws_ok(
  $$ update public.profiles set first_name = '   ' where id = '00000000-0000-4000-a000-000000000002' $$,
  '23514', null, 'gracz: imię nie może być puste');
select throws_ok(
  $$ update public.profiles set last_name = repeat('x', 51) where id = '00000000-0000-4000-a000-000000000002' $$,
  '23514', null, 'gracz: nazwisko najwyżej 50 znaków');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('avatars', '00000000-0000-4000-a000-000000000002/avatar-1.webp', '00000000-0000-4000-a000-000000000002') $$,
  'gracz: wgrywa zdjęcie do własnego folderu (USR-3)');
select lives_ok(
  $$ update public.profiles set avatar_path = '00000000-0000-4000-a000-000000000002/avatar-1.webp'
      where id = '00000000-0000-4000-a000-000000000002' $$,
  'gracz: ustawia własne zdjęcie');
select throws_ok(
  $$ update public.profiles set avatar_path = '00000000-0000-4000-a000-000000000003/avatar-celina.webp'
      where id = '00000000-0000-4000-a000-000000000002' $$,
  '23514', null, 'gracz: nie wskaże zdjęcia z cudzego folderu');
select lives_ok(
  $$ update public.profiles set avatar_path = null where id = '00000000-0000-4000-a000-000000000002' $$,
  'gracz: wraca do monogramu (USR-3)');
select results_eq(
  $$ with d as (delete from storage.objects
                 where bucket_id = 'avatars' and name = '00000000-0000-4000-a000-000000000002/avatar-1.webp'
             returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'gracz: usuwa własny stary plik zdjęcia');
select results_eq(
  $$ with u as (update public.profiles set password_change_suggested = false, theme = 'light'
                 where id = '00000000-0000-4000-a000-000000000003' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'gracz: nie zmienia motywu ani flagi hasła innego gracza');
select results_eq(
  $$ with d as (delete from storage.objects where bucket_id = 'avatars'
                 and name like '00000000-0000-4000-a000-000000000003/%' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'gracz: nie usuwa cudzego zdjęcia');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Administrator nie edytuje cudzych kont (USR-7)
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select results_eq(
  $$ with u as (update public.profiles
                   set first_name = 'Zmieniona', theme = 'dark', avatar_path = null,
                       password_change_suggested = false
                 where id = '00000000-0000-4000-a000-000000000003' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'admin: nie zmienia imienia, motywu, zdjęcia ani flagi hasła gracza');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('avatars', '00000000-0000-4000-a000-000000000003/avatar-admin.webp', '00000000-0000-4000-a000-000000000001') $$,
  '42501', null, 'admin: nie wgrywa zdjęcia do folderu gracza');
select results_eq(
  $$ with d as (delete from storage.objects where bucket_id = 'avatars'
                 and name like '00000000-0000-4000-a000-000000000003/%' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'admin: nie usuwa zdjęcia gracza');
select lives_ok(
  $$ update public.profiles set theme = 'light' where id = '00000000-0000-4000-a000-000000000001' $$,
  'admin: zmienia własny motyw');
reset role;

select results_eq(
  $$ select first_name, theme, avatar_path, password_change_suggested
       from public.profiles where id = '00000000-0000-4000-a000-000000000003' $$,
  $$ values ('Celina'::text, 'system'::text,
             '00000000-0000-4000-a000-000000000003/avatar-celina.webp'::text, true) $$,
  'profil gracza bez zmian po próbach innych osób');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'avatars' and name like '00000000-0000-4000-a000-000000000003/%'),
  1,
  'zdjęcie gracza zostaje w Storage');

-- ---------------------------------------------------------------------------------------------
-- Usunięte konto nie zmienia ustawień
-- ---------------------------------------------------------------------------------------------
update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000002';
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select results_eq(
  $$ with u as (update public.profiles set theme = 'system'
                 where id = '00000000-0000-4000-a000-000000000002' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'usunięte konto: nie zmienia motywu');
reset role;

select * from finish();

rollback;
