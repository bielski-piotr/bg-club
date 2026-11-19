-- Zapis partii: public.save_play na wspólnych przypadkach.
-- PLIK GENEROWANY z packages/scoring/src/cases/play-cases.json — nie edytować ręcznie.
-- Po zmianie przypadków: pnpm --filter @bg-club/scoring gen:sql.
-- Miejsca liczy TypeScript (rankPlayers, savePlayResults), punkty i wygrane baza.
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000100', 'gracz-1-testowy-a100', 'Gracz', 'Testowy 1', 'player'),
  ('00000000-0000-4000-a000-000000000101', 'gracz-2-testowy-a101', 'Gracz', 'Testowy 2', 'player'),
  ('00000000-0000-4000-a000-000000000102', 'gracz-3-testowy-a102', 'Gracz', 'Testowy 3', 'player'),
  ('00000000-0000-4000-a000-000000000103', 'gracz-4-testowy-a103', 'Gracz', 'Testowy 4', 'player'),
  ('00000000-0000-4000-a000-000000000104', 'gracz-5-testowy-a104', 'Gracz', 'Testowy 5', 'player'),
  ('00000000-0000-4000-a000-000000000201', 'czlonek-1-zespolu-b100', 'Członek', 'Zespołu 1', 'player'),
  ('00000000-0000-4000-a000-000000000211', 'czlonek-2-zespolu-b101', 'Członek', 'Zespołu 2', 'player');

insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Wspólne przypadki', '2026-11-20 18:00+01', '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select '00000000-0000-4000-c000-000000000001', p.id from public.profiles p;
update public.meetings set status = 'in_progress', voting_open = false, started_at = now();

