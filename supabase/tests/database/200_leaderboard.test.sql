-- [032] Rankingi i filtry: public.leaderboard(kind, date_from, date_to, game_ids) (PRD LB-1,
-- LB-4–LB-7, §5.6.3, §5.6.6, NFR-10, NFR-11). Bez remisów: rozstrzygają późniejsze spotkanie
-- osiągnięcia wyniku, punkty na nim, liczba wygranych, alfabet. Dane testowe są fikcyjne.
--
-- Historia partii (punktacja 10/6/4/2; strefa klubu Europe/Warsaw):
--   m1 2025-12-31 23:30+01 (rok 2025)                  p1: Celina 1 (10), Łukasz 2 (6), Lucyna 3 (4)
--   m2 2026-01-01 00:30+01 (UTC jeszcze 2025, lokalnie 2026)
--                                                      p2: Lucyna 1 (10), Łukasz 2 (6)
--                                                      p3: Lucyna 1 (10), Mateusz 2 (6)
--   m3 2026-03-10 18:00+01                             p4: Łukasz 1 (10), Celina 2 (6)
--   m4 2026-10-25 02:30+02 (przed zmianą czasu, 00:30 UTC)
--                                                      p5: Lucyna 1 (8), Łukasz 1 (8), Mateusz 3 (4)
--   m5 2026-10-25 02:10+01 (po zmianie czasu, 01:10 UTC; w toku)
--                                                      p6: Mateusz 1 (10), Lucyna 2 (6); p7: szkic z Bartkiem
-- Celina jest usunięta (MEM-4). Bartek nie ma zapisanej partii.
begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw');

-- a001 Ada: admin bez partii; a011 Łukasz, a012 Lucyna, a013 Mateusz, a014 Celina, a015 Bartek.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000011', 'lukasz-nowak-a011', 'Łukasz', 'Nowak', 'player'),
  ('00000000-0000-4000-a000-000000000012', 'lucyna-kowal-a012', 'Lucyna', 'Kowal', 'player'),
  ('00000000-0000-4000-a000-000000000013', 'mateusz-zielinski-a013', 'Mateusz', 'Zieliński', 'player'),
  ('00000000-0000-4000-a000-000000000014', 'celina-usunieta-a014', 'Celina', 'Usunięta', 'player'),
  ('00000000-0000-4000-a000-000000000015', 'bartek-bezpartii-a015', 'Bartek', 'Bezpartii', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "total", "kind": "total"}]}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';

-- Historia zakończonych spotkań wstawiona bezpośrednio (bez wyzwalaczy przebiegu spotkania
-- i partii, które pilnują testy 130–190).
set local session_replication_role = replica;

insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Sylwester', '2025-12-31 23:30+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2025-12-31 23:30+01', '2026-01-01 03:00+01'),
  ('00000000-0000-4000-c000-000000000002', 'Nowy Rok', '2026-01-01 00:30+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-01-01 00:30+01', '2026-01-01 04:00+01'),
  ('00000000-0000-4000-c000-000000000003', 'Marzec', '2026-03-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-03-10 18:00+01', '2026-03-10 22:00+01'),
  ('00000000-0000-4000-c000-000000000004', 'Przed zmianą czasu', '2026-10-25 02:30+02', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-10-25 02:30+02', '2026-10-25 02:05+01'),
  ('00000000-0000-4000-c000-000000000005', 'Po zmianie czasu', '2026-10-25 02:10+01', 'in_progress', false,
   '00000000-0000-4000-a000-000000000001', '2026-10-25 02:10+01', null);

insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p where p.role = 'player';

create function pg_temp.play(n int, meeting int, status text, saved_at timestamptz)
returns void
language sql
as $$
  insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at)
  values (('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid,
          ('00000000-0000-4000-c000-' || lpad(meeting::text, 12, '0'))::uuid,
          '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000001',
          status, '{10,6,4,2}', '00000000-0000-4000-a000-000000000001', saved_at);
$$;

-- Wynik gracza: (partia, gracz a0NN, miejsce w notesie, miejsce, punkty).
create function pg_temp.result(play int, profile int, seat int, place int, points int, tied boolean default false)
returns void
language sql
as $$
  insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win)
  select p.id, p.meeting_id, ('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid,
         seat, place, tied, points, place = 1
    from public.plays p where p.id = ('00000000-0000-4000-f000-' || lpad(play::text, 12, '0'))::uuid;
$$;

select pg_temp.play(1, 1, 'saved', '2025-12-31 23:59+01');
select pg_temp.result(1, 14, 1, 1, 10), pg_temp.result(1, 11, 2, 2, 6), pg_temp.result(1, 12, 3, 3, 4);
select pg_temp.play(2, 2, 'saved', '2026-01-01 01:00+01');
select pg_temp.result(2, 12, 1, 1, 10), pg_temp.result(2, 11, 2, 2, 6);
select pg_temp.play(3, 2, 'saved', '2026-01-01 02:00+01');
select pg_temp.result(3, 12, 1, 1, 10), pg_temp.result(3, 13, 2, 2, 6);
select pg_temp.play(4, 3, 'saved', '2026-03-10 19:00+01');
select pg_temp.result(4, 11, 1, 1, 10), pg_temp.result(4, 14, 2, 2, 6);
select pg_temp.play(5, 4, 'saved', '2026-10-25 02:50+02');
select pg_temp.result(5, 12, 1, 1, 8, true), pg_temp.result(5, 11, 2, 1, 8, true), pg_temp.result(5, 13, 3, 3, 4);
select pg_temp.play(6, 5, 'saved', '2026-10-25 02:30+01');
select pg_temp.result(6, 13, 1, 1, 10), pg_temp.result(6, 12, 2, 2, 6);
-- Szkic się nie liczy (wyniki bez miejsc).
select pg_temp.play(7, 5, 'draft', null);
insert into public.play_results (play_id, meeting_id, profile_id, seat) values
  ('00000000-0000-4000-f000-000000000007', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000015', 1),
  ('00000000-0000-4000-f000-000000000007', '00000000-0000-4000-c000-000000000005', '00000000-0000-4000-a000-000000000011', 2);

update public.profiles set deleted_at = '2026-11-01 12:00+01' where id = '00000000-0000-4000-a000-000000000014';

reset session_replication_role;

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

-- Klasyfikacja jako tekst: „miejsce imię wynik[ usunięty][ podium]” w kolejności funkcji.
create function public.test_board(kind text, date_from date default null, date_to date default null,
                                  game_ids uuid[] default null)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(l.place || ' ' || l.first_name || ' ' || l.value
           || case when l.deleted then ' usunięty' else '' end
           || case when l.podium then ' podium' else '' end), '{}')
    from public.leaderboard(kind, date_from, date_to, game_ids) l;
$$;
grant execute on function public.test_board(text, date, date, uuid[]) to authenticated;

-- Dane rozstrzygnięcia jako tekst: „imię: remis? spotkanie punkty-na-nim wygrane”.
create function public.test_ties(kind text, date_from date default null, date_to date default null)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(l.first_name || ': ' || case when l.tied then 'remis' else 'bez remisu' end
           || ' ' || coalesce(l.reached_meeting_title, '-') || ' ' || coalesce(l.reached_points::text, '-')
           || ' ' || l.wins), '{}')
    from public.leaderboard(kind, date_from, date_to) l;
$$;
grant execute on function public.test_ties(text, date, date) to authenticated;

-- =============================================================================================
-- Uprawnienia: tylko aktywni członkowie (RLS, security invoker)
-- =============================================================================================
select ok(not has_function_privilege('anon', 'public.leaderboard(text, date, date, uuid[])', 'execute'),
  'anon nie wywoła leaderboard');
