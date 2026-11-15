-- [023] Planowanie spotkań i reguły statusów (PRD PLAN-1…PLAN-5, MTG-2, RUN-1, RUN-4, NFR-10)
-- z perspektywy klienta: `save_meeting`, `start_meeting`, `finish_meeting` i usuwanie spotkań.
-- Równoczesne starty z dwóch sesji sprawdza `pnpm test:auth` (integration/meetings.test.ts).
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(74);

-- a001 Ada: admin; a002 Bartek, a003 Celina, a004 Dawid: gracze; a005 Ewa: usunięta;
-- a006 Filip usunie konto w trakcie spotkania.
insert into public.profiles (id, hook, first_name, last_name, role, deleted_at) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin', null),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player', null),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player', null),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player', null),
  ('00000000-0000-4000-a000-000000000005', 'ewa-usunieta-e005', 'Ewa', 'Usunięta', 'player', now()),
  ('00000000-0000-4000-a000-000000000006', 'filip-odchodzacy-f006', 'Filip', 'Odchodzący', 'player', null);

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', '{}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';

-- Identyfikatory w zmiennych tabeli tymczasowej czytelnej dla authenticated.
create temporary table ids (name text primary key, id uuid) on commit drop;
insert into ids values
  ('ada', '00000000-0000-4000-a000-000000000001'),
  ('bartek', '00000000-0000-4000-a000-000000000002'),
  ('celina', '00000000-0000-4000-a000-000000000003'),
  ('dawid', '00000000-0000-4000-a000-000000000004'),
  ('ewa', '00000000-0000-4000-a000-000000000005'),
  ('m1', '00000000-0000-4000-c000-000000000001'),
  ('m2', '00000000-0000-4000-c000-000000000002'),
  ('m3', '00000000-0000-4000-c000-000000000003');
grant select on ids to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

-- =============================================================================================
-- Bez klubu nie ma strefy czasowej, więc nie ma terminu (NFR-10)
-- =============================================================================================
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Przed klubem', '2026-11-28', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null) $$,
  '23514', 'club is not set up', 'save_meeting: wymaga założonego klubu (strefa terminu)');

insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw');

-- =============================================================================================
-- Planowanie (PLAN-1, PLAN-2)
-- =============================================================================================
select is(
  (select row(status, voting_open, title, host_id, created_by, started_at, finished_at)::text
     from public.save_meeting('00000000-0000-4000-c000-000000000001', '  Listopadowe granie  ', '2026-11-28', '18:00',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002']::uuid[],
       '00000000-0000-4000-a000-000000000002')),
  row('planned', true, 'Listopadowe granie', '00000000-0000-4000-a000-000000000002'::uuid,
      '00000000-0000-4000-a000-000000000001'::uuid, null::timestamptz, null::timestamptz)::text,
  'nowe spotkanie: zaplanowane, głosowanie otwarte (PLAN-2), tytuł bez spacji, autor z tokenu');
select is(
  (select array_agg(profile_id order by profile_id) from public.meeting_participants
    where meeting_id = '00000000-0000-4000-c000-000000000001'),
  array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
        '00000000-0000-4000-a000-000000000003']::uuid[],
  'uczestnicy bez duplikatów, bez limitu liczby (Q12)');
select is(
  (select starts_at from public.meetings where id = '00000000-0000-4000-c000-000000000001'),
  '2026-11-28 17:00:00+00'::timestamptz,
  'termin w strefie klubu: 18:00 czasu zimowego w Warszawie = 17:00 UTC (NFR-10)');

select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000009', 'Puste', '2026-11-28', '18:00',
       '{}'::uuid[], null) $$,
  '23514', 'meeting needs at least one participant', 'bez uczestników: odrzucone');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000009', 'Prowadzący spoza', '2026-11-28', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], '00000000-0000-4000-a000-000000000003') $$,
  '23514', 'meeting host must be a participant', 'prowadzący musi być uczestnikiem (PLAN-1)');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000009', 'Admin prowadzi', '2026-11-28', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], '00000000-0000-4000-a000-000000000001') $$,
  '23514', 'meetings.host_id must not be the admin (use NULL)', 'prowadzący: uczestnik inny niż admin (PLAN-1)');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000009', 'Z usuniętą', '2026-11-28', '18:00',
       array['00000000-0000-4000-a000-000000000005']::uuid[], null) $$,
  '23514', 'deleted profile cannot join a meeting', 'usuniętego członka nie da się dodać (MEM-6)');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000009', '   ', '2026-11-28', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null) $$,
  '23514', null, 'pusty tytuł: odrzucony');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000009', 'Bez godziny', '2026-11-28', null,
       array['00000000-0000-4000-a000-000000000001']::uuid[], null) $$,
  '23502', 'meeting date and time are required', 'bez daty lub godziny: odrzucone');
