-- Dodatki do gier, punktacja partii z dodatkami, rekordy z dodatkami i przenoszenie notesów
-- (migracja 20261126000000). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-bartkowski-a002', 'Bartek', 'Bartkowski', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-celinska-a003', 'Celina', 'Celińska', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'darek-darecki-a004', 'Darek', 'Darecki', 'player'),
  ('00000000-0000-4000-a000-000000000005', 'ewa-ewska-a005', 'Ewa', 'Ewska', 'player');

insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Dodatki', '2026-11-20 18:00+01', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Plan', '2026-12-20 18:00+01', '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.profiles p cross join public.meetings m;
update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
 where id = '00000000-0000-4000-c000-000000000001';

-- Gra 2–4 (skomplikowanie 2), dodatek A 2–4 (3,0), dodatek B 2–6 (1,5), dodatek C 2–6 (2,5).
insert into public.games (id, title, min_players, max_players, placement_points, complexity) values
  ('00000000-0000-4000-b000-000000000001', 'Podstawka', 2, 4, '{4,3,2,1}', 2);
insert into public.games (id, title, min_players, max_players, placement_points, complexity, base_game_id) values
  ('00000000-0000-4000-b000-000000000011', 'Dodatek A', 2, 4, '{40,30,20,10}', 3, '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-b000-000000000012', 'Dodatek B', 2, 6, '{6,5,4,3,2,1}', 1.5, '00000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-b000-000000000013', 'Dodatek C', 2, 6, '{60,50,40,30,20,10}', 2.5, '00000000-0000-4000-b000-000000000001');
insert into public.games (id, title, min_players, max_players, placement_points, complexity) values
  ('00000000-0000-4000-b000-000000000002', 'Inna gra', 2, 4, '{4,3,2,1}', 2);

-- Notesy: gry podstawowej (4 miejsca) i dodatku B (6 miejsc).
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Podstawka'),
  ('00000000-0000-4000-d000-000000000012', '00000000-0000-4000-b000-000000000012', 'Dodatek B');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 4),
  ('00000000-0000-4000-e000-000000000012', '00000000-0000-4000-d000-000000000012',
   '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 6);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001' where id = '00000000-0000-4000-d000-000000000001';
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000012' where id = '00000000-0000-4000-d000-000000000012';

-- ---------------------------------------------------------------------------------------------
-- Dodatki: struktura i widoczność
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points, complexity, base_game_id)
     values ('Dodatek do dodatku', 2, 2, '{1,0}', 2, '00000000-0000-4000-b000-000000000011') $$,
  '%cannot have expansions%',
  'dodatek nie może mieć własnych dodatków'
);
select throws_like(
  $$ update public.games set base_game_id = '00000000-0000-4000-b000-000000000002'
      where id = '00000000-0000-4000-b000-000000000011' $$,
  '%base_game_id is immutable%',
  'gry podstawowej dodatku nie da się zmienić'
);
select throws_like(
  $$ update public.games set base_game_id = '00000000-0000-4000-b000-000000000001'
      where id = '00000000-0000-4000-b000-000000000002' $$,
  '%base_game_id is immutable%',
  'gra podstawowa nie staje się dodatkiem'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select results_eq(
  $$ select title from public.search_games(null) $$,
  $$ values ('Inna gra'), ('Podstawka') $$,
  'kolekcja i wyszukiwanie: bez dodatków'
);
select is(
  (select count(*)::int from public.search_games('dodatek')),
  0,
  'wyszukiwanie nie znajduje dodatków'
);
select results_eq(
  $$ select title, play_count from public.game_collection
      where base_game_id = '00000000-0000-4000-b000-000000000001' order by title $$,
  $$ values ('Dodatek A', 0), ('Dodatek B', 0), ('Dodatek C', 0) $$,
  'dodatki gry są w game_collection z liczbą partii'
);
select throws_like(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id)
     values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000011',
             '00000000-0000-4000-a000-000000000002') $$,
  '%is an expansion%',
  'na dodatek nie da się głosować'
);

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select throws_like(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000002',
       array['00000000-0000-4000-b000-000000000011']::uuid[]) $$,
  '%is an expansion%',
  'dodatku nie da się opublikować w „Gramy w”'
);

-- ---------------------------------------------------------------------------------------------
-- Rozpoczęcie partii z dodatkami
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ select public.start_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000012',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]) $$,
  '%expansion not used in the play%',
  'notes dodatku tylko w partii z tym dodatkiem'
);
select throws_like(
  $$ select public.start_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[],
       null, array['00000000-0000-4000-b000-000000000002']::uuid[]) $$,
  '%active expansions of game%',
  'dodatki partii muszą być dodatkami jej gry'
);
select throws_like(
  $$ select public.start_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000012',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004',
             '00000000-0000-4000-a000-000000000005']::uuid[],
       null, array['00000000-0000-4000-b000-000000000011', '00000000-0000-4000-b000-000000000011']::uuid[]) $$,
  '%expansion not used in the play%',
  'notes dodatku B wymaga zaznaczenia dodatku B'
);

-- 1. Gra + dodatek A (wyższe skomplikowanie, ta sama liczba graczy): punktacja dodatku A.
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[],
       null, array['00000000-0000-4000-b000-000000000011']::uuid[]) $$,
  'partia z dodatkiem A'
);
select results_eq(
  $$ select game_id, expansion_ids, points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000001' $$,
  $$ values ('00000000-0000-4000-b000-000000000001'::uuid, array['00000000-0000-4000-b000-000000000011']::uuid[],
             '{40,30,20,10}'::numeric[]) $$,
  'partia należy do gry podstawowej, z dodatkiem i punktacją wyżej skomplikowanego tytułu'
);
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[],
       null, array['00000000-0000-4000-b000-000000000011']::uuid[]) $$,
  'ponowienie z tymi samymi dodatkami zwraca partię'
);
select throws_like(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]) $$,
  '%already exists%',
  'ponowienie bez dodatków to inna partia'
);

