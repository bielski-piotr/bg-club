-- Obrazy karteczek: dołączenie obrazu do zapisanej partii, ścieżka i plik
-- w Storage, pierwszy obraz zostaje, osierocone pliki do sprzątania i polityka usuwania
-- nieużywanych plików, historia po usunięciu gry i notesu.
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

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

-- Dołączenie obrazu `<spotkanie>/<partia f00N>-<sufiks>` do partii f00N.
create function public.test_attach(play int, path text)
returns text
language sql
set search_path = ''
as $$
  select public.test_failure(format('select public.attach_play_sheet_image(%L, %L)',
    '00000000-0000-4000-f000-' || lpad(play::text, 12, '0'), path));
$$;
grant execute on function public.test_attach(int, text) to authenticated;

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

create temporary table paths (k text primary key, v text) on commit drop;
insert into paths values
  ('f1a', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-aaaaaaaaaaaa.webp'),
  ('f1b', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-bbbbbbbbbbbb.png'),
  ('f1old', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-cccccccccccc.webp'),
  ('f2old', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000002-dddddddddddd.webp'),
  ('gone', '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000009-eeeeeeeeeeee.webp');
grant select on paths to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]);
     select public.start_play('00000000-0000-4000-f000-000000000002',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]); $$,
  'prowadzący zaczyna dwie partie'
);

-- Szkic nie dostaje obrazu.
select public.test_upload((select v from paths where k = 'f1a'));
select is(public.test_attach(1, (select v from paths where k = 'f1a')), '23514/plays_sheet_image_not_saved',
  'obraz tylko do zapisanej partii');

select lives_ok(
  $$ select public.save_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-e000-000000000001',
       '{"game": 1, "names": ["Bartek", "Celina"], "cells": {"a": [5, 3]}}',
       '[{"profile_id": "00000000-0000-4000-a000-000000000002", "seat": 1, "place": 1, "scores": {"a": 5}, "ranking_value": 5},
         {"profile_id": "00000000-0000-4000-a000-000000000003", "seat": 2, "place": 2, "scores": {"a": 3}, "ranking_value": 3}]') $$,
  'prowadzący zapisuje partię f001 bez obrazu'
);
select is((select sheet_image_path from public.plays where id = '00000000-0000-4000-f000-000000000001'), null,
  'zapisana partia bez obrazu jest pełną historią (kartka i wyniki)');

-- Ścieżka: tylko plik tej partii w folderze jej spotkania, nazwa z sufiksem i rozszerzeniem.
select is(public.test_attach(1, '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000002-aaaaaaaaaaaa.webp'),
  '23514/plays_sheet_image_invalid', 'plik innej partii odrzucony');
select is(public.test_attach(1, '00000000-0000-4000-c000-000000000002/00000000-0000-4000-f000-000000000001-aaaaaaaaaaaa.webp'),
  '23514/plays_sheet_image_invalid', 'plik z folderu innego spotkania odrzucony');
select is(public.test_attach(1, '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-aaaaaaaaaaaa.gif'),
  '23514/plays_sheet_image_invalid', 'nieobsługiwane rozszerzenie odrzucone');
select is(public.test_attach(1, '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001.webp'),
  '23514/plays_sheet_image_invalid', 'nazwa bez losowego sufiksu odrzucona');
select is(public.test_attach(1, null), '23514/plays_sheet_image_invalid', 'brak ścieżki odrzucony');
select is(public.test_attach(1, (select v from paths where k = 'f1b')), '23503/plays_sheet_image_missing',
  'plik, którego nie ma w Storage, odrzucony');
select is(public.test_attach(9, (select v from paths where k = 'gone')), 'P0002/plays_not_found',
  'nieistniejąca partia');