select is_empty(
  $$ select id from public.meetings where id = '00000000-0000-4000-c000-000000000009' $$,
  'odrzucony zapis nie zostawia spotkania');

-- =============================================================================================
-- Zmiana czasu (NFR-10): lato, luka wiosenna, podwójna godzina jesienią
-- =============================================================================================
select is(
  (select starts_at from public.save_meeting('00000000-0000-4000-c000-000000000009', 'Lato', '2026-07-04', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null)),
  '2026-07-04 16:00:00+00'::timestamptz, 'czas letni: 18:00 w Warszawie = 16:00 UTC');
select is(
  (select starts_at from public.save_meeting('00000000-0000-4000-c000-000000000009', 'Po zmianie', '2026-03-29', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null)),
  '2026-03-29 16:00:00+00'::timestamptz, 'dzień zmiany czasu (wiosna): wieczór już w czasie letnim');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000009', 'Luka', '2026-03-29', '02:30',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null) $$,
  '23514', 'local time 2026-03-29 02:30:00 does not exist in time zone Europe/Warsaw',
  'godzina z luki zmiany czasu: odrzucona zamiast przesunięta');
select is(
  (select starts_at from public.save_meeting('00000000-0000-4000-c000-000000000009', 'Podwójna', '2026-10-25', '02:30',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null)),
  '2026-10-25 01:30:00+00'::timestamptz, 'podwójna godzina jesienią: drugie wystąpienie (czas zimowy)');
select is(
  (select starts_at from public.save_meeting('00000000-0000-4000-c000-000000000009', 'Po zmianie jesiennej', '2026-10-25', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null)),
  '2026-10-25 17:00:00+00'::timestamptz, 'dzień zmiany czasu (jesień): wieczór już w czasie zimowym');

-- Zmiana strefy klubu nie przesuwa zapisanych terminów (NFR-10).
update public.club set timezone = 'America/New_York';
select is(
  (select starts_at from public.meetings where id = '00000000-0000-4000-c000-000000000001'),
  '2026-11-28 17:00:00+00'::timestamptz, 'zmiana strefy klubu nie zmienia zapisanej chwili');
select is(
  (select starts_at from public.save_meeting('00000000-0000-4000-c000-000000000009', 'Nowy Jork', '2026-11-28', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null)),
  '2026-11-28 23:00:00+00'::timestamptz, 'nowy termin liczony w aktualnej strefie klubu');
update public.club set timezone = 'Europe/Warsaw';

-- =============================================================================================
-- Edycja zaplanowanego (PLAN-3)
-- =============================================================================================
reset role;
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');
set local role authenticated;

-- Bartek (prowadzący, z głosem) wypada, Dawid dochodzi i prowadzi.
select is(
  (select row(title, starts_at, host_id)::text
     from public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003',
             '00000000-0000-4000-a000-000000000004']::uuid[],
       '00000000-0000-4000-a000-000000000004')),
  row('Grudniowe granie', '2026-12-05 18:30:00+00'::timestamptz, '00000000-0000-4000-a000-000000000004'::uuid)::text,
  'edycja zaplanowanego: tytuł, termin i prowadzący');
select is(
  (select array_agg(profile_id order by profile_id) from public.meeting_participants
    where meeting_id = '00000000-0000-4000-c000-000000000001'),
  array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003',
        '00000000-0000-4000-a000-000000000004']::uuid[],
  'edycja: pełna lista uczestników zastępuje poprzednią');
select is(
  (select array_agg(profile_id) from public.game_votes where meeting_id = '00000000-0000-4000-c000-000000000001'),
  array['00000000-0000-4000-a000-000000000003']::uuid[],
  'usunięty uczestnik traci głosy, pozostali je zachowują');
