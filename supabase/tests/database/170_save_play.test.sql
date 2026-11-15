-- [029] Zapis wyników partii (`save_play`): uprawnienia admina i prowadzącego, kompletność
-- i poprawność wyników, punkty i wygrane liczone w bazie, snapshoty punktacji i wersji notesu
-- (GAME-9), ponowienie po przekroczeniu czasu bez duplikatów i niezmienność zakończonej partii
-- (PRD PAD-5, PAD-7, §5.6, §6). Pełne przypadki miejsc i punktów: 171 (generowany).
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

-- a001 Ada: admin; a002 Bartek: prowadzący; a003 Celina, a004 Dawid: gracze.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player');

-- Notes d001: suma `total` decyduje, więcej = lepiej. Notes d002: mniej = lepiej.
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Więcej lepiej'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001', 'Mniej lepiej');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}]}', 4),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000002',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}],
     "ranking": {"line": "total", "dir": "asc", "tiebreak": []}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001'
 where id = '00000000-0000-4000-d000-000000000001';
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000002'
 where id = '00000000-0000-4000-d000-000000000002';

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

-- Wywołanie save_play partii f00N z wersją e00V, kartką i wynikami (tekst JSON).
create function public.test_save(play int, version int, sheet text, results text)
returns text
language sql
set search_path = ''
as $$
  select public.test_failure(format(
    'select public.save_play(%L, %L, %L::jsonb, %L::jsonb)',
    '00000000-0000-4000-f000-' || lpad(play::text, 12, '0'),
    '00000000-0000-4000-e000-' || lpad(version::text, 12, '0'),
    sheet, results));
$$;
grant execute on function public.test_save(int, int, text, text) to authenticated;

set local role authenticated;

-- Bartek (prowadzący) zaczyna trzy partie: f001 (Bartek, Celina, Dawid), f002 (Celina, Dawid),
-- f003 (Bartek, Celina; notes „mniej lepiej”).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003',
             '00000000-0000-4000-a000-000000000004']::uuid[]);
     select public.start_play('00000000-0000-4000-f000-000000000002',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001',
       array[null, '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004']::uuid[]);
     select public.start_play('00000000-0000-4000-f000-000000000003',
       '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000002',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]); $$,
  'prowadzący zaczyna trzy partie'
);

-- Po rozpoczęciu admin zmienia punktację gry i wydaje nową wersję notesu d001 (GAME-9).
reset role;
update public.games set placement_points = '{20,1,0,0}' where id = '00000000-0000-4000-b000-000000000001';
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000001',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}],
     "ranking": {"line": "total", "dir": "asc", "tiebreak": []}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000003'
 where id = '00000000-0000-4000-d000-000000000001';
set local role authenticated;

-- Wyniki f001: Bartek 12 (1.), Celina i Dawid po 7 (wspólne 2.).
create temporary table good (results text, sheet text) on commit drop;
insert into good values (
  '[{"profile_id": "00000000-0000-4000-a000-000000000002", "seat": 1, "place": 1, "scores": {"a": 12}, "ranking_value": 12},
    {"profile_id": "00000000-0000-4000-a000-000000000003", "seat": 2, "place": 2, "scores": {"a": 7}, "ranking_value": 7},
    {"profile_id": "00000000-0000-4000-a000-000000000004", "seat": 3, "place": 2, "scores": {"a": 7, "b": null}, "ranking_value": 7}]',
  '{"game": 4, "names": ["Bartek", "Celina", "Dawid"], "cells": {"a": [12, 7, 7]}}'
);
grant select on good to authenticated;

-- Uprawnienia: gracz nie zapisze partii, także cudzej; bezpośredni zapis wyników jest zablokowany.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated"}';
select is(public.test_save(1, 1, (select sheet from good), (select results from good)), '42501',
  'gracz (nie prowadzący) nie zapisze partii');
select throws_ok(
  $$ update public.play_results set points = 100, is_win = true, place = 1, tied = false
      where play_id = '00000000-0000-4000-f000-000000000001' $$,
  '42501', null, 'gracz nie zmieni wyników bezpośrednio'
);
select throws_ok(
  $$ update public.plays set status = 'saved' where id = '00000000-0000-4000-f000-000000000001' $$,
  '42501', null, 'gracz nie zakończy partii bezpośrednio'
);

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}';
select is(public.test_save(99, 1, '{}', '[]'), 'P0002/plays_not_found', 'partia, której nie ma');

-- Kształt wyników: tylko znane klucze (klient nie podaje punktów, remisów ani wygranych).
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"ranking_value": 12}', '"ranking_value": 12, "points": 100}')),
  '23514/plays_results_invalid', 'klient nie przyśle własnych punktów');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"ranking_value": 12}', '"ranking_value": 12, "is_win": true}')),
  '23514/plays_results_invalid', 'klient nie przyśle własnej wygranej');
