-- [024] Głosowanie, publikacja gier i ponowne otwarcie (PRD VOTE-1…VOTE-6, PLAN-2, PLAN-3)
-- z perspektywy klienta: głosy przez RLS, `publish_meeting_games`, `reopen_voting`.
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- a001 Ada: admin; a002 Bartek, a003 Celina: gracze; a004 Dawid: prowadzący c001;
-- a005 Filip: aktywny, ale spoza spotkania.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player'),
  ('00000000-0000-4000-a000-000000000005', 'filip-obok-f005', 'Filip', 'Obok', 'player');

-- b001 Żółwie (2–4), b002 Łąka (2–4), b003 Pasjans (1–1, nie pasuje, VOTE-4), b004 usunięta
-- przed głosowaniem.
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Łąka i Pszczoły', 2, 4, '{8,5,3,1}'),
  ('00000000-0000-4000-b000-000000000003', 'Pasjans Klubowy', 1, 1, '{1}'),
  ('00000000-0000-4000-b000-000000000004', 'Stara Gra', 2, 4, '{3,2,1,0}');
update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000004';

insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw');

-- c001 i c002: zaplanowane z otwartym głosowaniem (PLAN-2, domyślna wartość kolumny).
insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Sobotnie granie', now() + interval '7 days', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Drugie granie', now() + interval '14 days', '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select '00000000-0000-4000-c000-000000000001', p::uuid
  from unnest(array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
                    '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']) p;
insert into public.meeting_participants (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002');
update public.meetings set host_id = '00000000-0000-4000-a000-000000000004'
 where id = '00000000-0000-4000-c000-000000000001';

set local role authenticated;

-- =============================================================================================
-- Głosy uczestnika (VOTE-1, VOTE-2)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002'),
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002') $$,
  'uczestnik głosuje na kilka gier naraz (bez limitu, VOTE-2)');
select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002') $$,
  'gra niepasująca do liczby uczestników też przyjmuje głos (VOTE-4)');
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002') $$,
  '23505', null, 'drugi głos na tę samą grę: odrzucony (jeden głos na grę, VOTE-2)');
select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002')
     on conflict do nothing $$,
  'ponowienie głosu (np. po błędzie sieci) z ON CONFLICT DO NOTHING przechodzi bez duplikatu');
select is(
  (select count(*)::int from public.game_votes
    where meeting_id = '00000000-0000-4000-c000-000000000001' and profile_id = '00000000-0000-4000-a000-000000000002'),
  3, 'trzy głosy Bartka, każdy na inną grę');
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000002') $$,
  '23514', 'game 00000000-0000-4000-b000-000000000004 is deleted', 'głos na usuniętą grę: odrzucony');
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000003') $$,
  '42501', null, 'głos za innego uczestnika: odrzucony (RLS)');
select results_eq(
  $$ with d as (delete from public.game_votes
                 where meeting_id = '00000000-0000-4000-c000-000000000001'
                   and game_id = '00000000-0000-4000-b000-000000000003' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$, 'uczestnik cofa własny głos przy otwartym głosowaniu (VOTE-2)');
select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001',
       array['00000000-0000-4000-b000-000000000001']::uuid[]) $$,
  '42501', 'administrator required', 'gracz nie publikuje gier (VOTE-5)');
select throws_ok(
  $$ select public.reopen_voting('00000000-0000-4000-c000-000000000001') $$,
  '42501', 'administrator required', 'gracz nie otwiera głosowania ponownie (VOTE-6)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003') $$,
  'drugi uczestnik głosuje na tę samą grę');
select results_eq(
  $$ with d as (delete from public.game_votes where profile_id = '00000000-0000-4000-a000-000000000002' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'uczestnik nie cofa cudzego głosu');
select is(
  (select array_agg(profile_id order by profile_id) from public.game_votes
    where meeting_id = '00000000-0000-4000-c000-000000000001' and game_id = '00000000-0000-4000-b000-000000000001'),
  array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[],
  'głosowanie jawne: każdy widzi, kto głosował (VOTE-3)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000005", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000005') $$,
  '23503', null, 'głosuje tylko uczestnik (VOTE-1)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000004", "role": "authenticated"}';
select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001',
       array['00000000-0000-4000-b000-000000000001']::uuid[]) $$,
  '42501', 'administrator required', 'prowadzący nie publikuje gier (tylko admin, §2.1)');
select throws_ok(
  $$ select public.reopen_voting('00000000-0000-4000-c000-000000000001') $$,
  '42501', 'administrator required', 'prowadzący nie otwiera głosowania ponownie');

-- =============================================================================================
-- Publikacja gier (VOTE-5)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001', '{}'::uuid[]) $$,
  '23514', 'choose at least one game to publish', 'publikacja: co najmniej jedna gra');
select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001', array[null]::uuid[]) $$,
  '23514', 'choose at least one game to publish', 'publikacja: NULL-e się nie liczą');
select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001',
       array['00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000004']::uuid[]) $$,
  '23514', 'only active games can be published', 'publikacja: usunięta gra jest odrzucana');
select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001',
       array['00000000-0000-4000-b000-0000000000ff']::uuid[]) $$,
  '23514', 'only active games can be published', 'publikacja: nieistniejąca gra jest odrzucana');
select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-0000000000ff',
       array['00000000-0000-4000-b000-000000000001']::uuid[]) $$,
  'P0002', 'meeting 00000000-0000-4000-c000-0000000000ff does not exist', 'publikacja: spotkania nie ma');
select is(
  (select voting_open from public.meetings where id = '00000000-0000-4000-c000-000000000001'),
  true, 'odrzucona publikacja nie zamyka głosowania');

