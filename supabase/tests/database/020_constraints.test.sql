-- Ograniczenia: jeden klub, jeden admin, profile, gry, spotkania, głosy.
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

-- Odroczone ograniczenia sprawdzamy od razu po każdym poleceniu.
set constraints all immediate;

select plan(51);

-- ---------------------------------------------------------------------------------------------
-- Dane testowe
-- ---------------------------------------------------------------------------------------------
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Łąka i Pszczoły', 1, 5, '{8,5,3,1,0}');

-- ---------------------------------------------------------------------------------------------
-- club: jeden klub
-- ---------------------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw') $$,
  'można założyć klub'
);
select throws_like(
  $$ insert into public.club (name, timezone) values ('Drugi Klub', 'Europe/Warsaw') $$,
  '%club_pkey%',
  'drugiego klubu nie da się założyć'
);
select throws_like(
  $$ insert into public.club (id, name) values (2, 'Drugi Klub') $$,
  '%club_singleton%',
  'klub z innym id jest odrzucany'
);
select throws_like(
  $$ update public.club set timezone = 'Europa/Warszawa' $$,
  '%unknown time zone%',
  'nieznana strefa czasowa jest odrzucana'
);
select lives_ok(
  $$ update public.club set timezone = 'America/New_York', name = 'Klub Po Zmianie' $$,
  'admin może zmienić nazwę i strefę klubu'
);
select throws_like(
  $$ update public.club set name = '   ' $$,
  '%club_name_not_blank%',
  'nazwa klubu jest wymagana'
);

-- ---------------------------------------------------------------------------------------------
-- profiles: jeden admin, hook
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ insert into public.profiles (id, hook, first_name, last_name, role)
     values (gen_random_uuid(), 'ewa-druga-e005', 'Ewa', 'Druga', 'admin') $$,
  '%profiles_single_admin%',
  'drugiego admina nie da się utworzyć'
);
select throws_like(
  $$ update public.profiles set role = 'admin' where hook = 'bartek-testowy-b002' $$,
  '%profiles_single_admin%',
  'gracza nie da się awansować na drugiego admina'
);
select throws_like(
  $$ update public.profiles set deleted_at = now() where role = 'admin' $$,
  '%profiles_admin_not_deleted%',
  'admina nie da się usunąć'
);
select throws_like(
  $$ insert into public.profiles (id, hook, first_name, last_name)
     values (gen_random_uuid(), 'Jan-Kowalski', 'Jan', 'Kowalski') $$,
  '%profiles_hook_format%',
  'hook musi mieć format imie-nazwisko-xxxx'
);
select throws_like(
  $$ insert into public.profiles (id, hook, first_name, last_name)
     values (gen_random_uuid(), 'bartek-testowy-b002', 'Bartek', 'Testowy') $$,
  '%profiles_hook_key%',
  'hook jest unikalny'
);
select throws_like(
  $$ update public.profiles set hook = 'bartek-nowy-b002' where hook = 'bartek-testowy-b002' $$,
  '%hook is immutable%',
  'hook jest niezmienny'
);
select lives_ok(
  $$ update public.profiles set first_name = 'Bartłomiej', theme = 'dark' where hook = 'bartek-testowy-b002' $$,
  'zmiana imienia i motywu nie zmienia hooka'
);
select is(
  (select hook from public.profiles where first_name = 'Bartłomiej'),
  'bartek-testowy-b002',
  'hook został bez zmian po zmianie imienia'
);
select throws_like(
  $$ update public.profiles set theme = 'blue' where hook = 'bartek-testowy-b002' $$,
  '%profiles_theme_check%',
  'motyw: light, dark albo system'
);

