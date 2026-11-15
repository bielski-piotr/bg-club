-- [036] Przeliczanie osiągnięć (PRD §5.10, ACH-2, §5.6.6, NFR-11) na wspólnych przypadkach.
-- PLIK GENEROWANY z packages/scoring/src/cases/achievements.ts — nie edytować ręcznie.
-- Po zmianie przypadków: pnpm --filter @bg-club/scoring gen:sql.
-- Te same przypadki przechodzi implementacja TypeScript (computeAchievements).
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000101', 'gracz-1-testowy-a100', 'Gracz', 'Testowy 1', 'player'),
  ('00000000-0000-4000-a000-000000000102', 'gracz-2-testowy-a101', 'Gracz', 'Testowy 2', 'player'),
  ('00000000-0000-4000-a000-000000000103', 'gracz-3-testowy-a102', 'Gracz', 'Testowy 3', 'player'),
  ('00000000-0000-4000-a000-000000000104', 'gracz-4-testowy-a103', 'Gracz', 'Testowy 4', 'player'),
  ('00000000-0000-4000-a000-000000000105', 'gracz-5-testowy-a104', 'Gracz', 'Testowy 5', 'player'),
  ('00000000-0000-4000-a000-000000000106', 'gracz-6-testowy-a105', 'Gracz', 'Testowy 6', 'player'),
  ('00000000-0000-4000-a000-000000000107', 'gracz-7-testowy-a106', 'Gracz', 'Testowy 7', 'player');