-- Gracz nie dołącza obrazu.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(public.test_attach(1, (select v from paths where k = 'f1a')), '42501', 'gracz nie dołącza obrazu');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is(public.test_attach(1, (select v from paths where k = 'f1a')), 'ok', 'prowadzący dołącza obraz');
select is((select sheet_image_path from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  (select v from paths where k = 'f1a'), 'partia wskazuje obraz');
select is(public.test_attach(1, (select v from paths where k = 'f1a')), 'ok', 'ponowienie z tą samą ścieżką');

-- Druga próba (np. ponowne wgranie po przekroczeniu czasu): pierwszy obraz zostaje.
select public.test_upload((select v from paths where k = 'f1b'));
select is(
  (select (public.attach_play_sheet_image('00000000-0000-4000-f000-000000000001', (select v from paths where k = 'f1b'))).sheet_image_path),
  (select v from paths where k = 'f1a'), 'inna ścieżka nie zastępuje obrazu, RPC zwraca obowiązujący');
reset role;
select throws_ok(
  $$ update public.plays set sheet_image_path = null where id = '00000000-0000-4000-f000-000000000001' $$,
  '23514', 'saved play is immutable', 'obrazu zapisanej partii nie da się zmienić ani usunąć'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';

-- Osierocone pliki: f1b (świeży), f1old (stary, f001 zapisana z innym obrazem), f2old (stary, f002
-- w toku), gone (stary, partii nie ma).
select public.test_upload((select v from paths where k = 'f1old'), '1 hour');
select public.test_upload((select v from paths where k = 'f2old'), '1 hour');
select public.test_upload((select v from paths where k = 'gone'), '1 hour');
select results_eq(
  $$ select public.orphan_sheet_images('00000000-0000-4000-c000-000000000001') $$,
  $$ select v from paths where k in ('f1old', 'gone') order by v $$,
  'do sprzątania: stare pliki bez partii, bez wskazanego obrazu i bez plików partii w toku'
);
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(public.test_failure($$ select public.orphan_sheet_images('00000000-0000-4000-c000-000000000001') $$),
  '42501', 'gracz nie widzi listy do sprzątania');

-- Polityka usuwania (API Storage usuwa z ustawionym storage.allow_delete_query).
set local storage.allow_delete_query = 'true';
with d as (delete from storage.objects where bucket_id = 'sheets' returning name)
select is((select count(*) from d), 0::bigint, 'gracz nie usuwa obrazów karteczek');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
with d as (delete from storage.objects where bucket_id = 'sheets' returning name)
select is((select array_agg(name order by name) from d),
  (select array_agg(v order by v) from paths where k <> 'f1a'),
  'prowadzący usuwa nieużywane pliki swojego spotkania, obraz partii zostaje');
select is((select count(*) from storage.objects where name = (select v from paths where k = 'f1a')), 1::bigint,
  'obraz wskazany przez partię jest w Storage');
reset storage.allow_delete_query;

-- Historia po edycji i usunięciu gry i notesu: partia nadal wskazuje grę,
-- wersję szablonu, kartkę i obraz.
reset role;
update public.games set title = 'Żółwie po zmianie' where id = '00000000-0000-4000-b000-000000000001';
update public.scorepads set deleted_at = now() where id = '00000000-0000-4000-d000-000000000001';
update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000001';
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(
  (select g.title from public.plays p join public.games g on g.id = p.game_id
    where p.id = '00000000-0000-4000-f000-000000000001'),
  'Żółwie po zmianie', 'gracz widzi grę partii po usunięciu gry');
select is(
  (select v.template -> 'lines' -> 1 ->> 'id' from public.plays p
     join public.scorepad_versions v on v.id = p.scorepad_version_id
    where p.id = '00000000-0000-4000-f000-000000000001'),
  'a', 'szablon wersji z rozpoczęcia partii zostaje po usunięciu notesu');
select is(
  (select row(p.sheet -> 'cells' -> 'a', p.sheet_image_path)::text from public.plays p
    where p.id = '00000000-0000-4000-f000-000000000001'),
  (select row('[5, 3]'::jsonb, v)::text from paths where k = 'f1a'),
  'kartka i obraz partii zostają po usunięciu gry i notesu');
select is(
  (select count(*) from storage.objects where name = (select v from paths where k = 'f1a')), 1::bigint,
  'gracz odczytuje obraz karteczki (polityka odczytu)');

-- Uprawnienia funkcji.
reset role;
select ok(
  not has_function_privilege('anon', 'public.attach_play_sheet_image(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.orphan_sheet_images(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.attach_play_sheet_image(uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.orphan_sheet_images(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.is_sheet_image_path(text,uuid,uuid)', 'execute'),
  'RPC obrazów tylko dla zalogowanych; pomocnicza funkcja ścieżki niedostępna'
);

select * from finish();

rollback;