-- Gra bez głosów (b003 po cofnięciu) i z głosami; duplikat liczy się raz, kolejność z tablicy.
select is(
  (select voting_open from public.publish_meeting_games('00000000-0000-4000-c000-000000000001',
     array['00000000-0000-4000-b000-000000000003', '00000000-0000-4000-b000-000000000001',
           '00000000-0000-4000-b000-000000000003']::uuid[])),
  false, 'publikacja zamyka głosowanie (VOTE-5)');
select results_eq(
  $$ select game_id, position from public.meeting_games
      where meeting_id = '00000000-0000-4000-c000-000000000001' order by position $$,
  $$ values ('00000000-0000-4000-b000-000000000003'::uuid, 0), ('00000000-0000-4000-b000-000000000001'::uuid, 1) $$,
  'lista „Gramy w:” w kolejności wyboru, bez duplikatów, także gra bez głosów');
select is(
  (select count(*)::int from public.game_votes where meeting_id = '00000000-0000-4000-c000-000000000001'),
  3, 'publikacja zachowuje głosy (jawna historia, Q18)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002') $$,
  '23514', 'voting is closed in meeting 00000000-0000-4000-c000-000000000001', 'głos po zamknięciu: odrzucony');
select results_eq(
  $$ with d as (delete from public.game_votes where profile_id = '00000000-0000-4000-a000-000000000002' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$, 'po zamknięciu głosu nie da się cofnąć');
select throws_ok(
  $$ insert into public.meeting_games (meeting_id, game_id, position) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 0) $$,
  '42501', null, 'listy gier nie da się zmienić z pominięciem RPC');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001',
       array['00000000-0000-4000-b000-000000000002']::uuid[]) $$,
  'ponowna publikacja w zaplanowanym spotkaniu');
select results_eq(
  $$ select game_id from public.meeting_games where meeting_id = '00000000-0000-4000-c000-000000000001' $$,
  $$ values ('00000000-0000-4000-b000-000000000002'::uuid) $$,
  'ponowna publikacja zastępuje listę');

-- =============================================================================================
-- Ponowne otwarcie (VOTE-6)
-- =============================================================================================
select is(
  (select voting_open from public.reopen_voting('00000000-0000-4000-c000-000000000001')),
  true, 'admin otwiera głosowanie ponownie przed rozpoczęciem');
select is_empty(
  $$ select 1 from public.meeting_games where meeting_id = '00000000-0000-4000-c000-000000000001' $$,
  'ponowne otwarcie usuwa listę „Gramy w:”');
select is(
  (select voting_open from public.reopen_voting('00000000-0000-4000-c000-000000000001')),
  true, 'ponowne otwarcie otwartego głosowania niczego nie zmienia');
select throws_ok(
  $$ select public.reopen_voting('00000000-0000-4000-c000-0000000000ff') $$,
  'P0002', 'meeting 00000000-0000-4000-c000-0000000000ff does not exist', 'ponowne otwarcie: spotkania nie ma');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002') $$,
  'po ponownym otwarciu uczestnik znów głosuje');

-- =============================================================================================
-- Uczestnik usunięty z planu i usunięta gra (PLAN-3, MEM-6, GAME-8)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Sobotnie granie', null, null,
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000004']::uuid[],
       '00000000-0000-4000-a000-000000000004', false) $$,
  'admin usuwa Celinę z planu');
select is_empty(
  $$ select 1 from public.game_votes where profile_id = '00000000-0000-4000-a000-000000000003' $$,
  'uczestnik usunięty z planu traci głosy');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003') $$,
  '23503', null, 'uczestnik usunięty z planu już nie głosuje');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000002' $$,
  'admin usuwa grę z głosami');
select is_empty(
  $$ select 1 from public.game_votes where game_id = '00000000-0000-4000-b000-000000000002' $$,
  'usunięta gra znika z głosowania zaplanowanego spotkania');
select results_eq(
  $$ select game_id from public.game_votes
      where meeting_id = '00000000-0000-4000-c000-000000000001' order by game_id $$,
  $$ values ('00000000-0000-4000-b000-000000000001'::uuid), ('00000000-0000-4000-b000-000000000003'::uuid) $$,
  'głosy na pozostałe gry zostają');

-- =============================================================================================
-- Po rozpoczęciu (RUN-1): bez ponownego otwarcia i publikacji
-- =============================================================================================
select lives_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000001') $$,
  'admin rozpoczyna spotkanie z otwartym głosowaniem');
select throws_ok(
  $$ select public.reopen_voting('00000000-0000-4000-c000-000000000001') $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 has started; voting cannot be reopened',
  'po rozpoczęciu głosowania nie da się otworzyć ponownie (VOTE-6)');
select throws_ok(
  $$ select public.publish_meeting_games('00000000-0000-4000-c000-000000000001',
       array['00000000-0000-4000-b000-000000000001']::uuid[]) $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 is not planned',
  'po rozpoczęciu nie publikujemy gier');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002') $$,
  '23514', null, 'w spotkaniu w trakcie nie głosujemy');

reset role;
select is(
  (select array_agg(distinct m[1] order by m[1])
     from pg_proc p, regexp_matches(p.prosrc, 'hint = ''([a-z_]+)''', 'g') m
    where p.proname in ('publish_meeting_games', 'reopen_voting')),
  array['meeting_games_game_active', 'meeting_games_planned', 'meeting_games_required',
        'meetings_not_found', 'meetings_reopen_planned'],
  'reguły głosowania mają stałe nazwy w HINT (mapowanie komunikatów w SPA)');

select * from finish();

rollback;
