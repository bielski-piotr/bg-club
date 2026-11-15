-- [027] Rozpoczęcie partii (`start_play`): uprawnienia admina i prowadzącego, status
-- spotkania, notes, liczba graczy, miejsca, uczestnicy i kilka partii w toku naraz
-- (PRD RUN-2, RUN-3, PAD-2, PAD-3, PAD-9, Q2). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- a001 Ada: admin; a002 Bartek: prowadzący; a003 Celina, a004 Dawid: gracze;
-- a005 Ewa: uczestniczka, potem usunięta; a006 Filip: spoza spotkania.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player'),
  ('00000000-0000-4000-a000-000000000005', 'ewa-usunieta-e005', 'Ewa', 'Usunięta', 'player'),
  ('00000000-0000-4000-a000-000000000006', 'filip-obcy-f006', 'Filip', 'Obcy', 'player');

-- b001: min 1 (partia i tak ma ≥ 2 graczy, Q2), max 4; b002: 3–5; b003: usunięta później.
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 1, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Łąka i Pszczoły', 3, 5, '{8,5,3,1,0}'),
  ('00000000-0000-4000-b000-000000000003', 'Stara Gra', 2, 4, '{5,3,1,0}');

-- d001: 3 miejsca; d002: 1 miejsce (za mało); d003: usunięty; d004: 5 miejsc; d005: gry b003.
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Trzy miejsca'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001', 'Pasjans'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000001', 'Usunięty'),
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b000-000000000002', 'Łąka'),
  ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b000-000000000003', 'Stary notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', '{}', 3),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000002', '{}', 1),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000003', '{}', 4),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-d000-000000000004', '{}', 5),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-d000-000000000005', '{}', 4);
update public.scorepads s set current_version_id = v.id
  from public.scorepad_versions v where v.scorepad_id = s.id;
update public.scorepads set deleted_at = now() where id = '00000000-0000-4000-d000-000000000003';

-- c001: w trakcie, prowadzi Bartek; c002: zaplanowane; c003: zakończone, prowadził Bartek.
insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'W trakcie', '2026-11-20 18:00+01', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Zaplanowane', '2026-11-27 18:00+01', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000003', 'Zakończone', '2026-11-13 18:00+01', '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id
  from public.meetings m
 cross join public.profiles p
 where p.id <> '00000000-0000-4000-a000-000000000006';
update public.meetings set host_id = '00000000-0000-4000-a000-000000000002';
-- Tylko jedno spotkanie naraz jest w trakcie (MTG-2): najpierw zakończone, potem bieżące.
update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
 where id = '00000000-0000-4000-c000-000000000003';
update public.meetings set status = 'finished', finished_at = now()
 where id = '00000000-0000-4000-c000-000000000003';
update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
 where id = '00000000-0000-4000-c000-000000000001';

-- Ewa odchodzi z klubu (zostaje w historii spotkań, MEM-5); gra b003 zostaje usunięta.
update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000005';
update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000003';

-- SQLSTATE i HINT błędu (HINT to nazwa reguły, którą SPA zamienia na komunikat).
create function public.test_failure(statement text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  state text;
  hint text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce('/' || nullif(hint, ''), '');
end;
$$;
grant execute on function public.test_failure(text) to authenticated;

set local role authenticated;

-- =============================================================================================
-- Uprawnienia (PAD-9): tylko admin i prowadzący
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[]) $$),
  '42501', 'gracz nie rozpocznie partii, także z sobą w składzie (PAD-9)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000006", "role": "authenticated"}';
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[]) $$),
  '42501', 'osoba spoza spotkania nie rozpocznie partii');

select throws_ok(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
       '00000000-0000-4000-e000-000000000001', '{10,6,4,2}', '00000000-0000-4000-a000-000000000006') $$,
  '42501', null, 'bezpośredni zapis partii jest zablokowany (tylko RPC)');

-- =============================================================================================
-- Prowadzący rozpoczyna partię (RUN-2, PAD-2)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is(
  (select row(meeting_id, game_id, scorepad_version_id, status, started_by, points_snapshot, saved_at)::text
     from public.start_play('00000000-0000-4000-f000-000000000001',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[])),
  row('00000000-0000-4000-c000-000000000001'::uuid, '00000000-0000-4000-b000-000000000001'::uuid,
      '00000000-0000-4000-e000-000000000001'::uuid, 'draft', '00000000-0000-4000-a000-000000000002'::uuid,
      '{10,6,4,2}'::int[], null::timestamptz)::text,
  'prowadzący: szkic z grą notesu, bieżącą wersją, snapshotem punktacji i autorem z tokenu');
select results_eq(
  $$ select seat, profile_id, place from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000001' order by seat $$,
  $$ values (1, '00000000-0000-4000-a000-000000000002'::uuid, null::int),
            (2, '00000000-0000-4000-a000-000000000003'::uuid, null::int) $$,
  'gracze w miejscach notesu według kolejności tablicy, bez wyników');