select is(
  (select host_id from public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003']::uuid[], null)),
  null::uuid, 'usunięcie prowadzącego razem z uczestnictwem: prowadzi admin');

-- Edycja bez terminu (NULL-e) zostawia termin, nawet gdy strefa klubu się zmieniła (NFR-10).
reset role;
update public.club set timezone = 'Asia/Tokyo';
set local role authenticated;
select is(
  (select starts_at from public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie', null, null,
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003']::uuid[], null, false)),
  '2026-12-05 18:30:00+00'::timestamptz, 'edycja bez terminu: termin bez zmian mimo innej strefy klubu');
reset role;
update public.club set timezone = 'Europe/Warsaw';
set local role authenticated;
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie', '2026-12-05', null,
       array['00000000-0000-4000-a000-000000000001']::uuid[], null, false) $$,
  '23502', 'meeting date and time are required', 'sama data bez godziny: odrzucona');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000088', 'Nowe bez terminu', null, null,
       array['00000000-0000-4000-a000-000000000001']::uuid[], null) $$,
  '23502', 'meeting date and time are required', 'nowe spotkanie bez terminu: odrzucone');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000088', 'Usunięte w międzyczasie', '2026-12-05', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null, false) $$,
  'P0002', 'meeting 00000000-0000-4000-c000-000000000088 does not exist',
  'edycja nieistniejącego (usuniętego) spotkania nie tworzy go na nowo');
select is_empty($$ select 1 from public.meetings where id = '00000000-0000-4000-c000-000000000088' $$,
  'odrzucona edycja nie zostawia spotkania');

-- Edycja po zamknięciu głosowania nadal działa (PLAN-3).
reset role;
update public.meetings set voting_open = false where id = '00000000-0000-4000-c000-000000000001';
set local role authenticated;
select is(
  (select row(title, voting_open)::text
     from public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie 2', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003']::uuid[], '00000000-0000-4000-a000-000000000003')),
  row('Grudniowe granie 2', false)::text,
  'edycja po zamknięciu głosowania: zapisuje zmiany i nie otwiera głosowania');

-- Gracz i prowadzący nie edytują (Q14).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Celiny', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000003']::uuid[], '00000000-0000-4000-a000-000000000003') $$,
  '42501', 'administrator required', 'prowadząca: nie edytuje spotkania (Q14)');
-- RLS nie daje graczowi wiersza do usunięcia, więc DELETE nic nie robi.
select results_eq(
  $$ with d as (delete from public.meetings where id = '00000000-0000-4000-c000-000000000001' returning 1)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'prowadząca: nie usuwa spotkania');
reset role;
select isnt_empty($$ select 1 from public.meetings where id = '00000000-0000-4000-c000-000000000001' $$,
  'spotkanie po próbie usunięcia przez gracza zostaje');
set local role authenticated;

-- =============================================================================================
-- Rozpoczęcie (RUN-1, MTG-2) i zakończenie (RUN-4)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select throws_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000001') $$,
  '42501', null, 'gracz (nie prowadzący): nie rozpoczyna spotkania');
select throws_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000077') $$,
  '42501', null, 'nieistniejące spotkanie: odmowa jak dla cudzego');

-- m2: Ada planuje drugie spotkanie (otwarte głosowanie), bez prowadzącego.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000002', 'Drugie', '2026-12-12', '18:00',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[], null) $$,
  'admin: planuje drugie spotkanie');

-- Celina prowadzi m1: może je rozpocząć (§2.1).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(
  (select row(status, voting_open, started_at is not null, finished_at)::text
     from public.start_meeting('00000000-0000-4000-c000-000000000001')),
  row('in_progress', false, true, null::timestamptz)::text,
  'prowadząca rozpoczyna swoje spotkanie: w trakcie, głosowanie zamknięte (RUN-1)');
select throws_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000001') $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 is not planned', 'drugi start tego samego: odrzucony');
select throws_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000002') $$,
  '42501', null, 'prowadząca: nie rozpoczyna cudzego spotkania');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000002') $$,
  '23505', 'another meeting is in progress', 'drugie spotkanie w trakcie: odrzucone (MTG-2)');
select is(
  (select row(status, voting_open)::text from public.meetings where id = '00000000-0000-4000-c000-000000000002'),
  row('planned', true)::text, 'odrzucony start nie zmienia spotkania ani głosowania');
select throws_ok(
  $$ select public.finish_meeting('00000000-0000-4000-c000-000000000002') $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000002 is not in progress', 'nie kończy zaplanowanego');

-- =============================================================================================
-- W trakcie (PLAN-4): dopisanie, zmiana prowadzącego, bez zmian tytułu i terminu
-- =============================================================================================
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Zmieniony', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003']::uuid[], '00000000-0000-4000-a000-000000000003') $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 has started; title and date are locked',
  'w trakcie: tytuł jest zablokowany');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie 2', '2026-12-06', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003']::uuid[], '00000000-0000-4000-a000-000000000003') $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 has started; title and date are locked',
  'w trakcie: termin jest zablokowany');
select is(
  (select host_id from public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie 2', null, null,
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[],
       '00000000-0000-4000-a000-000000000004', false)),
  '00000000-0000-4000-a000-000000000004'::uuid,
  'w trakcie: admin dopisuje spóźnionego i zmienia prowadzącego (PLAN-4)');
