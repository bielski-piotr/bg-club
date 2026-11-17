-- [012] Kolekcja gier (PRD GAME-1…GAME-6, GAME-8, GAME-9) z perspektywy klienta: zapis tylko
-- admin, wyszukiwanie bez wielkości liter i polskich znaków, kolejność widżetu, miękkie
-- usunięcie. Snapshot punktacji partii przy rozpoczęciu (GAME-9) sprawdza 030_plays.
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

set constraints all immediate;

select plan(32);

-- a001 Ada: admin; a002 Bartek: gracz.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player');

-- =============================================================================================
-- Zapis: tylko admin (GAME-3), walidacja w bazie (GAME-4, GAME-5)
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.games (title, min_players, max_players, placement_points, complexity)
     values ('Gra Bartka', 2, 2, '{1,0}', 2) $$,
  '42501', null, 'gracz: nie dodaje gry');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.games (id, title, min_players, max_players, placement_points, cover_path, complexity) values
     ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}', 'games/zolwie.webp', 1.5),
     ('00000000-0000-4000-b000-000000000002', 'Łąka i Pszczoły', 1, 1, '{5}', null, 2),
     ('00000000-0000-4000-b000-000000000003', 'Gra 100% losowa', 2, 3, '{3,2,1}', null, 1),
     ('00000000-0000-4000-b000-000000000004', 'Gra_testowa', 2, 2, '{1,0}', null, 3.25) $$,
  'admin: dodaje gry z okładką i bez (GAME-3, GAME-6)');
select lives_ok(
  $$ insert into public.games (id, title, min_players, max_players, placement_points, complexity) values
     ('00000000-0000-4000-b000-000000000005', 'Wielka Gra', 2, 30,
      array_fill(0, array[30]), 4) $$,
  'admin: bez górnego limitu graczy (GAME-4)');
select throws_ok(
  $$ insert into public.games (title, min_players, max_players, placement_points, complexity)
     values ('Zły zakres', 3, 2, '{1,0}', 2) $$,
  '23514', null, 'min > max jest odrzucane (GAME-4)');
select throws_ok(
  $$ update public.games set max_players = 5 where id = '00000000-0000-4000-b000-000000000001' $$,
  '23514', null, 'zmiana max bez punktów dla każdego miejsca jest odrzucana (GAME-5)');
select lives_ok(
  $$ update public.games set max_players = 5, placement_points = '{0,2,4,6,8}', title = 'Żółwie Wyścigi 2'
      where id = '00000000-0000-4000-b000-000000000001' $$,
  'admin: rosnąca punktacja jest dozwolona (tylko ostrzeżenie w formularzu, GAME-5)');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

update public.games set title = 'Przejęta' where id = '00000000-0000-4000-b000-000000000002';
update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000002';
select results_eq(
  $$ select title, deleted_at is null from public.games where id = '00000000-0000-4000-b000-000000000002' $$,
  $$ values ('Łąka i Pszczoły', true) $$,
  'gracz: nie edytuje ani nie usuwa gry (RLS nie obejmuje wiersza)');

-- =============================================================================================
-- Wyszukiwanie (GAME-2)
-- =============================================================================================
select results_eq(
  $$ select title from public.search_games('ZOLW') $$,
  $$ values ('Żółwie Wyścigi 2') $$,
  'gracz: „ZOLW” znajduje „Żółwie Wyścigi” (wielkość liter, polskie znaki)');
select results_eq(
  $$ select title from public.search_games('  łąka ') $$,
  $$ values ('Łąka i Pszczoły') $$,
  'zapytanie z polskimi znakami i spacjami na brzegach');
select results_eq(
  $$ select title from public.search_games('lak') $$,
  $$ values ('Łąka i Pszczoły') $$,
  'fragment tytułu bez polskich znaków („lak” → „Łąka”)');
select results_eq(
  $$ select title from public.search_games('%') $$,
  $$ values ('Gra 100% losowa') $$,
  '„%” jest znakiem dosłownym, nie wzorcem');