-- 2. Gra + B (rozszerza do 6, niższe skomplikowanie), 4 graczy: mieści podstawka, wyższa: punktacja gry.
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000012',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003',
             '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000005']::uuid[],
       null, array['00000000-0000-4000-b000-000000000012']::uuid[]) $$,
  'partia 4 graczy z dodatkiem B na notesie dodatku'
);
select is(
  (select points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000002'),
  '{4,3,2,1}'::numeric[],
  '4 graczy: punktacja gry podstawowej (wyższe skomplikowanie, mieści wszystkich)'
);

-- 3. Gra + B, 5 graczy: mieści tylko dodatek B.
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000003', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000012',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004',
             '00000000-0000-4000-a000-000000000005']::uuid[],
       null, array['00000000-0000-4000-b000-000000000012']::uuid[]) $$,
  'partia 5 graczy z dodatkiem B (powyżej max podstawki)'
);
select is(
  (select points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000003'),
  '{6,5,4,3,2,1}'::numeric[],
  '5 graczy: punktacja dodatku, który mieści wszystkich'
);

-- 4. Gra + A + B + C, 5 graczy: A (najwyższe) nie mieści, z mieszczących najwyższe ma C.
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000004', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000012',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004',
             '00000000-0000-4000-a000-000000000005']::uuid[],
       null, array['00000000-0000-4000-b000-000000000013', '00000000-0000-4000-b000-000000000011',
                   '00000000-0000-4000-b000-000000000012']::uuid[]) $$,
  'partia 5 graczy z trzema dodatkami'
);
select is(
  (select points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000004'),
  '{60,50,40,30,20,10}'::numeric[],
  '5 graczy: najwyższe skomplikowanie spośród tytułów, które mieszczą wszystkich'
);
reset role;
select throws_like(
  $$ update public.plays set expansion_ids = '{}' where id = '00000000-0000-4000-f000-000000000004' $$,
  '%immutable%',
  'dodatków partii nie da się zmienić'
);
set local role authenticated;

-- Zapis partii z dodatkiem A: rekord gry podstawowej z listą dodatków, liczba partii dodatku.
select lives_ok(
  $$ select public.save_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-e000-000000000001', '{}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000002","seat":1,"place":1,"scores":{"total":99},"ranking_value":99},
         {"profile_id":"00000000-0000-4000-a000-000000000003","seat":2,"place":2,"scores":{"total":5},"ranking_value":5}]'::jsonb) $$,
  'zapis partii z dodatkiem'
);
select results_eq(
  $$ select profile_id, points from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000001' order by profile_id $$,
  $$ values ('00000000-0000-4000-a000-000000000002'::uuid, 20::numeric),
            ('00000000-0000-4000-a000-000000000003'::uuid, 10::numeric) $$,
  'punkty partii z punktacji dodatku (2 graczy: ostatnie 2 pozycje)'
);
select is(
  public.game_stats('00000000-0000-4000-b000-000000000001') -> 'record' -> 'holders' -> 0 -> 'expansions',
  '[{"id": "00000000-0000-4000-b000-000000000011", "title": "Dodatek A"}]'::jsonb,
  'rekord gry podstawowej oznacza dodatki partii'
);
select is(
  (select (public.game_stats('00000000-0000-4000-b000-000000000001') ->> 'play_count')::int),
  1,
  'partia z dodatkiem liczy się do statystyk gry podstawowej'
);
select results_eq(
  $$ select title, play_count from public.game_collection
      where base_game_id = '00000000-0000-4000-b000-000000000001' order by title $$,
  $$ values ('Dodatek A', 1), ('Dodatek B', 0), ('Dodatek C', 0) $$,
  'dodatek zbiera liczbę rozegranych partii'
);
select results_eq(
  $$ select title, expansions from public.player_records('00000000-0000-4000-a000-000000000002')
      where value is not null $$,
  $$ values ('Podstawka'::text, '[{"id": "00000000-0000-4000-b000-000000000011", "title": "Dodatek A"}]'::jsonb) $$,
  'rekordy gracza: tylko gry podstawowe, z dodatkami partii rekordu'
);

-- ---------------------------------------------------------------------------------------------
-- Przenoszenie notesu i usuwanie
-- ---------------------------------------------------------------------------------------------
select lives_ok(
  $$ update public.scorepads set game_id = '00000000-0000-4000-b000-000000000011'
      where id = '00000000-0000-4000-d000-000000000001' $$,
  'administrator przenosi notes gry do dodatku'
);
select results_eq(
  $$ select game_id, scorepad_version_id from public.plays where id = '00000000-0000-4000-f000-000000000001' $$,
  $$ values ('00000000-0000-4000-b000-000000000001'::uuid, '00000000-0000-4000-e000-000000000001'::uuid) $$,
  'przeniesienie notesu nie zmienia historii partii'
);

update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000002';
select throws_like(
  $$ update public.scorepads set game_id = '00000000-0000-4000-b000-000000000002'
      where id = '00000000-0000-4000-d000-000000000001' $$,
  '%is deleted%',
  'notesu nie da się przenieść do usuniętej gry'
);

update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000001';
reset role;
select is(
  (select count(*)::int from public.games
    where base_game_id = '00000000-0000-4000-b000-000000000001' and deleted_at is null),
  0,
  'usunięcie gry podstawowej usuwa jej dodatki'
);

select * from finish();

rollback;
