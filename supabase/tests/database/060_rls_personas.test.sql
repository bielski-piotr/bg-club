-- [004] RLS i Storage z perspektywy klienta (PRD §2.1, §6.1).
-- Każda sekcja przełącza się na rolę, z którą PostgREST i Storage API wykonują żądanie
-- (`anon` albo `authenticated` z tokenem w `request.jwt.claims`), i sprawdza odmowę dla
-- anonima, usuniętego konta, cudzych zasobów i braku roli oraz dozwolone działania.
-- Polityki Storage sprawdzamy bezpośrednio na storage.objects: Storage API wykonuje te same
-- zapytania w imieniu użytkownika. Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

set constraints all immediate;
-- Storage blokuje bezpośrednie DELETE na storage.objects; w teście sprawdzamy same polityki.
set local storage.allow_delete_query = 'true';

select plan(96);

-- ---------------------------------------------------------------------------------------------
-- Dane testowe (jako właściciel, bez RLS)
-- a001 Ada: admin; a002 Bartek, a003 Celina: gracze; a004 Dawid: prowadzący c001 (w trakcie)
-- i c003 (zakończone); a005 Ewa: usunięta, z wciąż ważnym tokenem; a006 Filip: bez spotkań.
-- ---------------------------------------------------------------------------------------------
insert into public.profiles (id, hook, first_name, last_name, role, deleted_at) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin', null),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player', null),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player', null),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player', null),
  ('00000000-0000-4000-a000-000000000005', 'ewa-usunieta-e005', 'Ewa', 'Usunięta', 'player', now()),
  ('00000000-0000-4000-a000-000000000006', 'filip-spozniony-f006', 'Filip', 'Spóźniony', 'player', null);
update public.profiles set avatar_path = '00000000-0000-4000-a000-000000000003/celina.webp'
 where id = '00000000-0000-4000-a000-000000000003';

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Łąka i Pszczoły', 2, 4, '{8,5,3,1}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', '{}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';

-- c001 w trakcie (prowadzi Dawid), c002 zaplanowane z otwartym głosowaniem, c003 zakończone
-- (prowadził Dawid), c004 zaplanowane z zamkniętym głosowaniem, c005 otwarte bez Bartka.
insert into public.meetings (id, title, starts_at, created_by, voting_open) values
  ('00000000-0000-4000-c000-000000000001', 'W trakcie', now(), '00000000-0000-4000-a000-000000000001', true),
  ('00000000-0000-4000-c000-000000000002', 'Zaplanowane', now() + interval '7 days', '00000000-0000-4000-a000-000000000001', true),
  ('00000000-0000-4000-c000-000000000003', 'Zakończone', now() - interval '7 days', '00000000-0000-4000-a000-000000000001', true),
  ('00000000-0000-4000-c000-000000000004', 'Głosowanie zamknięte', now() + interval '14 days', '00000000-0000-4000-a000-000000000001', false),
  ('00000000-0000-4000-c000-000000000005', 'Bez Bartka', now() + interval '21 days', '00000000-0000-4000-a000-000000000001', true);
insert into public.meeting_participants (meeting_id, profile_id)
select m, p::uuid
  from unnest(array['00000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000002',
                    '00000000-0000-4000-c000-000000000003']::uuid[]) m
 cross join unnest(array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
                         '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']) p;
insert into public.meeting_participants (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000003');
update public.meetings set host_id = '00000000-0000-4000-a000-000000000004'
 where id in ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000003');
update public.meetings set status = 'in_progress', voting_open = false, started_at = now() - interval '7 days'
 where id = '00000000-0000-4000-c000-000000000003';
update public.meetings set status = 'finished', finished_at = now() - interval '7 days'
 where id = '00000000-0000-4000-c000-000000000003';
update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
 where id = '00000000-0000-4000-c000-000000000001';

insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');

-- f001: szkic, f002: zapisana partia (Bartek 1., Celina 2.).
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by) values
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-e000-000000000001', '{}', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-e000-000000000001', '{}', '00000000-0000-4000-a000-000000000004');
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win) values
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002', 1, 1, false, 10, true),
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 2, 2, false, 6, false);
update public.plays set status = 'saved', sheet = '{}' where id = '00000000-0000-4000-f000-000000000002';

