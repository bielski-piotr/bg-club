-- Dostępność gry (migracja 20261127000000). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-bartkowski-a002', 'Bartek', 'Bartkowski', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-celinska-a003', 'Celina', 'Celińska', 'player');

insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Trwa', '2026-11-20 18:00+01', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Plan', '2026-12-20 18:00+01', '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.profiles p cross join public.meetings m;
update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
 where id = '00000000-0000-4000-c000-000000000001';

insert into public.games (id, title, min_players, max_players, placement_points, complexity) values
  ('00000000-0000-4000-b000-000000000001', 'Podstawka', 2, 4, '{4,3,2,1}', 2),
  ('00000000-0000-4000-b000-000000000002', 'Inna gra', 2, 4, '{4,3,2,1}', 2);
insert into public.games (id, title, min_players, max_players, placement_points, complexity, base_game_id) values
  ('00000000-0000-4000-b000-000000000011', 'Dodatek A', 2, 4, '{4,3,2,1}', 2, '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-b000-000000000012', 'Dodatek B', 2, 4, '{4,3,2,1}', 2, '00000000-0000-4000-b000-000000000001');

insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Podstawka');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001'
 where id = '00000000-0000-4000-d000-000000000001';

-- Głos oddany, zanim gra stała się niedostępna.
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');

select is(
  (select bool_and(available) from public.games),
  true,
  'gry i dodatki są domyślnie dostępne'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

-- Dodatek B wyłączony osobno, potem cała gra.
update public.games set available = false where id = '00000000-0000-4000-b000-000000000012';
select is(
  (select available from public.games where id = '00000000-0000-4000-b000-000000000001'),
  true,
  'wyłączenie dodatku nie zmienia gry podstawowej'
);
update public.games set available = false where id = '00000000-0000-4000-b000-000000000001';
select results_eq(
  $$ select title, available from public.game_collection order by title $$,
  $$ values ('Dodatek A', false), ('Dodatek B', false), ('Inna gra', true), ('Podstawka', false) $$,
  'wyłączenie gry wyłącza wszystkie jej dodatki'
);
select results_eq(
  $$ select title, available from public.search_games(null) $$,
  $$ values ('Inna gra', true), ('Podstawka', false) $$,
  'niedostępna gra zostaje w kolekcji i wyszukiwaniu'
);

insert into public.games (id, title, min_players, max_players, placement_points, complexity, base_game_id) values
  ('00000000-0000-4000-b000-000000000013', 'Dodatek C', 2, 4, '{4,3,2,1}', 2, '00000000-0000-4000-b000-000000000001');
select is(
  (select available from public.games where id = '00000000-0000-4000-b000-000000000013'),
  false,
  'nowy dodatek niedostępnej gry jest niedostępny'
);

update public.games set available = true where id = '00000000-0000-4000-b000-000000000001';
select results_eq(
  $$ select title, available from public.game_collection
      where base_game_id = '00000000-0000-4000-b000-000000000001' order by title $$,
  $$ values ('Dodatek A', false), ('Dodatek B', false), ('Dodatek C', false) $$,
  'włączenie gry nie włącza dodatków'
);
update public.games set available = true where id = '00000000-0000-4000-b000-000000000011';
select is(
  (select available from public.games where id = '00000000-0000-4000-b000-000000000011'),
  true,
  'dodatek można włączyć osobno'
);
update public.games set available = false where id = '00000000-0000-4000-b000-000000000001';
update public.games set available = true where id = '00000000-0000-4000-b000-000000000011';

-- Głosowanie i publikacja.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select throws_like(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id)
     values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-a000-000000000002') $$,
  '%is unavailable%',
  'na niedostępną grę nie da się głosować'
);
select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id)
     values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002',
             '00000000-0000-4000-a000-000000000002') $$,
  'na dostępną grę można głosować'
);

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select lives_ok(
  $$ delete from public.game_votes
      where meeting_id = '00000000-0000-4000-c000-000000000002'
        and game_id = '00000000-0000-4000-b000-000000000001'
        and profile_id = '00000000-0000-4000-a000-000000000003' $$,
  'głos na grę, która stała się niedostępna, można cofnąć'
);
select is(
  (select count(*)::int from public.game_votes where game_id = '00000000-0000-4000-b000-000000000001'),
  0,
  'cofnięty głos zniknął'
);

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select throws_like(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000002',
       array['00000000-0000-4000-b000-000000000001']::uuid[]) $$,
  '%is unavailable%',
  'niedostępnej gry nie da się opublikować'
);

-- Partia.
select throws_like(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]) $$,
  '%is unavailable%',
  'partii niedostępnej gry nie da się rozpocząć'
);

update public.games set available = true where id = '00000000-0000-4000-b000-000000000001';
select throws_like(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[],
       null, array['00000000-0000-4000-b000-000000000012']::uuid[]) $$,
  '%active expansions of game%',
  'niedostępnego dodatku nie da się zaznaczyć w partii'
);
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[],
       null, array['00000000-0000-4000-b000-000000000011']::uuid[]) $$,
  'partia dostępnej gry z dostępnym dodatkiem'
);

-- Gracz nie zmienia dostępności (RLS administratora).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
update public.games set available = false where id = '00000000-0000-4000-b000-000000000002';
reset role;
select is(
  (select available from public.games where id = '00000000-0000-4000-b000-000000000002'),
  true,
  'gracz nie zmienia dostępności gry'
);

select * from finish();
rollback;