select lives_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', '  Grudniowe granie 2 ', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[],
       '00000000-0000-4000-a000-000000000004', false) $$,
  'w trakcie: ten sam tytuł (spacje na brzegach) i termin nie są zmianą');

-- Uczestnik, który usunął konto w trakcie spotkania, zostaje (MEM-6); kolejny zapis go nie
-- odrzuca.
reset role;
insert into public.meeting_participants (meeting_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000006');
update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000006';
set local role authenticated;
select is(
  (select count(*)::int from public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie 2', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004',
             '00000000-0000-4000-a000-000000000006']::uuid[], '00000000-0000-4000-a000-000000000004')),
  1, 'w trakcie: zapis zachowuje uczestnika, który usunął konto (MEM-6)');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000002', 'Drugie', '2026-12-12', '18:00',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006']::uuid[], null) $$,
  '23514', 'deleted profile cannot join a meeting', 'usuniętego nie da się dopisać do innego spotkania');

-- Partie: zapisana (Bartek, Celina) i szkic (Dawid).
reset role;
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by) values
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-e000-000000000001', '{}', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-e000-000000000001', '{}', '00000000-0000-4000-a000-000000000001');
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win) values
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002', 1, 1, false, 10, true),
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 2, 2, false, 6, false);
insert into public.play_results (play_id, meeting_id, profile_id, seat) values
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004', 1),
  ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 2);
update public.plays set status = 'saved', sheet = '{}' where id = '00000000-0000-4000-f000-000000000001';
set local role authenticated;

select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie 2', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003',
             '00000000-0000-4000-a000-000000000004']::uuid[], '00000000-0000-4000-a000-000000000004') $$,
  '23514', 'participant with a play cannot be removed', 'w trakcie: uczestnik z zapisaną partią zostaje (PLAN-4)');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie 2', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003']::uuid[], null) $$,
  '23514', 'participant with a play cannot be removed', 'w trakcie: uczestnik ze szkicem partii zostaje');

-- Usunięcie uczestnika bez partii w trakcie: m2 niżej.

select throws_ok(
  $$ delete from public.meetings where id = '00000000-0000-4000-c000-000000000001' $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 is in progress; finish it before deleting',
  'spotkania w trakcie nie da się usunąć');

-- Szkic blokuje zakończenie (RUN-4).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000004", "role": "authenticated"}';
select throws_ok(
  $$ select public.finish_meeting('00000000-0000-4000-c000-000000000001') $$,
  '23514', 'meeting has draft plays; save or discard them before finishing', 'szkic partii blokuje zakończenie (RUN-4)');
select is(
  (select status from public.meetings where id = '00000000-0000-4000-c000-000000000001'),
  'in_progress', 'odrzucone zakończenie zostawia spotkanie w trakcie');

reset role;
delete from public.plays where id = '00000000-0000-4000-f000-000000000002';
set local role authenticated;

select is(
  (select row(status, finished_at >= started_at)::text from public.finish_meeting('00000000-0000-4000-c000-000000000001')),
  row('finished', true)::text, 'prowadzący kończy spotkanie bez szkiców (RUN-4)');
select is(private.is_meeting_runner('00000000-0000-4000-c000-000000000001'), false,
  'po zakończeniu prowadzący traci uprawnienia');
select throws_ok(
  $$ select public.finish_meeting('00000000-0000-4000-c000-000000000001') $$,
  '42501', null, 'prowadzący: nie kończy ponownie zakończonego');

-- =============================================================================================
-- Zakończone: niezmienne, usuwalne tylko bez partii (PLAN-5, Q4)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$ select public.finish_meeting('00000000-0000-4000-c000-000000000001') $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 is not in progress', 'admin: nie kończy zakończonego');
select throws_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000001') $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 is not planned', 'admin: start nie cofa zakończenia');
select throws_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Grudniowe granie 2', '2026-12-05', '19:30',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[], null) $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 is finished', 'zakończone: bez edycji');
select throws_ok(
  $$ delete from public.meetings where id = '00000000-0000-4000-c000-000000000001' $$,
  '23503', null, 'zakończonego z partiami nie da się usunąć (PLAN-5)');