insert into storage.objects (bucket_id, name, owner_id) values
  ('avatars', '00000000-0000-4000-a000-000000000003/celina.webp', '00000000-0000-4000-a000-000000000003'),
  ('covers', 'games/00000000-0000-4000-b000-000000000001.webp', '00000000-0000-4000-a000-000000000001'),
  ('sheets', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000002.webp', '00000000-0000-4000-a000-000000000004');

-- =============================================================================================
-- Anonim (klucz anon bez sesji)
-- =============================================================================================
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select throws_ok($$ select * from public.profiles $$, '42501', 'permission denied for table profiles',
  'anonim: brak odczytu profili');
select throws_ok($$ select * from public.club $$, '42501', 'permission denied for table club',
  'anonim: brak odczytu klubu');
select throws_ok($$ select * from public.plays $$, '42501', 'permission denied for table plays',
  'anonim: brak odczytu partii');
select throws_ok(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('X', 1, 1, '{1}') $$,
  '42501', 'permission denied for table games', 'anonim: brak zapisu gier');
select throws_ok($$ select private.is_admin() $$, '42501', 'permission denied for schema private',
  'anonim: brak dostępu do funkcji sprawdzających role');
select throws_ok($$ select public.search_text('x') $$, '42501', 'permission denied for function search_text',
  'anonim: brak dostępu do funkcji public');
select is_empty($$ select name from storage.objects $$, 'anonim: nie widzi plików w Storage');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'x.webp') $$,
  '42501', null, 'anonim: nie wgra pliku do Storage');

reset role;

-- =============================================================================================
-- Usunięte konto z wciąż ważnym tokenem (AUTH-7, MEM-4)
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000005", "role": "authenticated"}';

select is_empty($$ select id from public.profiles $$, 'usunięte konto: nie widzi profili');
select is_empty($$ select id from public.club $$, 'usunięte konto: nie widzi klubu');
select is_empty($$ select id from public.games $$, 'usunięte konto: nie widzi gier');
select is_empty($$ select id from public.meetings $$, 'usunięte konto: nie widzi spotkań');
select is_empty($$ select id from public.plays $$, 'usunięte konto: nie widzi partii');
select is_empty($$ select play_id from public.play_results $$, 'usunięte konto: nie widzi wyników');
select is_empty($$ select name from storage.objects $$, 'usunięte konto: nie widzi plików w Storage');
select results_eq(
  $$ with u as (update public.profiles set first_name = 'Ewka'
                 where id = '00000000-0000-4000-a000-000000000005' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'usunięte konto: nie edytuje własnego profilu'
);
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000005') $$,
  '42501', null, 'usunięte konto: nie głosuje');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-a000-000000000005/ewa.webp') $$,
  '42501', null, 'usunięte konto: nie wgra awatara nawet do własnego folderu');
select is(private.is_active_member(), false, 'usunięte konto: is_active_member() = false');

reset role;

-- =============================================================================================
-- Gracz (Bartek): przegląda wszystko, głosuje, edytuje tylko własny profil
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select is((select count(*)::int from public.profiles), 6, 'gracz: widzi wszystkie profile, także usunięte (MEM-5)');
select is((select count(*)::int from public.meetings), 5, 'gracz: widzi wszystkie spotkania');
select is((select count(*)::int from public.plays), 2, 'gracz: widzi partie');
select is((select count(*)::int from storage.objects), 3, 'gracz: widzi pliki w prywatnych bucketach');
select is(private.is_admin(), false, 'gracz: is_admin() = false');
select is(private.is_meeting_runner('00000000-0000-4000-c000-000000000001'), false,
  'gracz: nie prowadzi cudzego spotkania');

-- Profil (USR-5, §6.1)
select lives_ok(
  $$ update public.profiles
        set first_name = 'Bartosz', last_name = 'Nowy', theme = 'dark',
            avatar_path = '00000000-0000-4000-a000-000000000002/bartek.webp'
      where id = '00000000-0000-4000-a000-000000000002' $$,
  'gracz: edytuje imię, nazwisko, motyw i awatar we własnym profilu'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-000000000002' $$,
  '42501', 'permission denied for table profiles', 'gracz: nie zmieni swojej roli');
select throws_ok(
  $$ update public.profiles set hook = 'inny-hook-0000' where id = '00000000-0000-4000-a000-000000000002' $$,
  '42501', 'permission denied for table profiles', 'gracz: nie zmieni hooka');
