-- [036] Przeliczanie osiągnięć w przebiegu klubu (PRD ACH-2, §5.10, §5.6.5, Q17, Q18): zapis
-- partii, ponowienie zapisu, zakończenie spotkania, usunięcie partii, zamknięcie, ponowne
-- otwarcie i usunięcie głosowania, uprawnienia. Warunki katalogu na wspólnych przypadkach
-- sprawdza generowany test 221_achievement_cases. Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- a001 Ada: admin; a002 Bartek, a003 Celina: gracze.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Kolejka', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}]}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';

-- Spotkania c001…c010 co tydzień, zaplanowane z otwartym głosowaniem; wszyscy uczestniczą.
insert into public.meetings (id, title, starts_at, created_by)
select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid, 'Spotkanie ' || n,
       '2026-09-01 18:00+02'::timestamptz + (n || ' weeks')::interval,
       '00000000-0000-4000-a000-000000000001'
  from generate_series(1, 10) n;
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p;

create function pg_temp.meeting(n int) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.play(n int) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid $$;

create function public.test_failure(statement text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  state text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate;
  return state;
end;
$$;
grant execute on function public.test_failure(text) to authenticated;

-- Partia f00N w spotkaniu c010: `winner` na 1. miejscu (wartość 5), `loser` na 2. (3).
create function public.test_play(n int, winner uuid, loser uuid)
returns void
language sql
set search_path = ''
as $$
  select public.start_play(('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid,
    '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-d000-000000000001', array[winner, loser]);
  select public.save_play(('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid,
    '00000000-0000-4000-e000-000000000001'::uuid,
    '{"game": 1, "names": ["A", "B"], "cells": {"a": [5, 3]}}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('profile_id', winner, 'seat', 1, 'place', 1, 'scores', '{"a": 5}'::jsonb, 'ranking_value', 5),
      jsonb_build_object('profile_id', loser, 'seat', 2, 'place', 2, 'scores', '{"a": 3}'::jsonb, 'ranking_value', 3)));
$$;
grant execute on function public.test_play(int, uuid, uuid) to authenticated;

-- Odblokowania gracza jako „osiągnięcie@spotkanie/partia” (numery z końcówek identyfikatorów).
create function public.test_unlocks(profile int)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(u.achievement_id || '@' || ltrim(right(u.meeting_id::text, 3), '0')
           || '/' || coalesce(ltrim(right(u.play_id::text, 3), '0'), '-') order by u.achievement_id), '{}')
    from public.achievement_unlocks u
   where u.profile_id = ('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid;
$$;
grant execute on function public.test_unlocks(int) to authenticated;

-- =============================================================================================
-- Uprawnienia: przeliczenie i migawka głosów są tylko dla bazy
-- =============================================================================================
select ok(
  not has_function_privilege('authenticated', 'private.recalculate_achievements()', 'execute')
    and not has_function_privilege('authenticated', 'private.computed_achievement_unlocks()', 'execute')
    and not has_function_privilege('authenticated', 'private.recalculate_after_plays_change(uuid)', 'execute'),
  'klient nie uruchomi przeliczenia osiągnięć');
select ok(
  not has_function_privilege('authenticated', 'public.plays_after_save()', 'execute')
    and not has_function_privilege('authenticated', 'public.meetings_after_change()', 'execute')
    and not has_function_privilege('authenticated', 'public.meetings_after_delete()', 'execute'),
  'funkcje wyzwalaczy nie są dostępne dla klienta');
select ok(
  not has_table_privilege('authenticated', 'private.meeting_voters', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'private.meeting_voters', 'select'),
  'migawka głosujących nie jest dostępna dla klienta');

-- =============================================================================================
-- Głosowanie (Q18): migawka przy zamknięciu, ponowne otwarcie liczy się raz
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
insert into public.game_votes (meeting_id, game_id, profile_id)
select pg_temp.meeting(n), g.id, '00000000-0000-4000-a000-000000000002'
  from generate_series(1, 10) n cross join public.games g;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
insert into public.game_votes (meeting_id, game_id, profile_id) values
  (pg_temp.meeting(1), '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');

reset role;
select is((select count(*) from private.meeting_voters), 0::bigint, 'głos nie zapisuje migawki ani nie przelicza (Q18)');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select public.publish_meeting_games(pg_temp.meeting(1), array['00000000-0000-4000-b000-000000000001']::uuid[]);
reset role;
select results_eq(
  $$ select right(profile_id::text, 1) from private.meeting_voters where meeting_id = pg_temp.meeting(1) order by 1 $$,
  $$ values ('2'), ('3') $$,
  'publikacja gier zapisuje głosujących (kilka głosów gracza liczy się raz)');

-- Ponowne otwarcie: Celina cofa głos, ponowna publikacja. Zaliczone głosowanie zostaje.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select public.reopen_voting(pg_temp.meeting(1));
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
delete from public.game_votes where meeting_id = pg_temp.meeting(1) and profile_id = '00000000-0000-4000-a000-000000000003';
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select public.publish_meeting_games(pg_temp.meeting(1), array['00000000-0000-4000-b000-000000000002']::uuid[]);
reset role;
select results_eq(
  $$ select right(profile_id::text, 1), count(*)::int from private.meeting_voters
      where meeting_id = pg_temp.meeting(1) group by profile_id order by 1 $$,
  $$ values ('2', 1), ('3', 1) $$,
  'ponowne otwarcie i zamknięcie: każdy gracz raz, głos z chwili pierwszego zamknięcia zostaje');

-- Spotkania c002…c009: publikacja; c010: rozpoczęcie zamyka głosowanie (RUN-1).
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select public.publish_meeting_games(pg_temp.meeting(n), array['00000000-0000-4000-b000-000000000001']::uuid[])
  from generate_series(2, 9) n;
select is(public.test_unlocks(2), '{}'::text[], '9 zamkniętych głosowań to jeszcze nie Głos ludu');
select public.start_meeting(pg_temp.meeting(10));
select is(public.test_unlocks(2), array['voter-10@10/-'],
  'rozpoczęcie spotkania zamyka 10. głosowanie: Głos ludu z datą tego spotkania, bez partii');
select is((select unlocked_at from public.achievement_unlocks where achievement_id = 'voter-10'),
  (select starts_at from public.meetings where id = pg_temp.meeting(10)), 'data odblokowania to termin spotkania');
select is(public.test_unlocks(3), '{}'::text[], 'Celina zagłosowała raz');

-- Zmiana terminu zaplanowanego spotkania z zamkniętym głosowaniem przesuwa datę Głosu ludu.
reset role;
update public.meetings set starts_at = starts_at + interval '10 weeks' where id = pg_temp.meeting(9);
select is(public.test_unlocks(2), array['voter-10@9/-'],
  'spotkanie 9 przeniesione za 10: dziesiątym głosowaniem jest teraz spotkanie 9');
update public.meetings set starts_at = starts_at - interval '10 weeks' where id = pg_temp.meeting(9);
select is(public.test_unlocks(2), array['voter-10@10/-'], 'powrót terminu przywraca datę');
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

-- =============================================================================================
-- Partie: zapis, ponowienie, zakończenie spotkania (c010 w trakcie)
-- =============================================================================================
select public.test_play(1, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003');
select is(public.test_unlocks(2), array['beginners-luck@10/1', 'meet-1@10/1', 'voter-10@10/-', 'win-1@10/1'],
  'zapis partii przelicza osiągnięcia zwycięzcy w tej samej transakcji');
select is(public.test_unlocks(3), array['meet-1@10/1'], 'przegrany: pierwsze spotkanie');
select public.test_play(2, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003');
select public.test_play(3, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003');
select is(public.test_unlocks(2),
  array['beginners-luck@10/1', 'hattrick@10/3', 'meet-1@10/1', 'voter-10@10/-', 'win-1@10/1'],
  'trzecia wygrana na spotkaniu: Hat-trick; Bez skazy dopiero po zakończeniu');

-- Ponowienie zapisu (np. po przekroczeniu czasu) zwraca partię i niczego nie zmienia.
select lives_ok(
  $$ select public.save_play(pg_temp.play(3), '00000000-0000-4000-e000-000000000001'::uuid,
       '{"game": 1, "names": ["A", "B"], "cells": {"a": [5, 3]}}'::jsonb,
       jsonb_build_array(
         jsonb_build_object('profile_id', '00000000-0000-4000-a000-000000000002', 'seat', 1, 'place', 1, 'scores', '{"a": 5}'::jsonb, 'ranking_value', 5),
         jsonb_build_object('profile_id', '00000000-0000-4000-a000-000000000003', 'seat', 2, 'place', 2, 'scores', '{"a": 3}'::jsonb, 'ranking_value', 3))) $$,
  'ponowienie zapisu partii');
select is(public.test_unlocks(2),
  array['beginners-luck@10/1', 'hattrick@10/3', 'meet-1@10/1', 'voter-10@10/-', 'win-1@10/1'],
  'ponowienie zapisu nie dubluje ani nie zmienia odblokowań');

select public.finish_meeting(pg_temp.meeting(10));
select is(public.test_unlocks(2),
  array['beginners-luck@10/1', 'flawless@10/3', 'hattrick@10/3', 'meet-1@10/1', 'voter-10@10/-', 'win-1@10/1'],
  'zakończenie spotkania: Bez skazy (3 partie, 3 wygrane)');

-- =============================================================================================
-- Usunięcie partii cofa niespełnione osiągnięcia (§5.6.5, Q17)
-- =============================================================================================
select public.delete_play(pg_temp.play(3));
select is(public.test_unlocks(2), array['beginners-luck@10/1', 'meet-1@10/1', 'voter-10@10/-', 'win-1@10/1'],
  'usunięcie trzeciej partii cofa Hat-trick i Bez skazy');
select public.delete_play(pg_temp.play(1));
select is(public.test_unlocks(2), array['beginners-luck@10/2', 'meet-1@10/2', 'voter-10@10/-', 'win-1@10/2'],
  'usunięcie pierwszej partii przenosi spełnione osiągnięcia na kolejną');

-- =============================================================================================
-- Ponowne przeliczenie naprawia stan i jest idempotentne
-- =============================================================================================
reset role;
update public.achievement_unlocks set unlocked_at = '2000-01-01 00:00+00' where achievement_id = 'win-1';
insert into public.achievement_unlocks (profile_id, achievement_id, unlocked_at, meeting_id)
values ('00000000-0000-4000-a000-000000000003', 'legend-x', now(), pg_temp.meeting(10));
create temporary table before_recalc as select * from public.achievement_unlocks where false;
select private.recalculate_achievements();
insert into before_recalc select * from public.achievement_unlocks;
select is(public.test_unlocks(3), array['meet-1@10/2'], 'przeliczenie usuwa osiągnięcie spoza historii');
select is((select unlocked_at from public.achievement_unlocks where achievement_id = 'win-1'),
  (select starts_at from public.meetings where id = pg_temp.meeting(10)), 'przeliczenie poprawia datę');
select private.recalculate_achievements();
select set_eq($$ select * from public.achievement_unlocks $$, $$ select * from before_recalc $$,
  'ponowne przeliczenie niczego nie zmienia');

-- =============================================================================================
-- Usunięcie spotkania (PLAN-3): jego głosowanie przestaje się liczyć
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
delete from public.meetings where id = pg_temp.meeting(5);
select is(public.test_unlocks(2), array['beginners-luck@10/2', 'meet-1@10/2', 'win-1@10/2'],
  'usunięcie zaplanowanego spotkania z zamkniętym głosowaniem cofa Głos ludu (9 głosowań)');
select is((select count(*) from public.achievement_unlocks), 4::bigint,
  'pozostałe odblokowania bez zmian');

select * from finish();

rollback;