select is(public.test_save(1, 1, (select sheet from good), '{}'),
  '23514/plays_results_invalid', 'wyniki muszą być tablicą');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"place": 1,', '"place": "1",')),
  '23514/plays_results_invalid', 'miejsce musi być liczbą całkowitą');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"scores": {"a": 12}', '"scores": {"a": "12"}')),
  '23514/plays_results_invalid', 'wartości kategorii to liczby albo puste pola');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"place": 1,', '"place": 0,')),
  '23514/plays_results_invalid', 'miejsce od 1');

-- Kartka.
select is(public.test_save(1, 1, '[1]', (select results from good)),
  '23514/plays_sheet_invalid', 'kartka musi być obiektem JSON');
select is(public.test_save(1, 1, json_build_object('pad', repeat('x', 262144))::text, (select results from good)),
  '23514/plays_sheet_too_large', 'kartka większa niż 256 KB');

-- Snapshot wersji notesu: wyniki policzone według innej (nowszej) wersji są odrzucane.
select is(public.test_save(1, 3, (select sheet from good), (select results from good)),
  '23514/plays_scorepad_version_mismatch', 'wyniki według innej wersji notesu niż z rozpoczęcia partii');

-- Gracze i miejsca w notesie: dokładnie te ze szkicu.
select is(public.test_save(1, 1, (select sheet from good),
    '[{"profile_id": "00000000-0000-4000-a000-000000000002", "seat": 1, "place": 1, "scores": {}, "ranking_value": 12},
      {"profile_id": "00000000-0000-4000-a000-000000000003", "seat": 2, "place": 2, "scores": {}, "ranking_value": 7}]'),
  '23514/plays_results_players', 'brak wyniku jednego z graczy');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"seat": 3', '"seat": 4')),
  '23514/plays_results_players', 'gracz na innym miejscu w notesie niż w szkicu');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '000000000004", "seat": 3', '000000000001", "seat": 3')),
  '23514/plays_results_players', 'gracz spoza szkicu (inny uczestnik)');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '000000000004", "seat": 3', '000000000003", "seat": 3')),
  '23514/plays_results_players', 'ten sam gracz dwa razy');

-- Miejsca: numeracja z remisami i zgodność z kategorią decydującą.
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"seat": 3, "place": 2', '"seat": 3, "place": 3')),
  '23514/plays_results_ranking', 'równe wartości decydujące na różnych miejscach bez reguły remisu');
select is(public.test_save(1, 1, (select sheet from good), replace(replace((select results from good),
    '"seat": 2, "place": 2', '"seat": 2, "place": 3'), '"seat": 3, "place": 2', '"seat": 3, "place": 3')),
  '23514/plays_results_places', 'miejsca 1, 3, 3 to zła numeracja (powinno być 1, 2, 2)');
select is(public.test_save(1, 1, (select sheet from good), replace(replace(replace((select results from good),
    '"seat": 1, "place": 1', '"seat": 1, "place": 3'), '"seat": 2, "place": 2', '"seat": 2, "place": 1'),
    '"seat": 3, "place": 2', '"seat": 3, "place": 1')),
  '23514/plays_results_ranking', 'najwyższy wynik na ostatnim miejscu przy „więcej = lepiej”');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"ranking_value": 12', '"ranking_value": null')),
  '23514/plays_results_ranking', 'puste pole kategorii decydującej nie wygrywa z liczbą');
select is(public.test_save(1, 1, (select sheet from good),
    '[{"profile_id": "00000000-0000-4000-a000-000000000002", "seat": 1, "place": 1, "scores": {}, "ranking_value": null},
      {"profile_id": "00000000-0000-4000-a000-000000000003", "seat": 2, "place": 1, "scores": {}, "ranking_value": null},
      {"profile_id": "00000000-0000-4000-a000-000000000004", "seat": 3, "place": 1, "scores": {}}]'),
  '23514/plays_results_empty', 'kartka bez wartości kategorii decydującej');