select throws_ok(
  $$ update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000002' $$,
  '42501', 'permission denied for table profiles', 'gracz: nie oznaczy się jako usunięty (tylko Edge Function)');
select throws_ok(
  $$ update public.profiles set avatar_path = '00000000-0000-4000-a000-000000000003/celina.webp'
      where id = '00000000-0000-4000-a000-000000000002' $$,
  '23514', null, 'gracz: nie wskaże cudzego pliku jako awatara');
select results_eq(
  $$ with u as (update public.profiles set first_name = 'Hacker'
                 where id = '00000000-0000-4000-a000-000000000003' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'gracz: nie edytuje cudzego profilu'
);
select throws_ok(
  $$ insert into public.profiles (id, hook, first_name, last_name)
     values (gen_random_uuid(), 'nowy-gracz-0001', 'Nowy', 'Gracz') $$,
  '42501', 'permission denied for table profiles', 'gracz: nie tworzy profili');
select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-4000-a000-000000000003' $$,
  '42501', 'permission denied for table profiles', 'gracz: nie usuwa profili');

-- Zasoby admina (GAME-3, PLAN-1, CLUB-2)
select throws_ok(
  $$ insert into public.club (name) values ('Klub Bartka') $$,
  '42501', null, 'gracz: nie zakłada klubu');
select throws_ok(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra Bartka', 2, 2, '{1,0}') $$,
  '42501', null, 'gracz: nie dodaje gier');
select results_eq(
  $$ with u as (update public.games set title = 'Zmieniona' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'gracz: nie edytuje gier'
);
select throws_ok(
  $$ insert into public.scorepads (game_id, name) values ('00000000-0000-4000-b000-000000000001', 'Notes Bartka') $$,
  '42501', null, 'gracz: nie dodaje notesów');
select throws_ok(
  $$ insert into public.meetings (title, starts_at) values ('Spotkanie Bartka', now()) $$,
  '42501', null, 'gracz: nie planuje spotkań');
select results_eq(
  $$ with u as (update public.meetings set title = 'Zmienione' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'gracz: nie edytuje spotkań'
);
select results_eq(
  $$ with d as (delete from public.meetings where id = '00000000-0000-4000-c000-000000000005' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'gracz: nie usuwa spotkań'
);
select throws_ok(
  $$ insert into public.meeting_participants (meeting_id, profile_id) values
     ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'gracz: nie dopisuje się do spotkania');
select throws_ok(
  $$ insert into public.meeting_games (meeting_id, game_id, position) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 0) $$,
  '42501', null, 'gracz: nie publikuje gier');
select throws_ok(
  $$ truncate public.games cascade $$,
  '42501', null, 'gracz: nie wykona TRUNCATE');

-- Głosowanie (VOTE-1, VOTE-2)
select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002') $$,
  'gracz: głosuje w spotkaniu, w którym jest uczestnikiem'
);
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000003') $$,
  '42501', null, 'gracz: nie głosuje za innego uczestnika');
select results_eq(
  $$ with d as (delete from public.game_votes where profile_id = '00000000-0000-4000-a000-000000000003' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'gracz: nie cofa cudzego głosu'
);
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'gracz: nie głosuje po zamknięciu głosowania');
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'gracz: nie głosuje w spotkaniu w trakcie');
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002') $$,
  '23503', null, 'gracz: nie głosuje w spotkaniu, w którym nie jest uczestnikiem');
select results_eq(
  $$ with d as (delete from public.game_votes where profile_id = '00000000-0000-4000-a000-000000000002' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'gracz: cofa własny głos przy otwartym głosowaniu'
);

-- Partie, wyniki, osiągnięcia: tylko RPC, usuwanie admin (§6.1)
select throws_ok(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
      '00000000-0000-4000-e000-000000000001', '{}', '00000000-0000-4000-a000-000000000002') $$,
  '42501', 'permission denied for table plays', 'gracz: nie tworzy partii bezpośrednio');
select throws_ok(
  $$ update public.plays set sheet = '{}' where id = '00000000-0000-4000-f000-000000000001' $$,
  '42501', 'permission denied for table plays', 'gracz: nie zmienia partii bezpośrednio');