-- remis dwóch o 1. miejsce, punktacja 10/6/4/2/0 → 8/8/4/2/0 (starszy format)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Gra 1', 2, 5, array[10, 6, 4, 2, 0]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes 1');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"total","kind":"total"}]}', 5);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001' where id = '00000000-0000-4000-d000-000000000001';
-- floor: trzech graczy remisuje o 2. miejsce, (7+4+2)/3 → 4,33 (floor do setnych)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000002', 'Gra 2', 2, 4, array[10, 7, 4, 2]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Notes 2');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000002', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"total","kind":"total"}]}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000002' where id = '00000000-0000-4000-d000-000000000002';
-- ujemne wyniki, więcej = lepiej
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000003', 'Gra 3', 2, 4, array[6, 3, 2, 0]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000003', 'Notes 3');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000003', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input","free":true},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000003' where id = '00000000-0000-4000-d000-000000000003';
-- ujemne wyniki, mniej = lepiej
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000004', 'Gra 4', 2, 4, array[6, 3, 2, 0]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b000-000000000004', 'Notes 4');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-d000-000000000004', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input","free":true},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000004' where id = '00000000-0000-4000-d000-000000000004';
-- remis w remisie: reguła 1 daje 1 + remis dwóch, reguła 2 rozstrzyga tylko tych dwóch
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000005', 'Gra 5', 2, 4, array[10, 6, 4, 2]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b000-000000000005', 'Notes 5');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-d000-000000000005', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"c","kind":"input"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[{"type":"line","line":"a","dir":"desc"},{"type":"line","line":"b","dir":"desc"}]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000005' where id = '00000000-0000-4000-d000-000000000005';
-- remis po wszystkich regułach zostaje: 1, 2, 2, 4 (niejawne wspólne miejsce)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000006', 'Gra 6', 2, 4, array[10, 6, 4, 2]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000006', '00000000-0000-4000-b000-000000000006', 'Notes 6');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000006', '00000000-0000-4000-d000-000000000006', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"c","kind":"input"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[{"type":"line","line":"a","dir":"desc"}]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000006' where id = '00000000-0000-4000-d000-000000000006';
-- wspólne miejsce trzech graczy: 1, 1, 1, 4, (10+6+4)/3 → 6,66 (floor do setnych)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000007', 'Gra 7', 2, 4, array[10, 6, 4, 2]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000007', '00000000-0000-4000-b000-000000000007', 'Notes 7');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000007', '00000000-0000-4000-d000-000000000007', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"c","kind":"input"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[{"type":"shared"}]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000007' where id = '00000000-0000-4000-d000-000000000007';
-- punktacja decyduje, mniej = lepiej, remis rozstrzyga suma
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000008', 'Gra 8', 2, 3, array[3, 2, 1]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000008', '00000000-0000-4000-b000-000000000008', 'Notes 8');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000008', '00000000-0000-4000-d000-000000000008', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"total","kind":"total"}],"ranking":{"line":"a","dir":"asc","tiebreak":[{"type":"line","line":"total","dir":"desc"}]}}', 3);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000008' where id = '00000000-0000-4000-d000-000000000008';
-- starszy format: decyduje suma, której nie sumuje żadna inna (suma z sumy)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000009', 'Gra 9', 2, 2, array[5, 0]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-b000-000000000009', 'Notes 9');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000009', '00000000-0000-4000-d000-000000000009', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"grand","kind":"total","of":["sub","b"]},{"id":"sub","kind":"total","of":["a"]}]}', 2);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000009' where id = '00000000-0000-4000-d000-000000000009';
-- starszy format bez sumy końcowej: suma punktacji, puste pole się nie liczy
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000010', 'Gra 10', 2, 3, array[4, 2, 1]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000010', '00000000-0000-4000-b000-000000000010', 'Notes 10');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000010', '00000000-0000-4000-d000-000000000010', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"}]}', 3);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000010' where id = '00000000-0000-4000-d000-000000000010';
-- puste pole kategorii decydującej jest za każdą liczbą, także przy „mniej = lepiej”
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000011', 'Gra 11', 2, 3, array[2, 1, 0]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-b000-000000000011', 'Notes 11');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000011', '00000000-0000-4000-d000-000000000011', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input","free":true}],"ranking":{"line":"a","dir":"asc","tiebreak":[]}}', 3);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000011' where id = '00000000-0000-4000-d000-000000000011';
-- remis wszystkich graczy: każdy wygrywa, (3+1)/2 → 2
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000012', 'Gra 12', 2, 2, array[3, 1]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000012', '00000000-0000-4000-b000-000000000012', 'Notes 12');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000012', '00000000-0000-4000-d000-000000000012', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"total","kind":"total"}]}', 2);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000012' where id = '00000000-0000-4000-d000-000000000012';
-- gra 2–6, partia 4 graczy: zwycięzca dostaje punkty za 3. miejsce, ostatni za 6. (10/8/6/4/2/1 → 6/4/2/1)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000013', 'Gra 13', 2, 6, array[10, 8, 6, 4, 2, 1]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000013', '00000000-0000-4000-b000-000000000013', 'Notes 13');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000013', '00000000-0000-4000-d000-000000000013', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000013' where id = '00000000-0000-4000-d000-000000000013';
-- punkty ułamkowe: remis o 2. miejsce, (7,25 + 3,1) / 2 → 5,17 (floor do setnych)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000014', 'Gra 14', 2, 4, array[12.5, 7.25, 3.1, 0.5]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000014', '00000000-0000-4000-b000-000000000014', 'Notes 14');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000014', '00000000-0000-4000-d000-000000000014', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000014' where id = '00000000-0000-4000-d000-000000000014';
-- zespoły: 3 strony w grze do 6 graczy, każdy członek zespołu dostaje pełne punkty miejsca (10/6/4/2/1/0 → 2/1/0)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000015', 'Gra 15', 2, 6, array[10, 6, 4, 2, 1, 0]::numeric[]);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000015', '00000000-0000-4000-b000-000000000015', 'Notes 15');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000015', '00000000-0000-4000-d000-000000000015', '{"v":2,"lines":[{"id":"names","kind":"names","team":true},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 3);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000015' where id = '00000000-0000-4000-d000-000000000015';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103', '00000000-0000-4000-a000-000000000104']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-e000-000000000001',
       '{"game":1,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":3,"scores":{"a":10,"b":10},"ranking_value":20},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":1,"scores":{"a":20,"b":5},"ranking_value":25},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":1,"scores":{"a":5,"b":20},"ranking_value":25},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":4,"scores":{"a":10,"b":0},"ranking_value":10},{"profile_id":"00000000-0000-4000-a000-000000000104","seat":5,"place":5,"scores":{"a":0,"b":5},"ranking_value":5}]'::jsonb); $$,
  'remis dwóch o 1. miejsce, punktacja 10/6/4/2/0 → 8/8/4/2/0 (starszy format): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000001' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 3, false, 4::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 1, true, 8::numeric, true), (3, '00000000-0000-4000-a000-000000000102'::uuid, 1, true, 8::numeric, true), (4, '00000000-0000-4000-a000-000000000103'::uuid, 4, false, 2::numeric, false), (5, '00000000-0000-4000-a000-000000000104'::uuid, 5, false, 0::numeric, false) $$,
  'remis dwóch o 1. miejsce, punktacja 10/6/4/2/0 → 8/8/4/2/0 (starszy format): punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000002',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-e000-000000000002',
       '{"game":2,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":1,"scores":{"a":20,"b":10},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":2,"scores":{"a":10,"b":10},"ranking_value":20},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":2,"scores":{"a":15,"b":5},"ranking_value":20},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":2,"scores":{"a":0,"b":20},"ranking_value":20}]'::jsonb); $$,
  'floor: trzech graczy remisuje o 2. miejsce, (7+4+2)/3 → 4,33 (floor do setnych): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000002' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 1, false, 10::numeric, true), (2, '00000000-0000-4000-a000-000000000101'::uuid, 2, true, 4.33::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 2, true, 4.33::numeric, false), (4, '00000000-0000-4000-a000-000000000103'::uuid, 2, true, 4.33::numeric, false) $$,
  'floor: trzech graczy remisuje o 2. miejsce, (7+4+2)/3 → 4,33 (floor do setnych): punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000003',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000003', '00000000-0000-4000-e000-000000000003',
       '{"game":3,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":4,"scores":{"a":-5},"ranking_value":-5},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":2,"scores":{"a":-2},"ranking_value":-2},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":1,"scores":{"a":3},"ranking_value":3},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":2,"scores":{"a":-2},"ranking_value":-2}]'::jsonb); $$,
  'ujemne wyniki, więcej = lepiej: baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000003' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 4, false, 0::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 2, true, 2.5::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 1, false, 6::numeric, true), (4, '00000000-0000-4000-a000-000000000103'::uuid, 2, true, 2.5::numeric, false) $$,
  'ujemne wyniki, więcej = lepiej: punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000004',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000004', '00000000-0000-4000-e000-000000000004',
       '{"game":4,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":1,"scores":{"a":-5},"ranking_value":-5},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":2,"scores":{"a":-2},"ranking_value":-2},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":4,"scores":{"a":3},"ranking_value":3},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":2,"scores":{"a":-2},"ranking_value":-2}]'::jsonb); $$,
  'ujemne wyniki, mniej = lepiej: baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000004' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 1, false, 6::numeric, true), (2, '00000000-0000-4000-a000-000000000101'::uuid, 2, true, 2.5::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 4, false, 0::numeric, false), (4, '00000000-0000-4000-a000-000000000103'::uuid, 2, true, 2.5::numeric, false) $$,
  'ujemne wyniki, mniej = lepiej: punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000005',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000005', '00000000-0000-4000-e000-000000000005',
       '{"game":5,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":1,"scores":{"a":15,"b":0,"c":15},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":3,"scores":{"a":10,"b":5,"c":15},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":2,"scores":{"a":10,"b":12,"c":8},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":4,"scores":{"a":5,"b":5,"c":0},"ranking_value":10}]'::jsonb); $$,
  'remis w remisie: reguła 1 daje 1 + remis dwóch, reguła 2 rozstrzyga tylko tych dwóch: baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000005' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 1, false, 10::numeric, true), (2, '00000000-0000-4000-a000-000000000101'::uuid, 3, false, 4::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 2, false, 6::numeric, false), (4, '00000000-0000-4000-a000-000000000103'::uuid, 4, false, 2::numeric, false) $$,
  'remis w remisie: reguła 1 daje 1 + remis dwóch, reguła 2 rozstrzyga tylko tych dwóch: punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000006', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000006',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000006', '00000000-0000-4000-e000-000000000006',
       '{"game":6,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":1,"scores":{"a":15,"b":0,"c":15},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":2,"scores":{"a":10,"b":5,"c":15},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":2,"scores":{"a":10,"b":12,"c":8},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":4,"scores":{"a":5,"b":5,"c":0},"ranking_value":10}]'::jsonb); $$,
  'remis po wszystkich regułach zostaje: 1, 2, 2, 4 (niejawne wspólne miejsce): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000006' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 1, false, 10::numeric, true), (2, '00000000-0000-4000-a000-000000000101'::uuid, 2, true, 5::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 2, true, 5::numeric, false), (4, '00000000-0000-4000-a000-000000000103'::uuid, 4, false, 2::numeric, false) $$,
  'remis po wszystkich regułach zostaje: 1, 2, 2, 4 (niejawne wspólne miejsce): punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000007', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000007',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000007', '00000000-0000-4000-e000-000000000007',
       '{"game":7,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":1,"scores":{"a":15,"b":0,"c":15},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":1,"scores":{"a":10,"b":5,"c":15},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":1,"scores":{"a":10,"b":12,"c":8},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":4,"scores":{"a":5,"b":5,"c":0},"ranking_value":10}]'::jsonb); $$,
  'wspólne miejsce trzech graczy: 1, 1, 1, 4, (10+6+4)/3 → 6,66 (floor do setnych): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000007' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 1, true, 6.66::numeric, true), (2, '00000000-0000-4000-a000-000000000101'::uuid, 1, true, 6.66::numeric, true), (3, '00000000-0000-4000-a000-000000000102'::uuid, 1, true, 6.66::numeric, true), (4, '00000000-0000-4000-a000-000000000103'::uuid, 4, false, 2::numeric, false) $$,
  'wspólne miejsce trzech graczy: 1, 1, 1, 4, (10+6+4)/3 → 6,66 (floor do setnych): punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000008', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000008',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000008', '00000000-0000-4000-e000-000000000008',
       '{"game":8,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":3,"scores":{"a":3,"b":10},"ranking_value":3},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":2,"scores":{"a":1,"b":2},"ranking_value":1},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":1,"scores":{"a":1,"b":9},"ranking_value":1}]'::jsonb); $$,
  'punktacja decyduje, mniej = lepiej, remis rozstrzyga suma: baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000008' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 3, false, 1::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 2, false, 2::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 1, false, 3::numeric, true) $$,
  'punktacja decyduje, mniej = lepiej, remis rozstrzyga suma: punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000009',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-e000-000000000009',
       '{"game":9,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":2,"scores":{"a":10,"b":1},"ranking_value":11},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":1,"scores":{"a":2,"b":20},"ranking_value":22}]'::jsonb); $$,
  'starszy format: decyduje suma, której nie sumuje żadna inna (suma z sumy): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000009' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 2, false, 0::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 1, false, 5::numeric, true) $$,
  'starszy format: decyduje suma, której nie sumuje żadna inna (suma z sumy): punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000010', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000010',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000010', '00000000-0000-4000-e000-000000000010',
       '{"game":10,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":2,"scores":{"a":4,"b":4},"ranking_value":8},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":1,"scores":{"a":9,"b":0},"ranking_value":9},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":2,"scores":{"a":8,"b":null},"ranking_value":8}]'::jsonb); $$,
  'starszy format bez sumy końcowej: suma punktacji, puste pole się nie liczy: baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000010' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 2, true, 1.5::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 1, false, 4::numeric, true), (3, '00000000-0000-4000-a000-000000000102'::uuid, 2, true, 1.5::numeric, false) $$,
  'starszy format bez sumy końcowej: suma punktacji, puste pole się nie liczy: punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000011',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000011', '00000000-0000-4000-e000-000000000011',
       '{"game":11,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":2,"scores":{"a":null},"ranking_value":null},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":1,"scores":{"a":-3},"ranking_value":-3},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":2,"scores":{},"ranking_value":null}]'::jsonb); $$,
  'puste pole kategorii decydującej jest za każdą liczbą, także przy „mniej = lepiej”: baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000011' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 2, true, 0.5::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 1, false, 2::numeric, true), (3, '00000000-0000-4000-a000-000000000102'::uuid, 2, true, 0.5::numeric, false) $$,
  'puste pole kategorii decydującej jest za każdą liczbą, także przy „mniej = lepiej”: punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000012',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000012', '00000000-0000-4000-e000-000000000012',
       '{"game":12,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":1,"scores":{"a":4,"b":3},"ranking_value":7},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":1,"scores":{"a":7,"b":0},"ranking_value":7}]'::jsonb); $$,
  'remis wszystkich graczy: każdy wygrywa, (3+1)/2 → 2: baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000012' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 1, true, 2::numeric, true), (2, '00000000-0000-4000-a000-000000000101'::uuid, 1, true, 2::numeric, true) $$,
  'remis wszystkich graczy: każdy wygrywa, (3+1)/2 → 2: punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000013',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000013', '00000000-0000-4000-e000-000000000013',
       '{"game":13,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":2,"scores":{"total":30},"ranking_value":30},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":3,"scores":{"total":20},"ranking_value":20},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":1,"scores":{"total":40},"ranking_value":40},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":4,"scores":{"total":10},"ranking_value":10}]'::jsonb); $$,
  'gra 2–6, partia 4 graczy: zwycięzca dostaje punkty za 3. miejsce, ostatni za 6. (10/8/6/4/2/1 → 6/4/2/1): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000013' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 2, false, 4::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 3, false, 2::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 1, false, 6::numeric, true), (4, '00000000-0000-4000-a000-000000000103'::uuid, 4, false, 1::numeric, false) $$,
  'gra 2–6, partia 4 graczy: zwycięzca dostaje punkty za 3. miejsce, ostatni za 6. (10/8/6/4/2/1 → 6/4/2/1): punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000014',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000103']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000014', '00000000-0000-4000-e000-000000000014',
       '{"game":14,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":1,"scores":{"total":9},"ranking_value":9},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":2,"scores":{"total":5},"ranking_value":5},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":2,"scores":{"total":5},"ranking_value":5},{"profile_id":"00000000-0000-4000-a000-000000000103","seat":4,"place":4,"scores":{"total":1},"ranking_value":1}]'::jsonb); $$,
  'punkty ułamkowe: remis o 2. miejsce, (7,25 + 3,1) / 2 → 5,17 (floor do setnych): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000014' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 1, false, 12.5::numeric, true), (2, '00000000-0000-4000-a000-000000000101'::uuid, 2, true, 5.17::numeric, false), (3, '00000000-0000-4000-a000-000000000102'::uuid, 2, true, 5.17::numeric, false), (4, '00000000-0000-4000-a000-000000000103'::uuid, 4, false, 0.5::numeric, false) $$,
  'punkty ułamkowe: remis o 2. miejsce, (7,25 + 3,1) / 2 → 5,17 (floor do setnych): punkty, remisy i wygrane z bazy');

