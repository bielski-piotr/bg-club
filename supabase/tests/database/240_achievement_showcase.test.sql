-- Gablota osiągnięć i osiągnięcia spotkania:
-- `player_achievements` (odblokowania ze spotkaniem i liczniki postępu) i `meeting_achievements`
-- (kolejność partii, odświeżenie po usunięciu partii), uprawnienia. Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- a001 Ada: admin; a002 Bartek, a003 Celina: gracze; a004 Dawid: usunięty członek.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-usuniety-d004', 'Dawid', 'Usunięty', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Kolejka', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}]}', 4),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000002',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}]}', 4);
update public.scorepads set current_version_id = ('00000000-0000-4000-e000-00000000000' || right(id::text, 1))::uuid;

-- Spotkania c001…c003 co tydzień; wszyscy uczestniczą.
insert into public.meetings (id, title, starts_at, created_by)
select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid, 'Spotkanie ' || n,
       '2026-09-01 18:00+02'::timestamptz + (n || ' weeks')::interval,
       '00000000-0000-4000-a000-000000000001'
  from generate_series(1, 3) n;
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p;

create function pg_temp.meeting(n int) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.play(n int) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.player(n int) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid $$;

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
grant execute on function public.test_failure(text) to authenticated, anon;

-- Partia f00N gry `game` w spotkaniu `meeting`: `winner` na 1. miejscu, `loser` na 2.
create function public.test_play(n int, meeting int, game int, winner uuid, loser uuid)
returns void
language sql
set search_path = ''
as $$
  select public.start_play(('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid,
    ('00000000-0000-4000-c000-' || lpad(meeting::text, 12, '0'))::uuid,
    ('00000000-0000-4000-d000-' || lpad(game::text, 12, '0'))::uuid, array[winner, loser]);
  select public.save_play(('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid,
    ('00000000-0000-4000-e000-' || lpad(game::text, 12, '0'))::uuid,
    jsonb_build_object('game', game, 'names', '["A", "B"]'::jsonb, 'cells', '{"a": [5, 3]}'::jsonb),
    jsonb_build_array(
      jsonb_build_object('profile_id', winner, 'seat', 1, 'place', 1, 'scores', '{"a": 5}'::jsonb, 'ranking_value', 5),
      jsonb_build_object('profile_id', loser, 'seat', 2, 'place', 2, 'scores', '{"a": 3}'::jsonb, 'ranking_value', 3)));
$$;
grant execute on function public.test_play(int, int, int, uuid, uuid) to authenticated;

-- Osiągnięcia spotkania jako „gracz:osiągnięcie/partia” (numery z końcówek identyfikatorów).
create function public.test_meeting(n int)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(right(a.profile_id::text, 1) || ':' || a.achievement_id || '/'
           || coalesce(ltrim(right(a.play_id::text, 3), '0'), '-')), '{}')
    from public.meeting_achievements(('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid) a;
$$;
grant execute on function public.test_meeting(int) to authenticated;

-- =============================================================================================
-- Uprawnienia
-- =============================================================================================
select ok(
  not has_function_privilege('anon', 'public.player_achievements(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.meeting_achievements(uuid)', 'execute'),
  'anon nie czyta gabloty ani osiągnięć spotkania');

-- Bartek głosuje na spotkaniach 1 i 2 (publikacja zamyka głosowanie).
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
insert into public.game_votes (meeting_id, game_id, profile_id)
select pg_temp.meeting(n), '00000000-0000-4000-b000-000000000001', pg_temp.player(2)
  from generate_series(1, 2) n;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select public.publish_meeting_games(pg_temp.meeting(n), array['00000000-0000-4000-b000-000000000001']::uuid[])
  from generate_series(1, 2) n;

-- =============================================================================================
-- Gablota bez partii: brak odblokowań, liczniki zerowe poza głosami
-- =============================================================================================
select is(public.player_achievements(pg_temp.player(3)),
  '{"unlocks": [], "progress": {"meetings": 0, "plays": 0, "wins": 0, "points": 0, "streak": 0, "games": 0, "won_games": 0, "game_wins": 0, "last_places": 0, "votes": 0}}'::jsonb,
  'gracz bez partii: pusta gablota i zerowy postęp');
select is(public.player_achievements('00000000-0000-4000-a000-000000000099'), null,
  'nieznany profil: NULL');

-- =============================================================================================
-- Spotkanie 1: Bartek wygrywa dwie partie, Celina trzecią (inna gra); spotkanie 2: Celina.
-- =============================================================================================
select public.start_meeting(pg_temp.meeting(1));
select public.test_play(1, 1, 1, pg_temp.player(2), pg_temp.player(3));
select public.test_play(2, 1, 1, pg_temp.player(2), pg_temp.player(3));
select public.test_play(3, 1, 2, pg_temp.player(3), pg_temp.player(2));
select public.finish_meeting(pg_temp.meeting(1));
select public.start_meeting(pg_temp.meeting(2));
select public.test_play(4, 2, 1, pg_temp.player(3), pg_temp.player(2));

select is(public.player_achievements(pg_temp.player(2)) -> 'progress',
  jsonb_build_object('meetings', 2, 'plays', 4, 'wins', 2,
    'points', (select sum(points) from public.play_results where profile_id = pg_temp.player(2)),
    'streak', 0, 'games', 2, 'won_games', 1, 'game_wins', 2, 'last_places', 2, 'votes', 2),
  'postęp Bartka z całej historii: spotkania, partie, wygrane, punkty, seria, gry, ostatnie miejsca, głosy');
select is((public.player_achievements(pg_temp.player(3)) -> 'progress') - 'points',
  '{"meetings": 2, "plays": 4, "wins": 2, "streak": 2, "games": 2, "won_games": 2, "game_wins": 1, "last_places": 2, "votes": 0}'::jsonb,
  'postęp Celiny: bieżąca seria 2 i dwie różne wygrane gry');

select is(
  (select array_agg(u ->> 'achievement_id' order by u ->> 'achievement_id')
     from jsonb_array_elements(public.player_achievements(pg_temp.player(2)) -> 'unlocks') u),
  (select array_agg(achievement_id order by achievement_id) from public.achievement_unlocks
    where profile_id = pg_temp.player(2)),
  'gablota pokazuje dokładnie odblokowania z przeliczenia');
select is(
  (select u from jsonb_array_elements(public.player_achievements(pg_temp.player(2)) -> 'unlocks') u
    where u ->> 'achievement_id' = 'win-1'),
  jsonb_build_object('achievement_id', 'win-1',
    'unlocked_at', (select to_jsonb(starts_at) from public.meetings where id = pg_temp.meeting(1)),
    'meeting_id', pg_temp.meeting(1), 'meeting_title', 'Spotkanie 1', 'play_id', pg_temp.play(1)),
  'odblokowanie ma datę i tytuł spotkania oraz partię');

-- =============================================================================================
-- Osiągnięcia spotkania: kolejność partii
-- =============================================================================================
select is(public.test_meeting(1),
  array['2:beginners-luck/1', '2:meet-1/1', '2:win-1/1', '3:meet-1/1', '3:beginners-luck/3', '3:win-1/3'],
  'spotkanie 1: odblokowania w kolejności partii, potem gracza i osiągnięcia');
select is(public.test_meeting(2), '{}'::text[], 'spotkanie 2 nic nowego nie odblokowało');
select is(public.test_meeting(3), '{}'::text[], 'spotkanie bez partii: pusta lista');

-- =============================================================================================
-- Usunięcie partii odświeża gablotę i listę spotkania
-- =============================================================================================
select public.delete_play(pg_temp.play(1));
select is(public.test_meeting(1),
  array['2:beginners-luck/2', '2:meet-1/2', '2:win-1/2', '3:meet-1/2', '3:beginners-luck/3', '3:win-1/3'],
  'po usunięciu partii 1 odblokowania przechodzą na partię 2');
select is((public.player_achievements(pg_temp.player(2)) -> 'progress' ->> 'game_wins')::int, 1,
  'postęp po usunięciu partii jest liczony od nowa');
select public.delete_play(pg_temp.play(2));
select is(public.test_meeting(1), array['2:meet-1/3', '3:beginners-luck/3', '3:meet-1/3', '3:win-1/3'],
  'po usunięciu obu wygranych Bartka znikają jego nieaktualne odznaki');

-- =============================================================================================
-- Usunięty członek ma gablotę tylko do odczytu i sam jej nie odczyta
-- =============================================================================================
reset role;
update public.profiles set deleted_at = now() where id = pg_temp.player(3);
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select is(jsonb_array_length(public.player_achievements(pg_temp.player(3)) -> 'unlocks'), 3,
  'usunięty członek zachowuje odblokowania');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(public.test_failure($$ select public.player_achievements('00000000-0000-4000-a000-000000000002') $$),
  '42501', 'usunięte konto nie odczyta gabloty');
select is(public.test_meeting(1), '{}'::text[], 'usunięte konto nie odczyta osiągnięć spotkania (RLS)');

select * from finish();

rollback;
