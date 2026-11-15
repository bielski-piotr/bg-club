-- [031] Usunięcie partii (`delete_play`): tylko admin, tylko zapisana partia, kaskada wyników,
-- kartki i odblokowań, obraz do sprzątania przez API Storage (także po błędzie Storage),
-- ponowienie bez przywracania wyniku i usunięcie zakończonego spotkania po ostatniej partii
-- (PRD VIEW-6, PLAN-5, §5.6.5, Q4, Q17). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- a001 Ada: admin; a002 Bartek: prowadzący; a003 Celina: gracz.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}]}', 4);
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

create function public.test_delete(play int)
returns text
language sql
set search_path = ''
as $$
  select public.test_failure(format('select public.delete_play(%L)',
    '00000000-0000-4000-f000-' || lpad(play::text, 12, '0')));
$$;
grant execute on function public.test_delete(int) to authenticated;

-- Plik w buckecie sheets (Storage API tu nie ma; wpis w storage.objects wystarczy RPC).
create function public.test_upload(path text, age interval default '0'::interval)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into storage.objects (bucket_id, name, owner, created_at)
  values ('sheets', path, auth.uid(), now() - age);
$$;
grant execute on function public.test_upload(text, interval) to authenticated;

create function public.test_save(play int, first uuid, second uuid)
returns void
language sql
set search_path = ''
as $$
  select public.save_play(('00000000-0000-4000-f000-' || lpad(play::text, 12, '0'))::uuid,
    '00000000-0000-4000-e000-000000000001'::uuid,
    '{"game": 1, "names": ["A", "B"], "cells": {"a": [5, 3]}}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('profile_id', first, 'seat', 1, 'place', 1, 'scores', '{"a": 5}'::jsonb, 'ranking_value', 5),
      jsonb_build_object('profile_id', second, 'seat', 2, 'place', 2, 'scores', '{"a": 3}'::jsonb, 'ranking_value', 3)));
$$;
grant execute on function public.test_save(int, uuid, uuid) to authenticated;

create temporary table paths (k text primary key, v text) on commit drop;
insert into paths values
  ('f1', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-aaaaaaaaaaaa.webp');
grant select on paths to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
-- f001 i f002 zapisane (Bartek wygrywa f001, Celina f002), f003 w toku.
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]);
     select public.start_play('00000000-0000-4000-f000-000000000002',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002']::uuid[]);
     select public.start_play('00000000-0000-4000-f000-000000000003',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]);
     select public.test_save(1, '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003');
     select public.test_save(2, '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002');
     select public.test_upload((select v from paths where k = 'f1'), '1 hour');
     select public.attach_play_sheet_image('00000000-0000-4000-f000-000000000001', (select v from paths where k = 'f1')); $$,
  'prowadzący zapisuje dwie partie (f001 z obrazem) i zaczyna trzecią'
);

-- Odblokowania z przeliczenia osiągnięć ([036]): jedno wskazuje partię f001, drugie spotkanie.
reset role;
insert into public.achievement_unlocks (profile_id, achievement_id, unlocked_at, meeting_id, play_id) values
  ('00000000-0000-4000-a000-000000000002', 'beginners-luck', '2026-11-20 18:00+01',
   '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-f000-000000000001'),
  ('00000000-0000-4000-a000-000000000003', 'meet-1', '2026-11-20 18:00+01',
   '00000000-0000-4000-c000-000000000001', null);
set local role authenticated;

-- =============================================================================================
-- Uprawnienia (VIEW-6): tylko admin
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(public.test_delete(1), '42501', 'gracz nie usuwa partii, także swojej');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is(public.test_delete(1), '42501', 'prowadzący nie usuwa zapisanej partii');
reset role;
select is(public.test_failure($$ set local role anon; select public.delete_play('00000000-0000-4000-f000-000000000001') $$),
  '42501', 'anon nie wywoła delete_play');
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is((select count(*) from public.plays where status = 'saved'), 2::bigint, 'odmowy niczego nie usuwają');

-- =============================================================================================
-- Reguły: tylko zapisana partia
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select is(public.test_delete(3), '23514/plays_not_saved', 'szkic porzuca się przez discard_play, nie usuwa');
select is((select status from public.plays where id = '00000000-0000-4000-f000-000000000003'), 'draft',
  'szkic zostaje');