-- Gry z notesem w dwóch wersjach: „więcej = lepiej” i „mniej = lepiej”.
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000001', 'Gra 1', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000011', '00000000-0000-4000-d000-000000000001', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000012', '00000000-0000-4000-d000-000000000001', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000002', 'Gra 2', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000021', '00000000-0000-4000-d000-000000000002', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000022', '00000000-0000-4000-d000-000000000002', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000003', 'Gra 3', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000003', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000031', '00000000-0000-4000-d000-000000000003', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000032', '00000000-0000-4000-d000-000000000003', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000004', 'Gra 4', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b000-000000000004', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000041', '00000000-0000-4000-d000-000000000004', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000042', '00000000-0000-4000-d000-000000000004', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000005', 'Gra 5', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b000-000000000005', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000051', '00000000-0000-4000-d000-000000000005', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000052', '00000000-0000-4000-d000-000000000005', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000006', 'Gra 6', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000006', '00000000-0000-4000-b000-000000000006', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000061', '00000000-0000-4000-d000-000000000006', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000062', '00000000-0000-4000-d000-000000000006', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000007', 'Gra 7', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000007', '00000000-0000-4000-b000-000000000007', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000071', '00000000-0000-4000-d000-000000000007', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000072', '00000000-0000-4000-d000-000000000007', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000008', 'Gra 8', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000008', '00000000-0000-4000-b000-000000000008', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000081', '00000000-0000-4000-d000-000000000008', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000082', '00000000-0000-4000-d000-000000000008', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000009', 'Gra 9', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-b000-000000000009', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000091', '00000000-0000-4000-d000-000000000009', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000092', '00000000-0000-4000-d000-000000000009', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000010', 'Gra 10', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000010', '00000000-0000-4000-b000-000000000010', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000101', '00000000-0000-4000-d000-000000000010', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000102', '00000000-0000-4000-d000-000000000010', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000011', 'Gra 11', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-b000-000000000011', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000111', '00000000-0000-4000-d000-000000000011', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000112', '00000000-0000-4000-d000-000000000011', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000012', 'Gra 12', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000012', '00000000-0000-4000-b000-000000000012', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000121', '00000000-0000-4000-d000-000000000012', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000122', '00000000-0000-4000-d000-000000000012', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000013', 'Gra 13', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000013', '00000000-0000-4000-b000-000000000013', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000131', '00000000-0000-4000-d000-000000000013', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000132', '00000000-0000-4000-d000-000000000013', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000014', 'Gra 14', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000014', '00000000-0000-4000-b000-000000000014', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000141', '00000000-0000-4000-d000-000000000014', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000142', '00000000-0000-4000-d000-000000000014', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000015', 'Gra 15', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000015', '00000000-0000-4000-b000-000000000015', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000151', '00000000-0000-4000-d000-000000000015', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000152', '00000000-0000-4000-d000-000000000015', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000016', 'Gra 16', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000016', '00000000-0000-4000-b000-000000000016', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000161', '00000000-0000-4000-d000-000000000016', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000162', '00000000-0000-4000-d000-000000000016', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000017', 'Gra 17', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000017', '00000000-0000-4000-b000-000000000017', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000171', '00000000-0000-4000-d000-000000000017', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000172', '00000000-0000-4000-d000-000000000017', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000018', 'Gra 18', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000018', '00000000-0000-4000-b000-000000000018', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000181', '00000000-0000-4000-d000-000000000018', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000182', '00000000-0000-4000-d000-000000000018', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000019', 'Gra 19', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000019', '00000000-0000-4000-b000-000000000019', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000191', '00000000-0000-4000-d000-000000000019', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000192', '00000000-0000-4000-d000-000000000019', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000020', 'Gra 20', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000020', '00000000-0000-4000-b000-000000000020', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000201', '00000000-0000-4000-d000-000000000020', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000202', '00000000-0000-4000-d000-000000000020', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000021', 'Gra 21', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000021', '00000000-0000-4000-b000-000000000021', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000211', '00000000-0000-4000-d000-000000000021', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000212', '00000000-0000-4000-d000-000000000021', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000022', 'Gra 22', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000022', '00000000-0000-4000-b000-000000000022', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000221', '00000000-0000-4000-d000-000000000022', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000222', '00000000-0000-4000-d000-000000000022', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000023', 'Gra 23', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000023', '00000000-0000-4000-b000-000000000023', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000231', '00000000-0000-4000-d000-000000000023', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000232', '00000000-0000-4000-d000-000000000023', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000024', 'Gra 24', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000024', '00000000-0000-4000-b000-000000000024', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000241', '00000000-0000-4000-d000-000000000024', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000242', '00000000-0000-4000-d000-000000000024', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);
insert into public.games (id, title, min_players, max_players, placement_points) values ('00000000-0000-4000-b000-000000000025', 'Gra 25', 2, 8, '{10,6,4,2,1,0,0,0}');
insert into public.scorepads (id, game_id, name) values ('00000000-0000-4000-d000-000000000025', '00000000-0000-4000-b000-000000000025', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values ('00000000-0000-4000-e000-000000000251', '00000000-0000-4000-d000-000000000025', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 8), ('00000000-0000-4000-e000-000000000252', '00000000-0000-4000-d000-000000000025', '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"total"}],"ranking":{"line":"total","dir":"asc","tiebreak":[]}}', 8);

set local session_replication_role = replica;

-- pierwsza partia: meet-1, win-1, szczęście debiutanta; przegrany tylko meet-1
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['meet-1', 'meet-10', 'meet-25', 'meet-50', 'play-10', 'play-50', 'play-100', 'marathon', 'win-1', 'win-10', 'win-50', 'hattrick', 'flawless', 'streak-3', 'streak-5', 'streak-10', 'explorer-10', 'explorer-25', 'versatile-5', 'specialist', 'beginners-luck', 'record', 'big-table', 'tie-top', 'comeback', 'lantern-10', 'pts-100', 'pts-500', 'voter-10'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'beginners-luck', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'meet-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'win-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'meet-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz) $$,
  'pierwsza partia: meet-1, win-1, szczęście debiutanta; przegrany tylko meet-1');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- szczęście debiutanta: tylko pierwsza partia danej gry, także wspólne 1. miejsce
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-e000-000000000021', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 3, 3, false, 4, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['beginners-luck'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'beginners-luck', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'beginners-luck', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz) $$,
  'szczęście debiutanta: tylko pierwsza partia danej gry, także wspólne 1. miejsce');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- remis o 1. miejsce: ex aequo i wygrana dla obu, ostatnie miejsce wspólne
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 8, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 8, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 3, 3, false, 4, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['tie-top', 'win-1', 'lantern-10'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'tie-top', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'win-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'tie-top', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'win-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz) $$,
  'remis o 1. miejsce: ex aequo i wygrana dla obu, ostatnie miejsce wspólne');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- czerwona latarnia: wspólne ostatnie miejsce się liczy, wspólne 1. miejsce wszystkich nie
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:04:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:05:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001006', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:06:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001007', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:07:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001008', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:08:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001009', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:09:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001010', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:10:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:11:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:12:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:13:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:14:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:15:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001016', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:16:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001017', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:17:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001018', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:18:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001019', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:19:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001006', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001006', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001007', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001007', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001008', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001008', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001009', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001009', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001010', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001010', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 1, true, 10, true, null),
  ('00000000-0000-4000-f000-000000001011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001016', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001016', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001016', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001017', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001017', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001017', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001018', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001018', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001018', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001019', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001019', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000001019', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, true, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 3, 2, true, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['lantern-10', 'tie-top'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'lantern-10', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'tie-top', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'lantern-10', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'tie-top', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz) $$,
  'czerwona latarnia: wspólne ostatnie miejsce się liczy, wspólne 1. miejsce wszystkich nie');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- progi liczników: spotkania, partie, wygrane, punkty, serie, specjalista, latarnia
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000003', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000004', 'Spotkanie', '2025-01-10T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-10T18:00:00.000Z'::timestamptz, '2025-01-10T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000005', 'Spotkanie', '2025-01-11T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-11T18:00:00.000Z'::timestamptz, '2025-01-11T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000006', 'Spotkanie', '2025-01-12T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-12T18:00:00.000Z'::timestamptz, '2025-01-12T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000007', 'Spotkanie', '2025-01-13T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-13T18:00:00.000Z'::timestamptz, '2025-01-13T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000008', 'Spotkanie', '2025-01-14T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-14T18:00:00.000Z'::timestamptz, '2025-01-14T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000009', 'Spotkanie', '2025-01-15T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-15T18:00:00.000Z'::timestamptz, '2025-01-15T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000010', 'Spotkanie', '2025-01-16T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-16T18:00:00.000Z'::timestamptz, '2025-01-16T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000011', 'Spotkanie', '2025-01-17T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-17T18:00:00.000Z'::timestamptz, '2025-01-17T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000012', 'Spotkanie', '2025-01-18T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-18T18:00:00.000Z'::timestamptz, '2025-01-18T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000013', 'Spotkanie', '2025-01-19T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-19T18:00:00.000Z'::timestamptz, '2025-01-19T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000014', 'Spotkanie', '2025-01-20T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-20T18:00:00.000Z'::timestamptz, '2025-01-20T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000015', 'Spotkanie', '2025-01-21T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-21T18:00:00.000Z'::timestamptz, '2025-01-21T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000016', 'Spotkanie', '2025-01-22T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-22T18:00:00.000Z'::timestamptz, '2025-01-22T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000017', 'Spotkanie', '2025-01-23T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-23T18:00:00.000Z'::timestamptz, '2025-01-23T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000018', 'Spotkanie', '2025-01-24T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-24T18:00:00.000Z'::timestamptz, '2025-01-24T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000019', 'Spotkanie', '2025-01-25T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-25T18:00:00.000Z'::timestamptz, '2025-01-25T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000020', 'Spotkanie', '2025-01-26T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-26T18:00:00.000Z'::timestamptz, '2025-01-26T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000021', 'Spotkanie', '2025-01-27T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-27T18:00:00.000Z'::timestamptz, '2025-01-27T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000022', 'Spotkanie', '2025-01-28T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-28T18:00:00.000Z'::timestamptz, '2025-01-28T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000023', 'Spotkanie', '2025-01-29T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-29T18:00:00.000Z'::timestamptz, '2025-01-29T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000024', 'Spotkanie', '2025-01-30T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-30T18:00:00.000Z'::timestamptz, '2025-01-30T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000025', 'Spotkanie', '2025-01-31T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-31T18:00:00.000Z'::timestamptz, '2025-01-31T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000026', 'Spotkanie', '2025-02-01T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-01T18:00:00.000Z'::timestamptz, '2025-02-01T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000027', 'Spotkanie', '2025-02-02T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-02T18:00:00.000Z'::timestamptz, '2025-02-02T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000028', 'Spotkanie', '2025-02-03T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-03T18:00:00.000Z'::timestamptz, '2025-02-03T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000029', 'Spotkanie', '2025-02-04T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-04T18:00:00.000Z'::timestamptz, '2025-02-04T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000030', 'Spotkanie', '2025-02-05T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-05T18:00:00.000Z'::timestamptz, '2025-02-05T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000031', 'Spotkanie', '2025-02-06T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-06T18:00:00.000Z'::timestamptz, '2025-02-06T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000032', 'Spotkanie', '2025-02-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-07T18:00:00.000Z'::timestamptz, '2025-02-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000033', 'Spotkanie', '2025-02-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-08T18:00:00.000Z'::timestamptz, '2025-02-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000034', 'Spotkanie', '2025-02-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-09T18:00:00.000Z'::timestamptz, '2025-02-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000035', 'Spotkanie', '2025-02-10T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-10T18:00:00.000Z'::timestamptz, '2025-02-10T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000036', 'Spotkanie', '2025-02-11T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-11T18:00:00.000Z'::timestamptz, '2025-02-11T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000037', 'Spotkanie', '2025-02-12T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-12T18:00:00.000Z'::timestamptz, '2025-02-12T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000038', 'Spotkanie', '2025-02-13T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-13T18:00:00.000Z'::timestamptz, '2025-02-13T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000039', 'Spotkanie', '2025-02-14T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-14T18:00:00.000Z'::timestamptz, '2025-02-14T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000040', 'Spotkanie', '2025-02-15T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-15T18:00:00.000Z'::timestamptz, '2025-02-15T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000041', 'Spotkanie', '2025-02-16T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-16T18:00:00.000Z'::timestamptz, '2025-02-16T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000042', 'Spotkanie', '2025-02-17T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-17T18:00:00.000Z'::timestamptz, '2025-02-17T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000043', 'Spotkanie', '2025-02-18T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-18T18:00:00.000Z'::timestamptz, '2025-02-18T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000044', 'Spotkanie', '2025-02-19T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-19T18:00:00.000Z'::timestamptz, '2025-02-19T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000045', 'Spotkanie', '2025-02-20T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-20T18:00:00.000Z'::timestamptz, '2025-02-20T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000046', 'Spotkanie', '2025-02-21T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-21T18:00:00.000Z'::timestamptz, '2025-02-21T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000047', 'Spotkanie', '2025-02-22T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-22T18:00:00.000Z'::timestamptz, '2025-02-22T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000048', 'Spotkanie', '2025-02-23T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-23T18:00:00.000Z'::timestamptz, '2025-02-23T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000049', 'Spotkanie', '2025-02-24T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-24T18:00:00.000Z'::timestamptz, '2025-02-24T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000050', 'Spotkanie', '2025-02-25T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-25T18:00:00.000Z'::timestamptz, '2025-02-25T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-09T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000003002', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-09T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-10T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000004002', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-10T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-11T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000005002', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-11T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-12T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000006002', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-12T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-13T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000007002', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-13T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000008001', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-14T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000008002', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-14T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000009001', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-15T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000009002', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-15T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000010001', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-16T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000010002', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-16T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000011001', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-17T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000011002', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-17T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000012001', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-18T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000012002', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-18T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000013001', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-19T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000013002', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-19T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000014001', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-20T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000014002', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-20T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000015001', '00000000-0000-4000-c000-000000000015', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-21T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000015002', '00000000-0000-4000-c000-000000000015', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-21T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000016001', '00000000-0000-4000-c000-000000000016', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-22T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000016002', '00000000-0000-4000-c000-000000000016', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-22T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000017001', '00000000-0000-4000-c000-000000000017', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-23T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000017002', '00000000-0000-4000-c000-000000000017', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-23T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000018001', '00000000-0000-4000-c000-000000000018', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-24T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000018002', '00000000-0000-4000-c000-000000000018', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-24T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000019001', '00000000-0000-4000-c000-000000000019', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-25T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000019002', '00000000-0000-4000-c000-000000000019', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-25T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000020001', '00000000-0000-4000-c000-000000000020', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-26T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000020002', '00000000-0000-4000-c000-000000000020', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-26T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000021001', '00000000-0000-4000-c000-000000000021', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-27T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000021002', '00000000-0000-4000-c000-000000000021', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-27T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000022001', '00000000-0000-4000-c000-000000000022', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-28T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000022002', '00000000-0000-4000-c000-000000000022', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-28T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000023001', '00000000-0000-4000-c000-000000000023', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-29T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000023002', '00000000-0000-4000-c000-000000000023', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-29T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000024001', '00000000-0000-4000-c000-000000000024', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-30T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000024002', '00000000-0000-4000-c000-000000000024', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-30T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000025001', '00000000-0000-4000-c000-000000000025', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-31T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000025002', '00000000-0000-4000-c000-000000000025', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-31T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000026001', '00000000-0000-4000-c000-000000000026', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-01T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000026002', '00000000-0000-4000-c000-000000000026', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-01T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000027001', '00000000-0000-4000-c000-000000000027', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-02T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000027002', '00000000-0000-4000-c000-000000000027', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-02T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000028001', '00000000-0000-4000-c000-000000000028', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-03T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000028002', '00000000-0000-4000-c000-000000000028', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-03T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000029001', '00000000-0000-4000-c000-000000000029', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-04T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000029002', '00000000-0000-4000-c000-000000000029', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-04T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000030001', '00000000-0000-4000-c000-000000000030', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-05T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000030002', '00000000-0000-4000-c000-000000000030', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-05T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000031001', '00000000-0000-4000-c000-000000000031', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-06T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000031002', '00000000-0000-4000-c000-000000000031', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-06T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000032001', '00000000-0000-4000-c000-000000000032', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000032002', '00000000-0000-4000-c000-000000000032', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000033001', '00000000-0000-4000-c000-000000000033', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000033002', '00000000-0000-4000-c000-000000000033', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-08T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000034001', '00000000-0000-4000-c000-000000000034', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-09T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000034002', '00000000-0000-4000-c000-000000000034', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-09T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000035001', '00000000-0000-4000-c000-000000000035', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-10T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000035002', '00000000-0000-4000-c000-000000000035', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-10T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000036001', '00000000-0000-4000-c000-000000000036', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-11T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000036002', '00000000-0000-4000-c000-000000000036', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-11T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000037001', '00000000-0000-4000-c000-000000000037', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-12T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000037002', '00000000-0000-4000-c000-000000000037', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-12T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000038001', '00000000-0000-4000-c000-000000000038', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-13T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000038002', '00000000-0000-4000-c000-000000000038', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-13T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000039001', '00000000-0000-4000-c000-000000000039', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-14T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000039002', '00000000-0000-4000-c000-000000000039', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-14T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000040001', '00000000-0000-4000-c000-000000000040', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-15T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000040002', '00000000-0000-4000-c000-000000000040', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-15T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000041001', '00000000-0000-4000-c000-000000000041', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-16T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000041002', '00000000-0000-4000-c000-000000000041', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-16T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000042001', '00000000-0000-4000-c000-000000000042', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-17T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000042002', '00000000-0000-4000-c000-000000000042', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-17T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000043001', '00000000-0000-4000-c000-000000000043', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-18T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000043002', '00000000-0000-4000-c000-000000000043', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-18T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000044001', '00000000-0000-4000-c000-000000000044', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-19T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000044002', '00000000-0000-4000-c000-000000000044', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-19T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000045001', '00000000-0000-4000-c000-000000000045', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-20T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000045002', '00000000-0000-4000-c000-000000000045', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-20T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000046001', '00000000-0000-4000-c000-000000000046', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-21T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000046002', '00000000-0000-4000-c000-000000000046', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-21T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000047001', '00000000-0000-4000-c000-000000000047', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-22T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000047002', '00000000-0000-4000-c000-000000000047', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-22T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000048001', '00000000-0000-4000-c000-000000000048', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-23T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000048002', '00000000-0000-4000-c000-000000000048', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-23T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000049001', '00000000-0000-4000-c000-000000000049', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-24T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000049002', '00000000-0000-4000-c000-000000000049', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-24T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000050001', '00000000-0000-4000-c000-000000000050', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-25T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000050002', '00000000-0000-4000-c000-000000000050', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-02-25T18:02:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000003002', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000003002', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000004002', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000004002', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000005002', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000005002', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000006002', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000006002', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000007002', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000007002', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000008001', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000008001', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000008002', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000008002', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000009001', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000009001', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000009002', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000009002', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000010001', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000010001', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000010002', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000010002', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000011001', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000011001', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000011002', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000011002', '00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000012001', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000012001', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000012002', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000012002', '00000000-0000-4000-c000-000000000012', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000013001', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000013001', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000013002', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000013002', '00000000-0000-4000-c000-000000000013', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000014001', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000014001', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000014002', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000014002', '00000000-0000-4000-c000-000000000014', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000015001', '00000000-0000-4000-c000-000000000015', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000015001', '00000000-0000-4000-c000-000000000015', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000015002', '00000000-0000-4000-c000-000000000015', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000015002', '00000000-0000-4000-c000-000000000015', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000016001', '00000000-0000-4000-c000-000000000016', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000016001', '00000000-0000-4000-c000-000000000016', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000016002', '00000000-0000-4000-c000-000000000016', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000016002', '00000000-0000-4000-c000-000000000016', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000017001', '00000000-0000-4000-c000-000000000017', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000017001', '00000000-0000-4000-c000-000000000017', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000017002', '00000000-0000-4000-c000-000000000017', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000017002', '00000000-0000-4000-c000-000000000017', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000018001', '00000000-0000-4000-c000-000000000018', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000018001', '00000000-0000-4000-c000-000000000018', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000018002', '00000000-0000-4000-c000-000000000018', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000018002', '00000000-0000-4000-c000-000000000018', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000019001', '00000000-0000-4000-c000-000000000019', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000019001', '00000000-0000-4000-c000-000000000019', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000019002', '00000000-0000-4000-c000-000000000019', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000019002', '00000000-0000-4000-c000-000000000019', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000020001', '00000000-0000-4000-c000-000000000020', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000020001', '00000000-0000-4000-c000-000000000020', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000020002', '00000000-0000-4000-c000-000000000020', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000020002', '00000000-0000-4000-c000-000000000020', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000021001', '00000000-0000-4000-c000-000000000021', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000021001', '00000000-0000-4000-c000-000000000021', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000021002', '00000000-0000-4000-c000-000000000021', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000021002', '00000000-0000-4000-c000-000000000021', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000022001', '00000000-0000-4000-c000-000000000022', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000022001', '00000000-0000-4000-c000-000000000022', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000022002', '00000000-0000-4000-c000-000000000022', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000022002', '00000000-0000-4000-c000-000000000022', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000023001', '00000000-0000-4000-c000-000000000023', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000023001', '00000000-0000-4000-c000-000000000023', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000023002', '00000000-0000-4000-c000-000000000023', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000023002', '00000000-0000-4000-c000-000000000023', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000024001', '00000000-0000-4000-c000-000000000024', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000024001', '00000000-0000-4000-c000-000000000024', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000024002', '00000000-0000-4000-c000-000000000024', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000024002', '00000000-0000-4000-c000-000000000024', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000025001', '00000000-0000-4000-c000-000000000025', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000025001', '00000000-0000-4000-c000-000000000025', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000025002', '00000000-0000-4000-c000-000000000025', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000025002', '00000000-0000-4000-c000-000000000025', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000026001', '00000000-0000-4000-c000-000000000026', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000026001', '00000000-0000-4000-c000-000000000026', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000026002', '00000000-0000-4000-c000-000000000026', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000026002', '00000000-0000-4000-c000-000000000026', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000027001', '00000000-0000-4000-c000-000000000027', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000027001', '00000000-0000-4000-c000-000000000027', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000027002', '00000000-0000-4000-c000-000000000027', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000027002', '00000000-0000-4000-c000-000000000027', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000028001', '00000000-0000-4000-c000-000000000028', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000028001', '00000000-0000-4000-c000-000000000028', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000028002', '00000000-0000-4000-c000-000000000028', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000028002', '00000000-0000-4000-c000-000000000028', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000029001', '00000000-0000-4000-c000-000000000029', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000029001', '00000000-0000-4000-c000-000000000029', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000029002', '00000000-0000-4000-c000-000000000029', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000029002', '00000000-0000-4000-c000-000000000029', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000030001', '00000000-0000-4000-c000-000000000030', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000030001', '00000000-0000-4000-c000-000000000030', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000030002', '00000000-0000-4000-c000-000000000030', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000030002', '00000000-0000-4000-c000-000000000030', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000031001', '00000000-0000-4000-c000-000000000031', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000031001', '00000000-0000-4000-c000-000000000031', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000031002', '00000000-0000-4000-c000-000000000031', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000031002', '00000000-0000-4000-c000-000000000031', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000032001', '00000000-0000-4000-c000-000000000032', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000032001', '00000000-0000-4000-c000-000000000032', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000032002', '00000000-0000-4000-c000-000000000032', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000032002', '00000000-0000-4000-c000-000000000032', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000033001', '00000000-0000-4000-c000-000000000033', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000033001', '00000000-0000-4000-c000-000000000033', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000033002', '00000000-0000-4000-c000-000000000033', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000033002', '00000000-0000-4000-c000-000000000033', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000034001', '00000000-0000-4000-c000-000000000034', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000034001', '00000000-0000-4000-c000-000000000034', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000034002', '00000000-0000-4000-c000-000000000034', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000034002', '00000000-0000-4000-c000-000000000034', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000035001', '00000000-0000-4000-c000-000000000035', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000035001', '00000000-0000-4000-c000-000000000035', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000035002', '00000000-0000-4000-c000-000000000035', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000035002', '00000000-0000-4000-c000-000000000035', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000036001', '00000000-0000-4000-c000-000000000036', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000036001', '00000000-0000-4000-c000-000000000036', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000036002', '00000000-0000-4000-c000-000000000036', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000036002', '00000000-0000-4000-c000-000000000036', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000037001', '00000000-0000-4000-c000-000000000037', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000037001', '00000000-0000-4000-c000-000000000037', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000037002', '00000000-0000-4000-c000-000000000037', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000037002', '00000000-0000-4000-c000-000000000037', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000038001', '00000000-0000-4000-c000-000000000038', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000038001', '00000000-0000-4000-c000-000000000038', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000038002', '00000000-0000-4000-c000-000000000038', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000038002', '00000000-0000-4000-c000-000000000038', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000039001', '00000000-0000-4000-c000-000000000039', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000039001', '00000000-0000-4000-c000-000000000039', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000039002', '00000000-0000-4000-c000-000000000039', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000039002', '00000000-0000-4000-c000-000000000039', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000040001', '00000000-0000-4000-c000-000000000040', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000040001', '00000000-0000-4000-c000-000000000040', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000040002', '00000000-0000-4000-c000-000000000040', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000040002', '00000000-0000-4000-c000-000000000040', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000041001', '00000000-0000-4000-c000-000000000041', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000041001', '00000000-0000-4000-c000-000000000041', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000041002', '00000000-0000-4000-c000-000000000041', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000041002', '00000000-0000-4000-c000-000000000041', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000042001', '00000000-0000-4000-c000-000000000042', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000042001', '00000000-0000-4000-c000-000000000042', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000042002', '00000000-0000-4000-c000-000000000042', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000042002', '00000000-0000-4000-c000-000000000042', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000043001', '00000000-0000-4000-c000-000000000043', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000043001', '00000000-0000-4000-c000-000000000043', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000043002', '00000000-0000-4000-c000-000000000043', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000043002', '00000000-0000-4000-c000-000000000043', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000044001', '00000000-0000-4000-c000-000000000044', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000044001', '00000000-0000-4000-c000-000000000044', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000044002', '00000000-0000-4000-c000-000000000044', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000044002', '00000000-0000-4000-c000-000000000044', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000045001', '00000000-0000-4000-c000-000000000045', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000045001', '00000000-0000-4000-c000-000000000045', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000045002', '00000000-0000-4000-c000-000000000045', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000045002', '00000000-0000-4000-c000-000000000045', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000046001', '00000000-0000-4000-c000-000000000046', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000046001', '00000000-0000-4000-c000-000000000046', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000046002', '00000000-0000-4000-c000-000000000046', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000046002', '00000000-0000-4000-c000-000000000046', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000047001', '00000000-0000-4000-c000-000000000047', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000047001', '00000000-0000-4000-c000-000000000047', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000047002', '00000000-0000-4000-c000-000000000047', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000047002', '00000000-0000-4000-c000-000000000047', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000048001', '00000000-0000-4000-c000-000000000048', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000048001', '00000000-0000-4000-c000-000000000048', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000048002', '00000000-0000-4000-c000-000000000048', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000048002', '00000000-0000-4000-c000-000000000048', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000049001', '00000000-0000-4000-c000-000000000049', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000049001', '00000000-0000-4000-c000-000000000049', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000049002', '00000000-0000-4000-c000-000000000049', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000049002', '00000000-0000-4000-c000-000000000049', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000050001', '00000000-0000-4000-c000-000000000050', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000050001', '00000000-0000-4000-c000-000000000050', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000050002', '00000000-0000-4000-c000-000000000050', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000050002', '00000000-0000-4000-c000-000000000050', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['meet-1', 'meet-10', 'meet-25', 'meet-50', 'play-10', 'play-50', 'play-100', 'win-1', 'win-10', 'win-50', 'pts-100', 'pts-500', 'streak-3', 'streak-5', 'streak-10', 'specialist', 'lantern-10', 'marathon', 'hattrick'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'meet-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'meet-10', '00000000-0000-4000-c000-000000000010'::uuid, '00000000-0000-4000-f000-000000010001'::uuid, '2025-01-16T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'meet-25', '00000000-0000-4000-c000-000000000025'::uuid, '00000000-0000-4000-f000-000000025001'::uuid, '2025-01-31T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'meet-50', '00000000-0000-4000-c000-000000000050'::uuid, '00000000-0000-4000-f000-000000050001'::uuid, '2025-02-25T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'play-10', '00000000-0000-4000-c000-000000000005'::uuid, '00000000-0000-4000-f000-000000005002'::uuid, '2025-01-11T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'play-100', '00000000-0000-4000-c000-000000000050'::uuid, '00000000-0000-4000-f000-000000050002'::uuid, '2025-02-25T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'play-50', '00000000-0000-4000-c000-000000000025'::uuid, '00000000-0000-4000-f000-000000025002'::uuid, '2025-01-31T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'pts-100', '00000000-0000-4000-c000-000000000005'::uuid, '00000000-0000-4000-f000-000000005002'::uuid, '2025-01-11T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'pts-500', '00000000-0000-4000-c000-000000000025'::uuid, '00000000-0000-4000-f000-000000025002'::uuid, '2025-01-31T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'specialist', '00000000-0000-4000-c000-000000000005'::uuid, '00000000-0000-4000-f000-000000005002'::uuid, '2025-01-11T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'streak-10', '00000000-0000-4000-c000-000000000010'::uuid, '00000000-0000-4000-f000-000000010001'::uuid, '2025-01-16T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'streak-3', '00000000-0000-4000-c000-000000000003'::uuid, '00000000-0000-4000-f000-000000003001'::uuid, '2025-01-09T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'streak-5', '00000000-0000-4000-c000-000000000005'::uuid, '00000000-0000-4000-f000-000000005001'::uuid, '2025-01-11T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'win-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'win-10', '00000000-0000-4000-c000-000000000005'::uuid, '00000000-0000-4000-f000-000000005002'::uuid, '2025-01-11T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'win-50', '00000000-0000-4000-c000-000000000025'::uuid, '00000000-0000-4000-f000-000000025002'::uuid, '2025-01-31T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'lantern-10', '00000000-0000-4000-c000-000000000005'::uuid, '00000000-0000-4000-f000-000000005002'::uuid, '2025-01-11T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'meet-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'meet-10', '00000000-0000-4000-c000-000000000010'::uuid, '00000000-0000-4000-f000-000000010001'::uuid, '2025-01-16T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'meet-25', '00000000-0000-4000-c000-000000000025'::uuid, '00000000-0000-4000-f000-000000025001'::uuid, '2025-01-31T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'meet-50', '00000000-0000-4000-c000-000000000050'::uuid, '00000000-0000-4000-f000-000000050001'::uuid, '2025-02-25T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'play-10', '00000000-0000-4000-c000-000000000005'::uuid, '00000000-0000-4000-f000-000000005002'::uuid, '2025-01-11T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'play-100', '00000000-0000-4000-c000-000000000050'::uuid, '00000000-0000-4000-f000-000000050002'::uuid, '2025-02-25T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'play-50', '00000000-0000-4000-c000-000000000025'::uuid, '00000000-0000-4000-f000-000000025002'::uuid, '2025-01-31T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'pts-100', '00000000-0000-4000-c000-000000000009'::uuid, '00000000-0000-4000-f000-000000009001'::uuid, '2025-01-15T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'pts-500', '00000000-0000-4000-c000-000000000042'::uuid, '00000000-0000-4000-f000-000000042002'::uuid, '2025-02-17T18:00:00.000Z'::timestamptz) $$,
  'progi liczników: spotkania, partie, wygrane, punkty, serie, specjalista, latarnia');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- punkty: próg „co najmniej” przekroczony w jednej partii
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 60, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 0, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, false, 45, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 2, false, 0, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['pts-100'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'pts-100', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz) $$,
  'punkty: próg „co najmniej” przekroczony w jednej partii');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- maratończyk, hat-trick i bez skazy w jednym spotkaniu
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:04:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:05:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:03:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['marathon', 'hattrick', 'flawless'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'hattrick', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001004'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'marathon', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001005'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'marathon', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001005'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000103'::uuid, 'flawless', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002003'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000103'::uuid, 'hattrick', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002003'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz) $$,
  'maratończyk, hat-trick i bez skazy w jednym spotkaniu');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- bez skazy: co najmniej 3 partie i dopiero po zakończeniu spotkania
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'in_progress', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, null);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:03:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select is_empty(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['flawless'])
      order by profile_id, achievement_id $$,
  'bez skazy: co najmniej 3 partie i dopiero po zakończeniu spotkania');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- serie: nieobecność nie przerywa, porażka zeruje, +1 najwyżej raz na spotkanie
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000003', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000004', 'Spotkanie', '2025-01-10T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-10T18:00:00.000Z'::timestamptz, '2025-01-10T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000005', 'Spotkanie', '2025-01-11T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-11T18:00:00.000Z'::timestamptz, '2025-01-11T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000006', 'Spotkanie', '2025-01-12T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-12T18:00:00.000Z'::timestamptz, '2025-01-12T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000007', 'Spotkanie', '2025-01-13T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-13T18:00:00.000Z'::timestamptz, '2025-01-13T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-09T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-10T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000004002', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-10T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-11T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-12T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-13T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000004002', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000004002', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['streak-3', 'streak-5', 'comeback'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'comeback', '00000000-0000-4000-c000-000000000006'::uuid, '00000000-0000-4000-f000-000000006001'::uuid, '2025-01-12T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'streak-3', '00000000-0000-4000-c000-000000000004'::uuid, '00000000-0000-4000-f000-000000004002'::uuid, '2025-01-10T18:00:00.000Z'::timestamptz) $$,
  'serie: nieobecność nie przerywa, porażka zeruje, +1 najwyżej raz na spotkanie');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- powrót z popiołów: wygrana na pierwszym spotkaniu gracza po przerwaniu serii ≥ 3
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000003', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000004', 'Spotkanie', '2025-01-10T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-10T18:00:00.000Z'::timestamptz, '2025-01-10T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000005', 'Spotkanie', '2025-01-11T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-11T18:00:00.000Z'::timestamptz, '2025-01-11T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000006', 'Spotkanie', '2025-01-12T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-12T18:00:00.000Z'::timestamptz, '2025-01-12T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000007', 'Spotkanie', '2025-01-13T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-13T18:00:00.000Z'::timestamptz, '2025-01-13T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000008', 'Spotkanie', '2025-01-14T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-14T18:00:00.000Z'::timestamptz, '2025-01-14T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000009', 'Spotkanie', '2025-01-15T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-15T18:00:00.000Z'::timestamptz, '2025-01-15T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000010', 'Spotkanie', '2025-01-16T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-16T18:00:00.000Z'::timestamptz, '2025-01-16T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-09T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-10T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-11T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-12T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000006002', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-12T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-13T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000008001', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-14T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000009001', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-15T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000010001', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-16T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000103', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000006002', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000006002', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000007001', '00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000008001', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000008001', '00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000009001', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000009001', '00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000103', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000010001', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000010001', '00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['comeback'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'comeback', '00000000-0000-4000-c000-000000000006'::uuid, '00000000-0000-4000-f000-000000006002'::uuid, '2025-01-12T18:00:00.000Z'::timestamptz) $$,
  'powrót z popiołów: wygrana na pierwszym spotkaniu gracza po przerwaniu serii ≥ 3');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- powrót z popiołów: przegrane spotkanie po przerwaniu serii zamyka szansę
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000003', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000004', 'Spotkanie', '2025-01-10T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-10T18:00:00.000Z'::timestamptz, '2025-01-10T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000005', 'Spotkanie', '2025-01-11T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-11T18:00:00.000Z'::timestamptz, '2025-01-11T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000006', 'Spotkanie', '2025-01-12T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-12T18:00:00.000Z'::timestamptz, '2025-01-12T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-09T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-10T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-11T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-12T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000005001', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000006001', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select is_empty(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['comeback'])
      order by profile_id, achievement_id $$,
  'powrót z popiołów: przegrane spotkanie po przerwaniu serii zamyka szansę');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- różnorodność: odkrywca, wszechstronny
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-e000-000000000021', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-e000-000000000031', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000004', '00000000-0000-4000-e000-000000000041', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:04:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000005', '00000000-0000-4000-e000-000000000051', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:05:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000006', '00000000-0000-4000-e000-000000000061', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000007', '00000000-0000-4000-e000-000000000071', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000008', '00000000-0000-4000-e000-000000000081', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002004', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000009', '00000000-0000-4000-e000-000000000091', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:04:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002005', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000010', '00000000-0000-4000-e000-000000000101', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:05:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002004', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002004', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002005', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002005', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['explorer-10', 'versatile-5', 'beginners-luck'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'beginners-luck', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'explorer-10', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002005'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'versatile-5', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001005'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'beginners-luck', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'explorer-10', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002005'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'versatile-5', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002005'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz) $$,
  'różnorodność: odkrywca, wszechstronny');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- ludoznawca: 25 różnych gier, powtórki się nie liczą
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-e000-000000000021', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-e000-000000000031', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000004', '00000000-0000-4000-e000-000000000041', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:04:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000005', '00000000-0000-4000-e000-000000000051', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:05:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001006', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000006', '00000000-0000-4000-e000-000000000061', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:06:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001007', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000007', '00000000-0000-4000-e000-000000000071', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:07:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001008', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000008', '00000000-0000-4000-e000-000000000081', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:08:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001009', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000009', '00000000-0000-4000-e000-000000000091', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:09:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001010', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000010', '00000000-0000-4000-e000-000000000101', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:10:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000011', '00000000-0000-4000-e000-000000000111', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:11:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000012', '00000000-0000-4000-e000-000000000121', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:12:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000013', '00000000-0000-4000-e000-000000000131', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:13:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000014', '00000000-0000-4000-e000-000000000141', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:14:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000015', '00000000-0000-4000-e000-000000000151', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:15:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001016', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000016', '00000000-0000-4000-e000-000000000161', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:16:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001017', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000017', '00000000-0000-4000-e000-000000000171', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:17:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001018', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000018', '00000000-0000-4000-e000-000000000181', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:18:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001019', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000019', '00000000-0000-4000-e000-000000000191', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:19:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001020', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000020', '00000000-0000-4000-e000-000000000201', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:20:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000021', '00000000-0000-4000-e000-000000000211', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000022', '00000000-0000-4000-e000-000000000221', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002004', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000023', '00000000-0000-4000-e000-000000000231', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:04:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002005', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000024', '00000000-0000-4000-e000-000000000241', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:05:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002006', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000025', '00000000-0000-4000-e000-000000000251', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:06:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001005', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001006', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001006', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001007', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001007', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001008', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001008', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001009', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001009', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001010', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001010', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001011', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001012', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001013', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001014', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001015', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001016', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001016', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001017', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001017', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001018', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001018', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001019', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001019', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001020', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001020', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002003', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002004', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002004', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002005', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002005', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002006', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002006', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['explorer-25'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'explorer-25', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002006'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'explorer-25', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002006'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz) $$,
  'ludoznawca: 25 różnych gier, powtórki się nie liczą');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- wielki stół: co najmniej 6 graczy
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 3, 3, false, 4, false, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000104', 4, 4, false, 2, false, null),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000105', 5, 5, false, 1, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000104', 3, 3, false, 4, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000105', 4, 4, false, 2, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000106', 5, 5, false, 1, false, null),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000107', 6, 6, false, 0, false, null);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['big-table'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000102'::uuid, 'big-table', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000103'::uuid, 'big-table', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000104'::uuid, 'big-table', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000105'::uuid, 'big-table', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000106'::uuid, 'big-table', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000107'::uuid, 'big-table', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz) $$,
  'wielki stół: co najmniej 6 graczy');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- rekord: lepszy od wszystkich wcześniejszych partii, nie pierwsza partia, nie wyrównanie
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-e000-000000000021', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:02:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, 50),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, 40),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, 50),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, 30),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, true, 8, true, 70),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000103', 2, 1, true, 8, true, 70),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 3, 3, false, 4, false, 60),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, 80),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 2, 2, false, 6, false, null),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000103', 1, 1, false, 10, true, 5),
  ('00000000-0000-4000-f000-000000002002', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, 1);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['record'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'record', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001003'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'record', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000103'::uuid, 'record', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001003'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz) $$,
  'rekord: lepszy od wszystkich wcześniejszych partii, nie pierwsza partia, nie wyrównanie');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- rekord: „mniej = lepiej” i osobny rekord dla innego kierunku notesu
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000012', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000012', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:02:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:03:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-07T18:04:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, 30),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, 35),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, 28),
  ('00000000-0000-4000-f000-000000001002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, 31),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, 10),
  ('00000000-0000-4000-f000-000000001003', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, 5),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, 12),
  ('00000000-0000-4000-f000-000000001004', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, 1);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['record'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'record', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001004'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'record', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001002'::uuid, '2025-01-07T18:00:00.000Z'::timestamptz) $$,
  'rekord: „mniej = lepiej” i osobny rekord dla innego kierunku notesu');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- kolejność zdarzeń: termin spotkania, potem id; partie po zapisie
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-16T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-16T18:00:00.000Z'::timestamptz, '2025-01-16T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000003', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000004', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz);
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-16T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-08T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-09T18:01:00.000Z'::timestamptz),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000011', 'saved', '{10,6,4,2,1,0,0,0}', '00000000-0000-4000-a000-000000000001', '2025-01-09T18:01:00.000Z'::timestamptz);
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value) values
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101', 1, 1, false, 10, true, 9),
  ('00000000-0000-4000-f000-000000001001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102', 2, 2, false, 6, false, 1),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, 5),
  ('00000000-0000-4000-f000-000000002001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, 4),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, 6),
  ('00000000-0000-4000-f000-000000003001', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, 1),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102', 1, 1, false, 10, true, 6),
  ('00000000-0000-4000-f000-000000004001', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101', 2, 2, false, 6, false, 1);
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['win-1', 'beginners-luck', 'streak-3', 'record'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'record', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-16T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000101'::uuid, 'win-1', '00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-f000-000000001001'::uuid, '2025-01-16T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'beginners-luck', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'record', '00000000-0000-4000-c000-000000000003'::uuid, '00000000-0000-4000-f000-000000003001'::uuid, '2025-01-09T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'streak-3', '00000000-0000-4000-c000-000000000004'::uuid, '00000000-0000-4000-f000-000000004001'::uuid, '2025-01-09T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'win-1', '00000000-0000-4000-c000-000000000002'::uuid, '00000000-0000-4000-f000-000000002001'::uuid, '2025-01-08T18:00:00.000Z'::timestamptz) $$,
  'kolejność zdarzeń: termin spotkania, potem id; partie po zapisie');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- głos ludu: 10 różnych głosowań, data dziesiątego spotkania; bez partii też
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000003', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000004', 'Spotkanie', '2025-01-10T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-10T18:00:00.000Z'::timestamptz, '2025-01-10T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000005', 'Spotkanie', '2025-01-11T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-11T18:00:00.000Z'::timestamptz, '2025-01-11T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000006', 'Spotkanie', '2025-01-12T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-12T18:00:00.000Z'::timestamptz, '2025-01-12T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000007', 'Spotkanie', '2025-01-13T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-13T18:00:00.000Z'::timestamptz, '2025-01-13T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000008', 'Spotkanie', '2025-01-14T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-14T18:00:00.000Z'::timestamptz, '2025-01-14T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000009', 'Spotkanie', '2025-01-15T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-15T18:00:00.000Z'::timestamptz, '2025-01-15T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000010', 'Spotkanie', '2025-02-05T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-02-05T18:00:00.000Z'::timestamptz, '2025-02-05T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000011', 'Spotkanie', '2025-01-26T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-26T18:00:00.000Z'::timestamptz, '2025-01-26T18:00:00.000Z'::timestamptz);
insert into private.meeting_voters (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000010', '00000000-0000-4000-a000-000000000102'),
  ('00000000-0000-4000-c000-000000000011', '00000000-0000-4000-a000-000000000101');
select private.recalculate_achievements();
select results_eq(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['voter-10'])
      order by profile_id, achievement_id $$,
  $$ values ('00000000-0000-4000-a000-000000000101'::uuid, 'voter-10', '00000000-0000-4000-c000-000000000011'::uuid, null::uuid, '2025-01-26T18:00:00.000Z'::timestamptz),
             ('00000000-0000-4000-a000-000000000102'::uuid, 'voter-10', '00000000-0000-4000-c000-000000000010'::uuid, null::uuid, '2025-02-05T18:00:00.000Z'::timestamptz) $$,
  'głos ludu: 10 różnych głosowań, data dziesiątego spotkania; bez partii też');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

