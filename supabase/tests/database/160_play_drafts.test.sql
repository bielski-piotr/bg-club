-- [028] Szkice partii (`save_play_draft`) i porzucenie (`discard_play`): uprawnienia admina
-- i prowadzącego, numer wersji i konflikt zapisów z dwóch urządzeń, poprawność szkicu,
-- porzucenie bez śladu w statystykach i niezmienność zapisanej partii (PRD PAD-4, PAD-8,
-- PAD-9, RUN-3). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- a001 Ada: admin; a002 Bartek: prowadzący; a003 Celina, a004 Dawid: gracze.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Cztery miejsca');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', '{}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';

insert into public.meetings (id, title, starts_at, created_by, host_id) values
  ('00000000-0000-4000-c000-000000000001', 'W trakcie', '2026-11-20 18:00+01',
   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002');
insert into public.meeting_participants (meeting_id, profile_id)
select '00000000-0000-4000-c000-000000000001', p.id from public.profiles p;
update public.meetings set status = 'in_progress', voting_open = false, started_at = now();

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

-- Dwie partie w toku naraz (RUN-3): f001 i f002, obie prowadzi Bartek.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]);
     select public.start_play('00000000-0000-4000-f000-000000000002',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[]) $$,
  'prowadzący rozpoczyna dwie partie');
select is(
  (select row(draft_version, sheet, draft_saved_at, draft_saved_by)::text
     from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  row(0, null::jsonb, null::timestamptz, null::uuid)::text,
  'nowy szkic ma wersję 0 i pustą kartkę');

-- =============================================================================================
-- Uprawnienia (PAD-9): gracz widzi partię, ale nie zapisze ani nie porzuci szkicu
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    '{"game": 1, "names": [], "cells": {}}', 0) $$),
  '42501', 'gracz nie zapisze szkicu, także partii, w której gra');
select is(
  public.test_failure($$ select public.discard_play('00000000-0000-4000-f000-000000000001') $$),
  '42501', 'gracz nie porzuci partii');
select is(
  (select count(*)::int from public.plays where meeting_id = '00000000-0000-4000-c000-000000000001'
     and status = 'draft'),
  2, 'gracz widzi partie w toku (trwa partia: {gra})');
select throws_ok(
  $$ update public.plays set sheet = '{}' where id = '00000000-0000-4000-f000-000000000001' $$,
  '42501', null, 'bezpośredni zapis szkicu jest zablokowany (tylko RPC)');
select throws_ok(
  $$ delete from public.plays where id = '00000000-0000-4000-f000-000000000001' $$,
  '42501', null, 'bezpośrednie usunięcie szkicu jest zablokowane (tylko RPC)');

-- =============================================================================================
-- Zapis szkicu z wersją (PAD-4)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000009',
    '{"game": 1}', 0) $$),
  'P0002/plays_not_found', 'szkic nieistniejącej partii: brak partii');
select is(
  (select row(draft_version, sheet, draft_saved_by)::text
     from public.save_play_draft('00000000-0000-4000-f000-000000000001',
       '{"game": 1, "names": ["Bartek", "Celina"], "cells": {"a": [3, null]}}', 0)),
  row(1, '{"game": 1, "names": ["Bartek", "Celina"], "cells": {"a": [3, null]}}'::jsonb,
      '00000000-0000-4000-a000-000000000002'::uuid)::text,
  'prowadzący zapisuje szkic: wersja 1, wpisy i autor zapisu');
select isnt(
  (select draft_saved_at from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  null, 'zapis szkicu ma czas');
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    '{"game": 1, "cells": {"a": [9, null]}}', 0) $$),
  'PT409/plays_draft_conflict', 'starszy zapis (wersja 0) nie nadpisze nowszego szkicu');
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    '{"game": 1}', null) $$),
  'PT409/plays_draft_conflict', 'zapis bez wersji to konflikt, a nie ciche nadpisanie');