select lives_ok($$ select public.start_play('00000000-0000-4000-f000-000000000015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000015',
       array['00000000-0000-4000-a000-000000000100', '00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000211', '00000000-0000-4000-a000-000000000102']::uuid[], array[1, 1, 2, 2, 3]::int[]);
     select public.save_play('00000000-0000-4000-f000-000000000015', '00000000-0000-4000-e000-000000000015',
       '{"game":15,"names":[],"cells":{}}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000100","seat":1,"place":2,"scores":{"total":15},"ranking_value":15},{"profile_id":"00000000-0000-4000-a000-000000000201","seat":1,"place":2,"scores":{"total":15},"ranking_value":15},{"profile_id":"00000000-0000-4000-a000-000000000101","seat":2,"place":1,"scores":{"total":25},"ranking_value":25},{"profile_id":"00000000-0000-4000-a000-000000000211","seat":2,"place":1,"scores":{"total":25},"ranking_value":25},{"profile_id":"00000000-0000-4000-a000-000000000102","seat":3,"place":3,"scores":{"total":5},"ranking_value":5}]'::jsonb); $$,
  'zespoły: 3 strony w grze do 6 graczy, każdy członek zespołu dostaje pełne punkty miejsca (10/6/4/2/1/0 → 2/1/0): baza przyjmuje miejsca z TypeScriptu');
select results_eq(
  $$ select seat, profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000015' order by seat, profile_id $$,
  $$ values (1, '00000000-0000-4000-a000-000000000100'::uuid, 2, false, 1::numeric, false), (1, '00000000-0000-4000-a000-000000000201'::uuid, 2, false, 1::numeric, false), (2, '00000000-0000-4000-a000-000000000101'::uuid, 1, false, 2::numeric, true), (2, '00000000-0000-4000-a000-000000000211'::uuid, 1, false, 2::numeric, true), (3, '00000000-0000-4000-a000-000000000102'::uuid, 3, false, 0::numeric, false) $$,
  'zespoły: 3 strony w grze do 6 graczy, każdy członek zespołu dostaje pełne punkty miejsca (10/6/4/2/1/0 → 2/1/0): punkty, remisy i wygrane z bazy');

select * from finish();
rollback;