-- Nic z odrzuconych prób nie zostało zapisane.
select is(
  (select status from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  'draft', 'po odrzuconych próbach partia jest nadal szkicem'
);

-- Poprawny zapis: punkty z snapshotu punktacji z rozpoczęcia (10/6/4/2), nie z bieżącej gry.
select is(public.test_save(1, 1, (select sheet from good), (select results from good)), 'ok',
  'prowadzący zapisuje partię');
select results_eq(
  $$ select r.seat, r.place, r.tied, r.points, r.is_win, r.ranking_value, r.scores
       from public.play_results r where r.play_id = '00000000-0000-4000-f000-000000000001' order by r.seat $$,
  $$ values (1, 1, false, 10, true, 12::numeric, '{"a": 12}'::jsonb),
            (2, 2, true, 5, false, 7::numeric, '{"a": 7}'::jsonb),
            (3, 2, true, 5, false, 7::numeric, '{"a": 7, "b": null}'::jsonb) $$,
  'baza liczy punkty floor((6+4)/2) = 5, remis i wygraną ze snapshotu punktacji (GAME-9, §5.6)'
);
select results_eq(
  $$ select status, sheet, saved_at is not null, scorepad_version_id::text from public.plays
      where id = '00000000-0000-4000-f000-000000000001' $$,
  $$ values ('saved', (select sheet from good)::jsonb, true, '00000000-0000-4000-e000-000000000001') $$,
  'partia zapisana z kartką, czasem zapisu i wersją notesu z rozpoczęcia'
);

-- Ponowienie po przekroczeniu czasu: ta sama treść zwraca zapisaną partię, bez duplikatów.
create temporary table first_save on commit drop as
  select saved_at from public.plays where id = '00000000-0000-4000-f000-000000000001';
select is(public.test_save(1, 1, (select sheet from good), (select results from good)), 'ok',
  'ponowienie z tą samą treścią kończy się powodzeniem');
select is(
  (select count(*)::int from public.play_results where play_id = '00000000-0000-4000-f000-000000000001'),
  3, 'ponowienie nie tworzy dodatkowych wyników'
);
select is(
  (select saved_at from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  (select saved_at from first_save), 'ponowienie nie zmienia czasu zapisu (kolejność partii, §5.6.6)'
);
select is(
  (select public.save_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-e000-000000000001',
     (select sheet from good)::jsonb, (select results from good)::jsonb)).status,
  'saved', 'ponowienie zwraca zapisaną partię'
);

-- Zakończonej partii nie da się zapisać ponownie z inną treścią ani zmienić.
select is(public.test_save(1, 1, replace((select sheet from good), '"game": 4', '"game": 5'), (select results from good)),
  '23514/plays_already_saved', 'inna kartka dla zapisanej partii');
select is(public.test_save(1, 1, (select sheet from good), replace((select results from good),
    '"scores": {"a": 12}', '"scores": {"a": 13}')),
  '23514/plays_already_saved', 'inne wyniki dla zapisanej partii');
select is(public.test_failure($$ select public.save_play_draft('00000000-0000-4000-f000-000000000001', '{}', 0) $$),
  '23514/plays_not_draft', 'zapisana partia nie przyjmie szkicu');
select is(public.test_failure($$ select public.discard_play('00000000-0000-4000-f000-000000000001') $$),
  '23514/plays_not_draft', 'zapisanej partii nie da się porzucić');

-- „Mniej = lepiej” (EDT-3): kierunek z reguły notesu tej wersji.
select is(public.test_save(3, 2, '{"game": 1, "names": [], "cells": {}}',
    '[{"profile_id": "00000000-0000-4000-a000-000000000002", "seat": 1, "place": 2, "scores": {"a": 9}, "ranking_value": 9},
      {"profile_id": "00000000-0000-4000-a000-000000000003", "seat": 2, "place": 1, "scores": {"a": 3}, "ranking_value": 3}]'),
  'ok', 'mniej = lepiej: niższy wynik na 1. miejscu');
select results_eq(
  $$ select r.seat, r.points, r.is_win from public.play_results r
      where r.play_id = '00000000-0000-4000-f000-000000000003' order by r.seat $$,
  $$ values (1, 6, false), (2, 10, true) $$,
  'punkty i wygrana przy „mniej = lepiej”'
);

-- Admin dokończy partię prowadzącego (PAD-4); partia z wolnym miejscem 1 w notesie.
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select is(public.test_save(2, 1, '{"game": 1, "names": [], "cells": {}}',
    '[{"profile_id": "00000000-0000-4000-a000-000000000003", "seat": 2, "place": 1, "scores": {"a": 5}, "ranking_value": 5},
      {"profile_id": "00000000-0000-4000-a000-000000000004", "seat": 3, "place": 1, "scores": {"a": 5}, "ranking_value": 5}]'),
  'ok', 'admin zapisuje partię prowadzącego; remis wszystkich graczy');
select results_eq(
  $$ select r.seat, r.place, r.tied, r.points, r.is_win from public.play_results r
      where r.play_id = '00000000-0000-4000-f000-000000000002' order by r.seat $$,
  $$ values (2, 1, true, 8, true), (3, 1, true, 8, true) $$,
  'wspólne 1. miejsce: każdy wygrywa, floor((10+6)/2) = 8'
);

-- Po zakończeniu spotkania ponowienie nadal zwraca zapisaną partię, a szkicu się nie zapisze.
select lives_ok($$ select public.finish_meeting('00000000-0000-4000-c000-000000000001') $$,
  'spotkanie bez szkiców można zakończyć');
select is(public.test_save(1, 1, (select sheet from good), (select results from good)), 'ok',
  'ponowienie po zakończeniu spotkania zwraca zapisaną partię');

select * from finish();

rollback;