-- ---------------------------------------------------------------------------------------------
-- games: zakres graczy i punktacja
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra', 0, 2, '{1,0}') $$,
  '%games_min_players_check%',
  'min. liczba graczy ≥ 1'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra', 3, 2, '{1,0}') $$,
  '%games_players_range%',
  'min ≤ max'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra', 2, 4, '{3,2,1}') $$,
  '%games_placement_points_check%',
  'punktacja musi mieć długość max_players'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra', 2, 2, '{3,-1}') $$,
  '%games_placement_points_check%',
  'punkty są ≥ 0'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra', 2, 2, '{3,null}') $$,
  '%games_placement_points_check%',
  'punktacja bez wartości NULL'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra', 2, 2, '{{3},{1}}') $$,
  '%games_placement_points_check%',
  'punktacja jest tablicą jednowymiarową'
);
select throws_like(
  $$ update public.games set max_players = 5 where title = 'Żółwie Wyścigi' $$,
  '%games_placement_points_check%',
  'zmiana max bez zmiany punktacji jest odrzucana'
);
select lives_ok(
  $$ insert into public.games (title, min_players, max_players, placement_points)
     values ('Wielki Stół', 2, 20, array_fill(1, array[20])) $$,
  'brak globalnego limitu 8 graczy: gra do 20 osób'
);
select lives_ok(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Odwrotna', 2, 3, '{0,5,9}') $$,
  'punktacja rosnąca jest dozwolona (tylko ostrzeżenie w formularzu)'
);
select lives_ok(
  $$ insert into public.games (title, min_players, max_players, placement_points, complexity)
     values ('Ułamkowa', 2, 3, '{20.5,11.25,2}', 2.75) $$,
  'punktacja i skomplikowanie z dwoma miejscami po przecinku'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Gra', 2, 2, '{3.125,1}') $$,
  '%games_placement_points_check%',
  'punkty mają najwyżej dwa miejsca po przecinku'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points, complexity) values ('Gra', 2, 2, '{3,1}', 5.5) $$,
  '%games_complexity_range%',
  'skomplikowanie gry 1…5'
);
select throws_like(
  $$ update public.games set complexity = null where title = 'Ułamkowa' $$,
  '%complexity is required%',
  'gra ze skomplikowaniem nie może go stracić'
);
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('  ', 2, 2, '{1,0}') $$,
  '%games_title_not_blank%',
  'tytuł gry jest wymagany'
);
select results_eq(
  $$ select title from public.games
      where title_search like '%' || public.search_text('ZOLW') || '%' $$,
  array['Żółwie Wyścigi'],
  'wyszukiwanie bez polskich znaków i wielkości liter'
);
select results_eq(
  $$ select title from public.games
      where title_search like '%' || public.search_text('łąka') || '%' $$,
  array['Łąka i Pszczoły'],
  'wyszukiwanie z polskimi znakami w zapytaniu'
);

-- ---------------------------------------------------------------------------------------------
-- meetings: jedno spotkanie w trakcie, prowadzący
-- ---------------------------------------------------------------------------------------------
insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie A', '2026-11-20 18:00+01', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie B', '2026-11-27 18:00+01', '00000000-0000-4000-a000-000000000001');