select ok(
  (select bool_and(not prosecdef) from pg_proc
    where oid in ('public.leaderboard(text, date, date, uuid[])'::regprocedure,
                  'private.club_timezone()'::regprocedure)),
  'funkcje rankingów działają z prawami wywołującego (RLS)');
select ok(to_regprocedure('public.leaderboard_years()') is null, 'lista lat filtru zniknęła z bazy');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000014", "role": "authenticated"}';
select is(public.test_board('points'), '{}'::text[], 'usunięty członek nie widzi rankingu');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000015", "role": "authenticated"}';
select is(public.test_failure($$ select public.leaderboard('elo') $$), '22023/leaderboard_kind_invalid',
  'nieznany rodzaj klasyfikacji');
select is(public.test_failure($$ select public.leaderboard(null) $$), '22023/leaderboard_kind_invalid',
  'rodzaj jest wymagany');
select is(public.test_failure($$ select public.leaderboard('streak') $$), '22023/leaderboard_kind_invalid',
  'seria zwycięstw nie jest już rankingiem');
select is(public.test_failure($$ select public.leaderboard('points', '2026-03-02', '2026-03-01') $$),
  '22023/leaderboard_range_invalid', 'zakres z początkiem po końcu to błąd');
select is(public.test_board('points', '9999-12-31', '9999-12-31'), '{}'::text[],
  'ostatni dzień kalendarza: pusta klasyfikacja');

-- =============================================================================================
-- Cała historia (LB-1, LB-5–LB-7)
-- =============================================================================================
select is(public.test_board('points'),
  array['1 Lucyna 38 podium', '2 Łukasz 30 podium', '3 Mateusz 20 podium', '4 Celina 16 usunięty'],
  'punkty: suma punktów leaderboardu; szkic i gracz bez partii pominięci (LB-5)');
select is(public.test_board('wins'),
  array['1 Lucyna 3 podium', '2 Łukasz 2 podium', '3 Mateusz 1 podium', '4 Celina 1 usunięty'],
  'wygrane: wspólne 1. miejsce to wygrana obu (§5.6.3); usunięta z tym samym wynikiem za aktywnymi');
select is(
  (select value from public.leaderboard('points', null) where first_name = 'Celina'), 16::numeric,
  'brak dat = cała historia: punkty z 2025 (10) i 2026 (6)');
select is(
  (select array_agg(l.profile_id::text order by l.profile_id) from public.leaderboard('points') l),
  array['00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000012',
        '00000000-0000-4000-a000-000000000013', '00000000-0000-4000-a000-000000000014'],
  'klasyfikowani tylko gracze z zapisaną partią (bez admina i Bartka)');
select is(
  (select row(first_name, last_name, avatar_path, deleted)::text from public.leaderboard('wins') where place = 4),
  '(Celina,Usunięta,,t)',
  'wiersz ma imię, nazwisko, awatar i znacznik usunięcia');
select is(public.test_ties('wins'),
  array['Lucyna: bez remisu Przed zmianą czasu 8 3', 'Łukasz: bez remisu Przed zmianą czasu 8 2',
        'Mateusz: bez remisu Po zmianie czasu 10 1', 'Celina: bez remisu Sylwester 10 1'],
  'dane rozstrzygnięcia: ostatnie spotkanie z wygraną, punkty na nim, wygrane; usunięta nie remisuje z aktywnym');

-- =============================================================================================
-- Rozstrzyganie równych wyników (bez remisów)
-- =============================================================================================
-- m3–m5 (10 marca – 25 października): Lucyna i Mateusz mają po 1 wygranej; Mateusz wygrał
-- w m5 (01:10 UTC), Lucyna w m4 (00:30 UTC) — chwila, nie godzina lokalna w noc zmiany czasu.
select is(public.test_board('wins', '2026-03-01', '2026-10-25'),
  array['1 Łukasz 2 podium', '2 Mateusz 1 podium', '3 Lucyna 1 podium', '4 Celina 0 usunięty'],
  '1. kryterium: później osiągnięty wynik jest wyżej (§5.6.6, także przy zmianie czasu)');