select results_eq(
  $$ with d as (delete from public.plays returning 1) select count(*)::int from d $$,
  $$ values (0) $$,
  'gracz: nie usuwa partii ani szkiców'
);
select throws_ok(
  $$ update public.play_results set points = 100 where profile_id = '00000000-0000-4000-a000-000000000002' $$,
  '42501', 'permission denied for table play_results', 'gracz: nie zmienia wyników');
select throws_ok(
  $$ insert into public.achievement_unlocks (profile_id, achievement_id, unlocked_at, meeting_id) values
     ('00000000-0000-4000-a000-000000000002', 'win-1', now(), '00000000-0000-4000-c000-000000000001') $$,
  '42501', 'permission denied for table achievement_unlocks', 'gracz: nie przyznaje sobie osiągnięć');

-- Storage
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('avatars', '00000000-0000-4000-a000-000000000002/bartek.webp', '00000000-0000-4000-a000-000000000002') $$,
  'gracz: wgrywa awatar do własnego folderu'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-a000-000000000003/podmiana.webp') $$,
  '42501', null, 'gracz: nie wgra pliku do cudzego folderu awatarów');
select results_eq(
  $$ with u as (update storage.objects set metadata = '{}' where name like '00000000-0000-4000-a000-000000000003/%' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'gracz: nie nadpisze cudzego awatara'
);
select results_eq(
  $$ with d as (delete from storage.objects where bucket_id in ('avatars', 'covers', 'sheets')
                   and name not like '00000000-0000-4000-a000-000000000002/%' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'gracz: nie usuwa cudzych plików, okładek ani karteczek'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'games/nowa.webp') $$,
  '42501', null, 'gracz: nie wgrywa okładek');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('scorepads', 'notes.webp') $$,
  '42501', null, 'gracz: nie wgrywa zdjęć notesów');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sheets', '00000000-0000-4000-c000-000000000001/karteczka.webp') $$,
  '42501', null, 'gracz: nie wgrywa karteczek');

reset role;

-- =============================================================================================
-- Prowadzący (Dawid): prowadzi tylko swoje niezakończone spotkanie
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000004", "role": "authenticated"}';

select is(private.is_meeting_runner('00000000-0000-4000-c000-000000000001'), true,
  'prowadzący: prowadzi swoje spotkanie w trakcie');
select is(private.is_meeting_runner('00000000-0000-4000-c000-000000000002'), false,
  'prowadzący: nie prowadzi cudzego spotkania');
select is(private.is_meeting_runner('00000000-0000-4000-c000-000000000003'), false,
  'prowadzący: po zakończeniu spotkania traci uprawnienia');
select is(private.is_meeting_runner(null), false, 'is_meeting_runner(NULL) = false');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('sheets', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001.webp',
      '00000000-0000-4000-a000-000000000004') $$,
  'prowadzący: wgrywa karteczkę do swojego spotkania'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sheets', '00000000-0000-4000-c000-000000000002/karteczka.webp') $$,
  '42501', null, 'prowadzący: nie wgrywa karteczek do cudzego spotkania');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('sheets', '00000000-0000-4000-c000-000000000003/karteczka.webp') $$,
  '42501', null, 'prowadzący: nie wgrywa karteczek do zakończonego spotkania');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('sheets', 'to-nie-uuid/karteczka.webp') $$,
  '42501', null, 'prowadzący: zła ścieżka karteczki daje odmowę, nie błąd rzutowania');