-- Strażnik w bazie działa także poza RPC (service_role).
reset role;
select throws_ok(
  $$ update public.meetings set host_id = null where id = '00000000-0000-4000-c000-000000000001' $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 is finished', 'zakończone zachowuje prowadzącego (także service_role)');
select throws_ok(
  $$ update public.meetings set title = 'Inny' where id = '00000000-0000-4000-c000-000000000001' $$,
  '23514', 'meeting 00000000-0000-4000-c000-000000000001 has started; title and date are locked',
  'zakończone: tytuł zablokowany (także service_role)');
set local role authenticated;

-- =============================================================================================
-- m2 w trakcie: usunięcie uczestnika bez partii, potem zakończenie bez partii i usunięcie
-- =============================================================================================
select is(
  (select status from public.start_meeting('00000000-0000-4000-c000-000000000002')),
  'in_progress', 'po zakończeniu poprzedniego można rozpocząć kolejne (MTG-2)');
select is(
  (select count(*)::int from public.save_meeting('00000000-0000-4000-c000-000000000002', 'Drugie', '2026-12-12', '18:00',
       array['00000000-0000-4000-a000-000000000001']::uuid[], null)),
  1, 'w trakcie: uczestnik bez partii może zostać usunięty');
select is(
  (select array_agg(profile_id) from public.meeting_participants where meeting_id = '00000000-0000-4000-c000-000000000002'),
  array['00000000-0000-4000-a000-000000000001']::uuid[], 'lista uczestników po usunięciu');
select lives_ok($$ select public.finish_meeting('00000000-0000-4000-c000-000000000002') $$,
  'admin kończy spotkanie bez partii');
select results_eq(
  $$ with d as (delete from public.meetings where id = '00000000-0000-4000-c000-000000000002' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'zakończone bez partii można usunąć (PLAN-5)');

-- =============================================================================================
-- Usunięcie zaplanowanego kasuje głosy i uczestników (PLAN-3)
-- =============================================================================================
select lives_ok(
  $$ select public.save_meeting('00000000-0000-4000-c000-000000000003', 'Do usunięcia', '2027-01-09', '18:00',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[],
       '00000000-0000-4000-a000-000000000002') $$,
  'admin planuje spotkanie do usunięcia');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002') $$,
  'gracz głosuje w zaplanowanym');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select results_eq(
  $$ with d as (delete from public.meetings where id = '00000000-0000-4000-c000-000000000003' returning 1)
     select count(*)::int from d $$,
  $$ values (1) $$,
  'admin usuwa zaplanowane spotkanie');
reset role;
select is_empty(
  $$ select 1 from public.game_votes where meeting_id = '00000000-0000-4000-c000-000000000003'
     union all select 1 from public.meeting_participants where meeting_id = '00000000-0000-4000-c000-000000000003' $$,
  'usunięcie spotkania kasuje głosy i uczestników (PLAN-3)');

-- =============================================================================================
-- Prawa: tylko RPC zapisuje spotkania i uczestników
-- =============================================================================================
set local role authenticated;
select throws_ok(
  $$ insert into public.meetings (title, starts_at) values ('Bez RPC', now()) $$,
  '42501', 'permission denied for table meetings', 'admin: spotkanie tylko przez save_meeting');
select throws_ok(
  $$ update public.meetings set voting_open = true $$,
  '42501', 'permission denied for table meetings', 'admin: bez bezpośredniej zmiany spotkania');
select throws_ok(
  $$ insert into public.meeting_participants (meeting_id, profile_id) values
     ('00000000-0000-4000-c000-000000000009', '00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'admin: uczestnicy tylko przez save_meeting');
set local request.jwt.claims to '{"role": "anon"}';
reset role;
set local role anon;
select throws_ok(
  $$ select public.start_meeting('00000000-0000-4000-c000-000000000009') $$,
  '42501', null, 'anon: nie wywoła RPC spotkań');

-- Pola HINT niosą nazwę reguły dla komunikatów SPA.
reset role;
select is(
  (select array_agg(distinct m[1] order by m[1])
     from pg_proc p, regexp_matches(p.prosrc, 'hint = ''(meetings_[a-z_]+)''', 'g') m
    where p.proname in ('save_meeting', 'start_meeting', 'finish_meeting', 'meetings_validate',
                        'meetings_guard_delete', 'meeting_local_start')),
  array['meetings_club_required', 'meetings_delete_in_progress', 'meetings_finish_in_progress',
        'meetings_finished_locked', 'meetings_host_not_admin', 'meetings_host_not_deleted',
        'meetings_host_participant', 'meetings_local_time_exists', 'meetings_no_drafts_when_finished',
        'meetings_not_found', 'meetings_participant_has_play', 'meetings_participants_required', 'meetings_schedule_locked',
        'meetings_single_in_progress', 'meetings_start_planned', 'meetings_starts_at_required',
        'meetings_status_transition'],
  'reguły spotkań mają stałe nazwy w HINT (mapowanie komunikatów w SPA)');

select * from finish();

rollback;