-- Ten sam zakres w punktach: obaj po 14, oboje osiągnęli wynik w m5; Mateusz zdobył tam 10, Lucyna 6.
select is(public.test_board('points', '2026-03-01', '2026-10-25'),
  array['1 Łukasz 18 podium', '2 Mateusz 14 podium', '3 Lucyna 14 podium', '4 Celina 6 usunięty'],
  '2. kryterium: na tym samym spotkaniu wyżej ten, kto zdobył więcej punktów');
select is(public.test_ties('points', '2026-03-01', '2026-10-25'),
  array['Łukasz: bez remisu Przed zmianą czasu 8 2', 'Mateusz: remis Po zmianie czasu 10 1',
        'Lucyna: remis Po zmianie czasu 6 3', 'Celina: bez remisu Marzec 6 1'],
  'punkty: spotkanie osiągnięcia to ostatnie z punktami; wygrane zawsze z całej historii');
-- Rok 2025: Lucyna i Łukasz bez wygranej w zakresie (brak spotkania i punktów do porównania);
-- w całej historii Lucyna ma 3 wygrane, Łukasz 2.
select is(public.test_board('wins', '2025-01-01', '2025-12-31'),
  array['1 Lucyna 0 podium', '2 Łukasz 0 podium', '3 Celina 1 usunięty'],
  '3. kryterium: wygrane z całej historii mimo filtra; usunięta z lepszym wynikiem na końcu, bez podium');

-- =============================================================================================
-- Filtr dat w strefie klubu (LB-4, NFR-10)
-- =============================================================================================
select is(public.test_board('points', '2026-01-01', '2026-12-31'),
  array['1 Lucyna 34 podium', '2 Łukasz 24 podium', '3 Mateusz 20 podium', '4 Celina 6 usunięty'],
  '2026: m2 (00:30 lokalnie 1 stycznia, UTC jeszcze 2025) liczy się do 2026');
select is(public.test_board('wins', '2026-01-01', '2026-12-31'),
  array['1 Lucyna 3 podium', '2 Łukasz 2 podium', '3 Mateusz 1 podium', '4 Celina 0 usunięty'],
  '2026: wygrane tylko z partii zakresu');
select is(public.test_board('points', '2025-01-01', '2025-12-31'),
  array['1 Łukasz 6 podium', '2 Lucyna 4 podium', '3 Celina 10 usunięty'],
  '2025: tylko m1');
select is(public.test_board('points', '2026-01-01'),
  public.test_board('points', '2026-01-01', '2026-12-31'), 'sam początek zakresu: bez końca');
select is(public.test_board('points', null, '2025-12-31'),
  public.test_board('points', '2025-01-01', '2025-12-31'), 'sam koniec zakresu: bez początku');
select is(public.test_board('points', '2026-10-25', '2026-10-25'),
  array['1 Mateusz 14 podium', '2 Lucyna 14 podium', '3 Łukasz 8 podium'],
  'jeden dzień: oba spotkania nocy zmiany czasu');
select is(public.test_board('points', '2024-01-01', '2024-12-31'), '{}'::text[], 'zakres bez partii: pusta klasyfikacja');

-- Zmiana strefy klubu zmienia granice dni, nie zapisane terminy (CLUB-2, NFR-10).
reset role;
update public.club set timezone = 'America/New_York';
set local role authenticated;
select is(public.test_board('points', '2025-01-01', '2025-12-31'),
  array['1 Lucyna 24 podium', '2 Łukasz 12 podium', '3 Mateusz 6 podium', '4 Celina 10 usunięty'],
  'strefa America/New_York: m2 (31 grudnia 18:30 lokalnie) wraca do 2025');