select results_eq(
  $$ select title from public.search_games('_') $$,
  $$ values ('Gra_testowa') $$,
  '„_” jest znakiem dosłownym, nie wzorcem');
select is_empty(
  $$ select 1 from public.search_games('szachy') $$,
  'brak wyników dla nieznanego tytułu');
select results_eq(
  $$ select title from public.search_games('') $$,
  $$ values ('Gra 100% losowa'), ('Gra_testowa'), ('Łąka i Pszczoły'), ('Wielka Gra'),
            ('Żółwie Wyścigi 2') $$,
  'puste zapytanie: cała kolekcja według tytułu bez polskich znaków');
select is(
  (select count(*)::int from public.search_games()),
  5,
  'bez argumentu: cała kolekcja');

reset role;

-- =============================================================================================
-- Kolejność widżetu: ostatnio grane, potem ostatnio dodane (GAME-1, Q11)
-- =============================================================================================
-- Daty dodania: b001 najstarsza … b005 najnowsza.
update public.games g set created_at = timestamptz '2026-10-01 12:00+00' + (n || ' days')::interval
  from (values ('00000000-0000-4000-b000-000000000001'::uuid, 1),
               ('00000000-0000-4000-b000-000000000002'::uuid, 2),
               ('00000000-0000-4000-b000-000000000003'::uuid, 3),
               ('00000000-0000-4000-b000-000000000004'::uuid, 4),
               ('00000000-0000-4000-b000-000000000005'::uuid, 5)) v(id, n)
 where g.id = v.id;

insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes żółwi'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Notes łąki'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000003', 'Notes losowy');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', '{"version": 2}', 4),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000002', '{"version": 2}', 4),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000003', '{"version": 2}', 4);

-- c001 zaplanowane z otwartym głosowaniem, c002 zakończone.
insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Grudniowe granie', '2026-12-04 17:00+00',
   '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Listopadowe granie', '2026-11-06 17:00+00',
   '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select m, p from (values ('00000000-0000-4000-c000-000000000001'::uuid),
                         ('00000000-0000-4000-c000-000000000002'::uuid)) ms(m),
                 (values ('00000000-0000-4000-a000-000000000001'::uuid),
                         ('00000000-0000-4000-a000-000000000002'::uuid)) ps(p);
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002');
insert into public.meeting_games (meeting_id, game_id, position) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 0),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000003', 1),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 0);
update public.meetings set voting_open = false, status = 'in_progress', started_at = '2026-11-06 17:00+00'
 where id = '00000000-0000-4000-c000-000000000002';
update public.meetings set status = 'finished', finished_at = '2026-11-06 22:00+00'
 where id = '00000000-0000-4000-c000-000000000002';

-- Partie z historią: wyzwalacze partii (status spotkania, snapshot, czas zapisu) są tu
-- wyłączone, żeby ustawić daty zapisu wprost. Klucze obce działają.
alter table public.plays disable trigger user;
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot,
                          started_by, started_at, saved_at, sheet) values
  -- b001 grana 1 listopada, b002 grana 6 listopada (później), b003 tylko szkic (nie liczy się).
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000002',
   '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000001', 'saved',
   '{10,6,4,2}', '00000000-0000-4000-a000-000000000001', '2026-11-01 18:00+00', '2026-11-01 19:00+00', '{}'),
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000002',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-e000-000000000002', 'saved',
   '{5}', '00000000-0000-4000-a000-000000000001', '2026-11-06 18:00+00', '2026-11-06 19:00+00', '{}'),
  ('00000000-0000-4000-f000-000000000003', '00000000-0000-4000-c000-000000000002',
   '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-e000-000000000003', 'draft',
   '{3,2,1}', '00000000-0000-4000-a000-000000000001', '2026-11-06 20:00+00', null, null);
alter table public.plays enable trigger user;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select results_eq(
  $$ select title, last_played_at from public.game_collection
      order by last_played_at desc nulls last, created_at desc, id limit 5 $$,
  $$ values ('Łąka i Pszczoły', '2026-11-06 19:00+00'::timestamptz),
            ('Żółwie Wyścigi 2', '2026-11-01 19:00+00'::timestamptz),
            ('Wielka Gra', null::timestamptz),
            ('Gra_testowa', null::timestamptz),
            ('Gra 100% losowa', null::timestamptz) $$,
  'gracz: widżet: grane według ostatniej partii, potem dodane według daty (szkic się nie liczy)');