insert into public.meeting_participants (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000001');

select lives_ok(
  $$ update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
      where id = '00000000-0000-4000-c000-000000000001' $$,
  'spotkanie można rozpocząć'
);
select throws_like(
  $$ update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
      where id = '00000000-0000-4000-c000-000000000002' $$,
  '%meetings_single_in_progress%',
  'drugie spotkanie w trakcie jest odrzucane'
);
select throws_like(
  $$ update public.meetings set voting_open = true where id = '00000000-0000-4000-c000-000000000001' $$,
  '%meetings_voting_only_planned%',
  'głosowanie tylko w zaplanowanym spotkaniu'
);
select throws_like(
  $$ update public.meetings set status = 'finished' where id = '00000000-0000-4000-c000-000000000001' $$,
  '%meetings_status_timestamps%',
  'status zakończony wymaga finished_at'
);
select throws_like(
  $$ update public.meetings set status = 'planned', started_at = null, voting_open = true
      where id = '00000000-0000-4000-c000-000000000001' $$,
  '%cannot change from in_progress to planned%',
  'spotkanie w trakcie nie wraca do zaplanowanych'
);
select throws_like(
  $$ update public.meetings set status = 'finished', voting_open = false, started_at = now(), finished_at = now()
      where id = '00000000-0000-4000-c000-000000000002' $$,
  '%cannot change from planned to finished%',
  'zaplanowanego spotkania nie da się zakończyć bez rozpoczęcia'
);
select throws_like(
  $$ insert into public.meetings (title, starts_at, status, voting_open, started_at, created_by)
     values ('Od razu w trakcie', now(), 'in_progress', false, now(), '00000000-0000-4000-a000-000000000001') $$,
  '%created as planned%',
  'spotkanie powstaje jako zaplanowane'
);
select throws_like(
  $$ update public.meetings set host_id = '00000000-0000-4000-a000-000000000001'
      where id = '00000000-0000-4000-c000-000000000001' $$,
  '%must not be the admin%',
  'admin nie jest zapisywany jako prowadzący (NULL = admin)'
);
select throws_like(
  $$ update public.meetings set host_id = '00000000-0000-4000-a000-000000000004'
      where id = '00000000-0000-4000-c000-000000000001' $$,
  '%meetings_host_participant_fkey%',
  'prowadzący musi być uczestnikiem'
);
update public.meetings set host_id = '00000000-0000-4000-a000-000000000002'
 where id = '00000000-0000-4000-c000-000000000001';
delete from public.meeting_participants
 where meeting_id = '00000000-0000-4000-c000-000000000001' and profile_id = '00000000-0000-4000-a000-000000000002';
select is(
  (select host_id from public.meetings where id = '00000000-0000-4000-c000-000000000001'),
  null,
  'usunięcie prowadzącego z uczestników oddaje prowadzenie adminowi'
);

update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000004';
select throws_like(
  $$ insert into public.meeting_participants (meeting_id, profile_id)
     values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004') $$,
  '%deleted profile cannot join%',
  'usuniętego członka nie można dodać do spotkania'
);

-- ---------------------------------------------------------------------------------------------
-- game_votes i meeting_games
-- ---------------------------------------------------------------------------------------------
insert into public.meeting_participants (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000003');
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000003');

select throws_like(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003') $$,
  '%game_votes_pkey%',
  'jeden głos gracza na grę'
);
select throws_like(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002') $$,
  '%game_votes_meeting_id_profile_id_fkey%',
  'głosuje tylko uczestnik spotkania'
);
delete from public.meeting_participants
 where meeting_id = '00000000-0000-4000-c000-000000000002' and profile_id = '00000000-0000-4000-a000-000000000003';
select is(
  (select count(*)::int from public.game_votes where profile_id = '00000000-0000-4000-a000-000000000003'),
  0,
  'usunięcie uczestnika kasuje jego głosy'
);

update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000002';
select throws_like(
  $$ insert into public.meeting_games (meeting_id, game_id, position) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', 0) $$,
  '%is deleted%',
  'gry usuniętej z kolekcji nie da się opublikować'
);

-- usunięcie członka, który prowadzi zaplanowane spotkanie i ma w nim głosy.
insert into public.meeting_participants (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000003');
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');
update public.meetings set host_id = '00000000-0000-4000-a000-000000000003'
 where id = '00000000-0000-4000-c000-000000000002';
-- W spotkaniu w trakcie ten sam gracz jest uczestnikiem i prowadzącym.
update public.meetings set host_id = '00000000-0000-4000-a000-000000000003'
 where id = '00000000-0000-4000-c000-000000000001';
update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000003';

select is(
  (select count(*)::int from public.meeting_participants
    where meeting_id = '00000000-0000-4000-c000-000000000002' and profile_id = '00000000-0000-4000-a000-000000000003'),
  0,
  'usunięty członek znika z zaplanowanych spotkań'
);
select is(
  (select count(*)::int from public.game_votes where profile_id = '00000000-0000-4000-a000-000000000003'),
  0,
  'razem ze swoimi głosami'
);
select results_eq(
  $$ select host_id from public.meetings order by title $$,
  array[null::uuid, null::uuid],
  'prowadzenie zaplanowanego i trwającego spotkania wraca do admina'
);
select is(
  (select count(*)::int from public.meeting_participants
    where meeting_id = '00000000-0000-4000-c000-000000000001' and profile_id = '00000000-0000-4000-a000-000000000003'),
  1,
  'w spotkaniu w trakcie uczestnictwo usuniętego członka zostaje'
);

delete from public.meetings where id = '00000000-0000-4000-c000-000000000002';
select is(
  (select count(*)::int from public.meeting_participants where meeting_id = '00000000-0000-4000-c000-000000000002'),
  0,
  'usunięcie spotkania bez partii kasuje uczestników i głosy'
);

select * from finish();

rollback;