reset role;
update public.club set timezone = 'Europe/Warsaw';
set local role authenticated;

-- =============================================================================================
-- Usunięcie wcześniejszego wyniku przelicza ranking (§5.6.5)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.delete_play('00000000-0000-4000-f000-000000000004') $$,
  'admin usuwa partię p4 z marca (wygrana Łukasza)');
select is(public.test_board('points'),
  array['1 Lucyna 38 podium', '2 Mateusz 20 podium', '3 Łukasz 20 podium', '4 Celina 10 usunięty'],
  'punkty bez p4 przeliczone od razu; po 20 pkt wyżej Mateusz (wynik z późniejszego m5)');

-- =============================================================================================
-- Filtr gier i 3. kryterium (więcej wygranych)
-- =============================================================================================
-- m6 1 listopada, gra „Kości” (5/5/4/2): p8 Mateusz 1., Lucyna 2.; p9 Celina 1., Łukasz 2. — każdy
-- ma 5 pkt z tego samego spotkania. W całej historii (bez p4): Lucyna 3 wygrane, Mateusz 2,
-- Łukasz 1 — w filtrze „Kości” wygrał tylko Mateusz, ale liczą się wygrane z całej historii.
reset role;
set local session_replication_role = replica;
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000002', 'Kości', 2, 4, '{5,5,4,2}');
insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000006', 'Listopad', '2026-11-01 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-11-01 18:00+01', '2026-11-01 22:00+01');
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at)
select ('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid, '00000000-0000-4000-c000-000000000006',
       '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-e000-000000000001', 'saved', '{5,5,4,2}',
       '00000000-0000-4000-a000-000000000001', '2026-11-01 19:00+01'::timestamptz + n * interval '1 minute'
  from generate_series(8, 9) n;
insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win) values
  ('00000000-0000-4000-f000-000000000008', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000013', 1, 1, false, 5, true),
  ('00000000-0000-4000-f000-000000000008', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000012', 2, 2, false, 5, false),
  ('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000014', 1, 1, false, 5, true),
  ('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000006', '00000000-0000-4000-a000-000000000011', 2, 2, false, 5, false);
reset session_replication_role;
set local role authenticated;

select is(public.test_board('points', null, null, array['00000000-0000-4000-b000-000000000002']::uuid[]),
  array['1 Lucyna 5 podium', '2 Mateusz 5 podium', '3 Łukasz 5 podium', '4 Celina 5 usunięty'],
  '3. kryterium: przy tym samym spotkaniu i punktach wyżej więcej wygranych z całej historii, nie z filtra');
select is(public.test_board('points', '2026-11-01', '2026-11-01', array['00000000-0000-4000-b000-000000000002']::uuid[]),
  public.test_board('points', null, null, array['00000000-0000-4000-b000-000000000002']::uuid[]),
  'wygrane do rozstrzygnięcia nie zależą od filtra dat');
select is(public.test_board('points', '2026-11-01', '2026-11-01'),
  public.test_board('points', null, null, array['00000000-0000-4000-b000-000000000002']::uuid[]),
  'filtr dnia i filtr gry dają tu ten sam zakres partii');
select is(public.test_board('points', null, null, array['00000000-0000-4000-b000-000000000001']::uuid[]),
  array['1 Lucyna 38 podium', '2 Mateusz 20 podium', '3 Łukasz 20 podium', '4 Celina 10 usunięty'],
  'filtr jednej gry pomija partie innych gier');
select is(public.test_board('points', null, null, '{}'::uuid[]), public.test_board('points'),
  'pusta lista gier = wszystkie gry');
select is(public.test_board('wins', '2026-11-01', '2026-11-30', array['00000000-0000-4000-b000-000000000001']::uuid[]),
  '{}'::text[], 'filtry dat i gier łączą się (brak partii pierwszej gry w listopadzie)');

select * from finish();

rollback;