select is(
  (select id from public.start_play('00000000-0000-4000-f000-000000000001',
     '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
     array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[])),
  '00000000-0000-4000-f000-000000000001'::uuid,
  'ponowienie z tym samym id zwraca istniejącą partię');
select is(
  (select count(*)::int from public.plays where meeting_id = '00000000-0000-4000-c000-000000000001'),
  1, 'ponowienie nie tworzy drugiej partii');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000001',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '23505/plays_already_exists', 'ten sam id z innym składem: błąd zamiast zwrotu starej partii');
select is(
  public.test_failure($$ select public.start_play(null,
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]) $$),
  '23502', 'bez identyfikatora partii: odrzucone (bez reguły notesu w HINT)');

-- =============================================================================================
-- Kilka partii w toku (RUN-3), wolne miejsca, admin
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select is(
  (select status from public.start_play('00000000-0000-4000-f000-000000000002',
     '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
     array[null, '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004']::uuid[])),
  'draft', 'admin: druga partia w toku w tym samym spotkaniu (RUN-3)');
select results_eq(
  $$ select seat, profile_id from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000002' order by seat $$,
  $$ values (2, '00000000-0000-4000-a000-000000000001'::uuid), (3, '00000000-0000-4000-a000-000000000004'::uuid) $$,
  'NULL w tablicy = wolne miejsce notesu');
select is(
  (select count(*)::int from public.plays
    where meeting_id = '00000000-0000-4000-c000-000000000001' and status = 'draft'),
  2, 'dwie niezależne partie w toku');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000001',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004']::uuid[]) $$),
  '23505/plays_already_exists', 'cudzy identyfikator partii: odrzucony, nie zwraca cudzej partii');

-- =============================================================================================
-- Liczba graczy i miejsca (PAD-3, Q2)
-- =============================================================================================
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001']::uuid[]) $$),
  '23514/plays_players_count', 'jeden gracz: odrzucony, także gdy gra ma min = 1 (Q2)');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array[null, null, null]::uuid[]) $$),
  '23514/plays_players_count', 'same wolne miejsca: odrzucone');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
          '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[]) $$),
  '23514/play_results_seat_within_slots', 'czterech graczy w notesie z 3 miejscami: odrzuceni (PAD-3)');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', null, null]::uuid[]) $$),
  '23514/play_results_seat_within_slots', 'miejsce poza notesem: odrzucone, także wolne');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000004',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '23514/plays_players_count', 'dwóch graczy w grze 3–5: odrzuceni (min gry)');
select is(
  (select status from public.start_play('00000000-0000-4000-f000-000000000003',
     '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000004',
     array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002',
           '00000000-0000-4000-a000-000000000003']::uuid[])),
  'draft', 'trzech graczy w grze 3–5: partia rozpoczęta');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000002',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '23514/plays_scorepad_fits_game', 'notes z 1 miejscem: niepasujący (PAD-3)');

-- =============================================================================================
-- Gracze: bez duplikatów, tylko aktywni uczestnicy (PAD-2)
-- =============================================================================================
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001']::uuid[]) $$),
  '23514/plays_players_unique', 'ten sam gracz na dwóch miejscach: odrzucony');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006']::uuid[]) $$),
  '23514/plays_player_participant', 'gracz spoza uczestników: odrzucony');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000005']::uuid[]) $$),
  '23514/plays_player_participant', 'uczestniczka usunięta z klubu: nie zagra (MEM-5)');

-- =============================================================================================
-- Notes i gra (RUN-2: bez notesu nie ma partii)
-- =============================================================================================
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000003',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  'P0002/plays_scorepad_unavailable', 'usunięty notes: odrzucony');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-0000000000ff',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  'P0002/plays_scorepad_unavailable', 'nieistniejący notes: odrzucony');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', null,
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '23502/plays_scorepad_unavailable', 'bez notesu partii nie da się rozpocząć');
select ok(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000005',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$)
    in ('P0002/plays_scorepad_unavailable', '23514/plays_game_active'),
  'notes usuniętej gry: odrzucony (GAME-8)');

-- =============================================================================================
-- Status spotkania (PAD-9)
-- =============================================================================================
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '23514/plays_meeting_in_progress', 'admin: zaplanowane spotkanie nie ma partii');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '23514/plays_meeting_in_progress', 'admin: po zakończeniu spotkania nie można dodać partii (RUN-4)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '23514/plays_meeting_in_progress', 'prowadzący: zaplanowane spotkanie nie ma partii');
select is(
  public.test_failure($$ select public.start_play('00000000-0000-4000-f000-000000000009',
    '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']::uuid[]) $$),
  '42501', 'prowadzący zakończonego spotkania traci uprawnienia');
select is(
  (select count(*)::int from public.plays where id = '00000000-0000-4000-f000-000000000009'),
  0, 'odrzucone wywołania nie zostawiają partii');

select * from finish();

rollback;