reset role;

-- =============================================================================================
-- Miękkie usunięcie (GAME-8) i niezmienność historii (GAME-9)
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ update public.games set deleted_at = '2000-01-01'
      where id = '00000000-0000-4000-b000-000000000001' and deleted_at is null $$,
  'admin: usuwa grę (miękko)');
select is(
  (select deleted_at from public.games where id = '00000000-0000-4000-b000-000000000001'),
  now(),
  'znacznik usunięcia nadaje baza, nie klient');
select is_empty(
  $$ select 1 from public.game_collection where id = '00000000-0000-4000-b000-000000000001' $$,
  'usunięta gra znika z kolekcji i widżetu');
select is_empty(
  $$ select 1 from public.search_games('zolw') $$,
  'usunięta gra znika z wyszukiwania');
select is(
  (select title from public.games where id = '00000000-0000-4000-b000-000000000001'),
  'Żółwie Wyścigi 2',
  'usunięta gra zostaje w tabeli games (historia: „usunięta z kolekcji”)');
select throws_ok(
  $$ update public.games set title = 'Wskrzeszona' where id = '00000000-0000-4000-b000-000000000001' $$,
  '23514', null, 'usuniętej gry nie da się edytować');
select throws_ok(
  $$ update public.games set deleted_at = null where id = '00000000-0000-4000-b000-000000000001' $$,
  '23514', null, 'usuniętej gry nie da się przywrócić');
select lives_ok(
  $$ update public.games set deleted_at = now()
      where id = '00000000-0000-4000-b000-000000000001' and deleted_at is null $$,
  'ponowne usunięcie z filtrem deleted_at is null nie zgłasza błędu (idempotentne)');

select is_empty(
  $$ select 1 from public.game_votes
      where game_id = '00000000-0000-4000-b000-000000000001'
        and meeting_id = '00000000-0000-4000-c000-000000000001' $$,
  'głosy na usuniętą grę w zaplanowanym spotkaniu znikają');
select is_empty(
  $$ select 1 from public.meeting_games
      where game_id = '00000000-0000-4000-b000-000000000001'
        and meeting_id = '00000000-0000-4000-c000-000000000001' $$,
  'usunięta gra znika z listy gier zaplanowanego spotkania');
select results_eq(
  $$ select game_id from public.game_votes where meeting_id = '00000000-0000-4000-c000-000000000001' $$,
  $$ values ('00000000-0000-4000-b000-000000000003'::uuid) $$,
  'głosy na inne gry zostają');
select is(
  (select count(*)::int from public.game_votes
      where game_id = '00000000-0000-4000-b000-000000000001'
        and meeting_id = '00000000-0000-4000-c000-000000000002'),
  1,
  'zakończone spotkanie zachowuje głosy na usuniętą grę');
select is(
  (select count(*)::int from public.meeting_games
      where game_id = '00000000-0000-4000-b000-000000000001'
        and meeting_id = '00000000-0000-4000-c000-000000000002'),
  1,
  'zakończone spotkanie zachowuje opublikowaną usuniętą grę');
select results_eq(
  $$ select status, points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000001' $$,
  $$ values ('saved', '{10,6,4,2}'::numeric[]) $$,
  'partia usuniętej gry zostaje z punktacją z chwili rozpoczęcia (GAME-8, GAME-9)');

-- Edycja punktacji grającej gry nie zmienia jej partii (GAME-9).
select lives_ok(
  $$ update public.games set placement_points = '{9}' where id = '00000000-0000-4000-b000-000000000002' $$,
  'admin: zmienia punktację gry z partiami');
select results_eq(
  $$ select points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000002' $$,
  $$ values ('{5}'::numeric[]) $$,
  'zapisana partia zachowuje dawną punktację (GAME-9)');

reset role;

select * from finish();

rollback;