select is(
  (select sheet -> 'cells' -> 'a' ->> 0 from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  '3', 'odrzucony zapis nie zmienia szkicu');

-- Admin wznawia partię na innym urządzeniu (bez synchronizacji na żywo): czyta wpisy z bazy
-- i zapisuje od wersji, którą przeczytał.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select is(
  (select sheet -> 'cells' -> 'a' ->> 0 from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  '3', 'admin na innym urządzeniu wczytuje wpisy szkicu');
select is(
  (select row(draft_version, draft_saved_by)::text
     from public.save_play_draft('00000000-0000-4000-f000-000000000001',
       '{"game": 1, "names": ["Bartek", "Celina"], "cells": {"a": [3, 5]}}', 1)),
  row(2, '00000000-0000-4000-a000-000000000001'::uuid)::text,
  'admin dokańcza szkic: wersja 2');

-- Pierwsze urządzenie nie wie o zapisie admina: konflikt zamiast nadpisania.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    '{"game": 1, "cells": {"a": [4, null]}}', 1) $$),
  'PT409/plays_draft_conflict', 'konkurencyjny zapis z pierwszego urządzenia to konflikt');
select is(
  (select draft_version from public.save_play_draft('00000000-0000-4000-f000-000000000001',
     '{"game": 1, "cells": {"a": [4, null]}}', 2)),
  3, 'po rozstrzygnięciu konfliktu świadomy zapis od bieżącej wersji przechodzi');
select is(
  (select draft_version from public.plays where id = '00000000-0000-4000-f000-000000000002'),
  0, 'zapis szkicu jednej partii nie zmienia drugiej partii w toku (RUN-3)');

-- Poprawność szkicu.
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    '[1, 2]', 3) $$),
  '23514/plays_draft_invalid', 'szkic musi być obiektem JSON');
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    null, 3) $$),
  '23514/plays_draft_invalid', 'pusty szkic jest odrzucany');
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    jsonb_build_object('pad', repeat('x', 300000)), 3) $$),
  '23514/plays_draft_too_large', 'zbyt duży szkic jest odrzucany');

-- =============================================================================================
-- Porzucenie (PAD-8)
-- =============================================================================================
select is(
  public.test_failure($$ select public.discard_play('00000000-0000-4000-f000-000000000002') $$),
  'ok', 'prowadzący porzuca partię w toku');
select is(
  (select count(*)::int from public.plays where id = '00000000-0000-4000-f000-000000000002')
    + (select count(*)::int from public.play_results where play_id = '00000000-0000-4000-f000-000000000002'),
  0, 'porzucenie usuwa szkic razem z graczami (bez śladu w statystykach)');
select is(
  (select count(*)::int from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  1, 'porzucenie nie rusza innej partii w toku');
select is(
  public.test_failure($$ select public.discard_play('00000000-0000-4000-f000-000000000002') $$),
  'P0002/plays_not_found', 'ponowne porzucenie: partii już nie ma');
select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000002',
    '{"game": 1}', 0) $$),
  'P0002/plays_not_found', 'zapis szkicu porzuconej partii: partii już nie ma');

-- =============================================================================================
-- Zapisana partia (karteczka po oderwaniu) jest niezmienna
-- =============================================================================================
reset role;
update public.play_results set ranking_value = 10, place = 1, tied = false, points = 10, is_win = true
 where play_id = '00000000-0000-4000-f000-000000000001' and seat = 1;
update public.play_results set ranking_value = 5, place = 2, tied = false, points = 6, is_win = false
 where play_id = '00000000-0000-4000-f000-000000000001' and seat = 2;
update public.plays set status = 'saved' where id = '00000000-0000-4000-f000-000000000001';
select throws_ok(
  $$ update public.plays set draft_version = draft_version + 1
      where id = '00000000-0000-4000-f000-000000000001' $$,
  '23514', null, 'wersja szkicu zapisanej partii jest niezmienna');
set local role authenticated;

select is(
  public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001',
    '{"game": 1}', 3) $$),
  '23514/plays_not_draft', 'zapisanej partii nie zmienia zapis szkicu');
select is(
  public.test_failure($$ select public.discard_play('00000000-0000-4000-f000-000000000001') $$),
  '23514/plays_not_draft', 'zapisanej partii nie da się porzucić');

-- Wersja szkicu nie maleje (np. zapis spoza RPC).
reset role;
select lives_ok(
  $$ select public.test_failure('select 1');
     insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-f000-000000000003', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000001', '{10,6,4,2}',
       '00000000-0000-4000-a000-000000000002');
     update public.plays set draft_version = 5 where id = '00000000-0000-4000-f000-000000000003' $$,
  'wersja szkicu rośnie');
select throws_ok(
  $$ update public.plays set draft_version = 4 where id = '00000000-0000-4000-f000-000000000003' $$,
  '23514', null, 'wersja szkicu nie maleje');

select * from finish();

rollback;