select is(public.test_delete(9), 'P0002/plays_not_found', 'nieistniejąca partia');

-- =============================================================================================
-- Usunięcie w spotkaniu w trakcie (§5.6.5)
-- =============================================================================================
select is(
  public.delete_play('00000000-0000-4000-f000-000000000001'),
  (select v from paths where k = 'f1'),
  'admin usuwa partię; RPC zwraca ścieżkę obrazu do usunięcia przez API Storage');
select is((select count(*) from public.plays where id = '00000000-0000-4000-f000-000000000001'), 0::bigint,
  'partia i dane kartki usunięte trwale');
select is((select count(*) from public.play_results where play_id = '00000000-0000-4000-f000-000000000001'), 0::bigint,
  'wyniki partii usunięte');
select is(
  (select array_agg(achievement_id order by achievement_id) from public.achievement_unlocks),
  array['meet-1'],
  'odblokowanie z usuniętej partii cofnięte; przeliczenie spotkania należy do [036]');

-- Rankingi liczą się z wyników: zostaje tylko f002 (Celina 10 pkt i 1 wygrana, Bartek 6 pkt).
select results_eq(
  $$ select profile_id::text, sum(points)::int, count(*) filter (where is_win)::int
       from public.play_results r join public.plays p on p.id = r.play_id
      where p.status = 'saved' group by profile_id order by profile_id $$,
  $$ values ('00000000-0000-4000-a000-000000000002', 6, 0),
            ('00000000-0000-4000-a000-000000000003', 10, 1) $$,
  'punkty i wygrane bez usuniętej partii');
select is((select count(*) from public.play_results where play_id = '00000000-0000-4000-f000-000000000002'), 2::bigint,
  'inna partia spotkania bez zmian');
select ok(
  (select prosrc ~ 'delete from public\.plays[^;]*;\s+perform private\.recalculate_after_plays_change\('
     from pg_proc where oid = 'public.delete_play(uuid)'::regprocedure),
  'usunięcie uruchamia przeliczenie w tej samej transakcji');

-- Ponowienie (np. po błędzie sieci) nie przywraca wyniku ani nie usuwa niczego innego.
select is(public.test_delete(1), 'P0002/plays_not_found', 'ponowienie usunięcia: partii już nie ma');

-- =============================================================================================
-- Obraz po usunięciu: błąd Storage nie przywraca partii, sprzątanie można ponowić
-- =============================================================================================
select is((select count(*) from storage.objects where name = (select v from paths where k = 'f1')), 1::bigint,
  'obraz zostaje w Storage do czasu usunięcia przez API (np. po błędzie Storage)');
select results_eq(
  $$ select public.orphan_sheet_images('00000000-0000-4000-c000-000000000001') $$,
  $$ select v from paths where k = 'f1' $$,
  'obraz usuniętej partii jest na liście do sprzątania (ponowienie)');
set local storage.allow_delete_query = 'true';
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
with d as (delete from storage.objects where bucket_id = 'sheets' returning name)
select is((select count(*) from d), 0::bigint, 'gracz nie usuwa obrazu usuniętej partii');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
with d as (delete from storage.objects where bucket_id = 'sheets' returning name)
select is((select array_agg(name) from d), (select array_agg(v) from paths where k = 'f1'),
  'admin usuwa obraz usuniętej partii');
reset storage.allow_delete_query;

-- =============================================================================================
-- Zakończone spotkanie: usunięcie partii, potem spotkania (PLAN-5, Q4)
-- =============================================================================================
select lives_ok(
  $$ select public.discard_play('00000000-0000-4000-f000-000000000003');
     select public.finish_meeting('00000000-0000-4000-c000-000000000001') $$,
  'admin porzuca szkic i kończy spotkanie');
select is(
  public.test_failure($$ delete from public.meetings where id = '00000000-0000-4000-c000-000000000001' $$),
  '23503', 'zakończonego spotkania z partią nie da się usunąć');
select is(public.test_delete(2), 'ok', 'admin usuwa ostatnią partię zakończonego spotkania');
with d as (delete from public.meetings where id = '00000000-0000-4000-c000-000000000001' returning id)
select is((select count(*) from d), 1::bigint, 'zakończone spotkanie bez partii admin usuwa');
select is((select count(*) from public.achievement_unlocks), 0::bigint,
  'odblokowania usuniętego spotkania znikają kaskadą');

select * from finish();

rollback;