-- głos ludu: 9 głosowań to za mało
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2025-01-07T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-07T18:00:00.000Z'::timestamptz, '2025-01-07T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie', '2025-01-08T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-08T18:00:00.000Z'::timestamptz, '2025-01-08T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000003', 'Spotkanie', '2025-01-09T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-09T18:00:00.000Z'::timestamptz, '2025-01-09T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000004', 'Spotkanie', '2025-01-10T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-10T18:00:00.000Z'::timestamptz, '2025-01-10T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000005', 'Spotkanie', '2025-01-11T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-11T18:00:00.000Z'::timestamptz, '2025-01-11T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000006', 'Spotkanie', '2025-01-12T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-12T18:00:00.000Z'::timestamptz, '2025-01-12T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000007', 'Spotkanie', '2025-01-13T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-13T18:00:00.000Z'::timestamptz, '2025-01-13T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000008', 'Spotkanie', '2025-01-14T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-14T18:00:00.000Z'::timestamptz, '2025-01-14T18:00:00.000Z'::timestamptz),
  ('00000000-0000-4000-c000-000000000009', 'Spotkanie', '2025-01-15T18:00:00.000Z'::timestamptz, 'finished', false, '00000000-0000-4000-a000-000000000001', '2025-01-15T18:00:00.000Z'::timestamptz, '2025-01-15T18:00:00.000Z'::timestamptz);
insert into private.meeting_voters (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000007', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000008', '00000000-0000-4000-a000-000000000101'),
  ('00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000101');
select private.recalculate_achievements();
select is_empty(
  $$ select profile_id, achievement_id, meeting_id, play_id, unlocked_at from public.achievement_unlocks
      where achievement_id = any (array['voter-10'])
      order by profile_id, achievement_id $$,
  'głos ludu: 9 głosowań to za mało');
delete from public.achievement_unlocks;
delete from private.meeting_voters;
delete from public.play_results;
delete from public.plays;
delete from public.meetings;

select * from finish();
rollback;