select results_eq(
  $$ with u as (update storage.objects set metadata = '{}' where bucket_id = 'sheets' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'prowadzący: nie nadpisuje karteczek'
);
select results_eq(
  $$ with u as (update public.meetings set title = 'Zmienione przez prowadzącego'
                 where id = '00000000-0000-4000-c000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'prowadzący: nie edytuje spotkania (Q14)'
);
select throws_ok(
  $$ insert into public.meeting_participants (meeting_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000006') $$,
  '42501', null, 'prowadzący: nie dodaje uczestników (PLAN-4)');
select results_eq(
  $$ with d as (delete from public.plays where id = '00000000-0000-4000-f000-000000000002' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'prowadzący: nie usuwa zapisanej partii'
);
select results_eq(
  $$ with d as (delete from public.plays where id = '00000000-0000-4000-f000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'prowadzący: porzuca szkic w swoim spotkaniu (RUN-4)'
);
select throws_ok(
  $$ select private.require_meeting_runner('00000000-0000-4000-c000-000000000001') $$,
  '42501', 'permission denied for function require_meeting_runner',
  'klient nie wywołuje strażników RPC bezpośrednio'
);

reset role;

-- Strażnicy RPC: wywołanie jak z funkcji SECURITY DEFINER (rola właściciela, token klienta).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000004", "role": "authenticated"}';
select lives_ok(
  $$ select private.require_meeting_runner('00000000-0000-4000-c000-000000000001') $$,
  'require_meeting_runner: prowadzący przechodzi w swoim spotkaniu'
);
select throws_ok(
  $$ select private.require_meeting_runner('00000000-0000-4000-c000-000000000002') $$,
  '42501', 'administrator or host of meeting 00000000-0000-4000-c000-000000000002 required',
  'require_meeting_runner: odmowa w cudzym spotkaniu'
);
select throws_ok($$ select private.require_admin() $$, '42501', 'administrator required',
  'require_admin: odmowa dla prowadzącego');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000005", "role": "authenticated"}';
select throws_ok($$ select private.require_active_member() $$, '42501', 'active member account required',
  'require_active_member: odmowa dla usuniętego konta');
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok($$ select private.require_active_member() $$, '42501', 'active member account required',
  'require_active_member: odmowa bez sesji');

-- =============================================================================================
-- Admin (Ada): CRUD gier, notesów, spotkań; nie edytuje cudzych kont (USR-7)
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select is(private.is_admin(), true, 'admin: is_admin() = true');
select is(private.is_meeting_runner('00000000-0000-4000-c000-000000000003'), true,
  'admin: prowadzi każde spotkanie, także zakończone (RUN-5)');
select lives_ok(
  $$ insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw') $$,
  'admin: zakłada klub'
);
select lives_ok(
  $$ insert into public.games (id, title, min_players, max_players, placement_points) values
     ('00000000-0000-4000-b000-000000000009', 'Nowa Gra', 2, 3, '{5,3,1}') $$,
  'admin: dodaje grę'
);
select lives_ok(
  $$ update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000009' $$,
  'admin: usuwa grę miękko'
);
select lives_ok(
  $$ insert into public.meetings (id, title, starts_at) values
     ('00000000-0000-4000-c000-000000000009', 'Nowe spotkanie', now() + interval '30 days') $$,
  'admin: planuje spotkanie'
);
select is(
  (select created_by from public.meetings where id = '00000000-0000-4000-c000-000000000009'),
  '00000000-0000-4000-a000-000000000001'::uuid,
  'admin: autor spotkania pochodzi z tokenu'
);
select throws_ok(
  $$ insert into public.meetings (title, starts_at, created_by) values
     ('Podszyte', now(), '00000000-0000-4000-a000-000000000002') $$,
  '42501', 'permission denied for table meetings', 'admin: nie poda cudzego autora spotkania');
select throws_ok(
  $$ update public.meetings set status = 'finished', finished_at = now()
      where id = '00000000-0000-4000-c000-000000000001' $$,
  '42501', 'permission denied for table meetings', 'admin: status spotkania zmienia tylko RPC');
select lives_ok(
  $$ insert into public.meeting_games (meeting_id, game_id, position) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 0) $$,
  'admin: publikuje grę'
);
select results_eq(
  $$ with u as (update public.profiles set first_name = 'Zmieniona przez admina'
                 where id = '00000000-0000-4000-a000-000000000003' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'admin: nie edytuje cudzego profilu (USR-7)'
);
select throws_ok(
  $$ update public.profiles set role = 'player' where id = '00000000-0000-4000-a000-000000000001' $$,
  '42501', 'permission denied for table profiles', 'admin: nie zmienia ról przez API');
select results_eq(
  $$ with d as (delete from public.plays where id = '00000000-0000-4000-f000-000000000002' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'admin: usuwa zapisaną partię (VIEW-6)'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
     ('covers', 'games/00000000-0000-4000-b000-000000000009.webp', '00000000-0000-4000-a000-000000000001') $$,
  'admin: wgrywa okładkę'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-a000-000000000003/admin.webp') $$,
  '42501', null, 'admin: nie podmienia cudzego awatara (USR-7)');

reset role;

select * from finish();

rollback;
