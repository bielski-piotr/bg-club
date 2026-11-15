-- [034] Statystyki gracza: public.player_stats(profile_id, year) (PRD STAT-1–STAT-3, MEM-5,
-- §5.6, Q21, NFR-11). Dane fikcyjne.
--
-- Gry: A „Azul”, B „Brzdęk”, C „Carcassonne” (punktacja 10/6/4/2). Strefa klubu Europe/Warsaw.
--   m1 2025-12-31 23:30 (rok 2025 lokalnie, 2025-12-31 22:30 UTC)
--        p1 A: Łukasz 1 (10), Lucyna 2 (6)
--   m2 2026-01-10: p2 A: Lucyna 1 (8, remis), Łukasz 1 (8, remis)
--                  p3 B: Mateusz 1 (10), Łukasz 2 (6)
--   m3 2026-02-10: p4 A: Mateusz 1 (10), Łukasz 2 (6)
--                  p5 B: Celina 1 (10), Łukasz 2 (6)
--   m4 2026-03-10: p6 B: Łukasz 1 (10), Mateusz 2 (6)
--                  p7 C: Łukasz 1 (10), Lucyna 2 (6); p8 szkic B (Bartek)
-- Celina jest usunięta (MEM-4). Bartek ma tylko szkic (zero partii).
begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw');

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000011', 'lukasz-nowak-a011', 'Łukasz', 'Nowak', 'player'),
  ('00000000-0000-4000-a000-000000000012', 'lucyna-kowal-a012', 'Lucyna', 'Kowal', 'player'),
  ('00000000-0000-4000-a000-000000000013', 'mateusz-zielinski-a013', 'Mateusz', 'Zieliński', 'player'),
  ('00000000-0000-4000-a000-000000000014', 'celina-usunieta-a014', 'Celina', 'Usunięta', 'player'),
  ('00000000-0000-4000-a000-000000000015', 'bartek-bezpartii-a015', 'Bartek', 'Bezpartii', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Azul', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Brzdęk', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000003', 'Carcassonne', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Notes'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000003', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, version, template, player_slots)
select ('00000000-0000-4000-e000-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid, 1,
       '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "total", "kind": "total"}]}', 4
  from generate_series(1, 3) n;

set local session_replication_role = replica;

insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Sylwester', '2025-12-31 23:30+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2025-12-31 23:30+01', '2026-01-01 02:00+01'),
  ('00000000-0000-4000-c000-000000000002', 'Styczeń', '2026-01-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-01-10 18:00+01', '2026-01-10 23:00+01'),
  ('00000000-0000-4000-c000-000000000003', 'Luty', '2026-02-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-02-10 18:00+01', '2026-02-10 23:00+01'),
  ('00000000-0000-4000-c000-000000000004', 'Marzec', '2026-03-10 18:00+01', 'in_progress', false,
   '00000000-0000-4000-a000-000000000001', '2026-03-10 18:00+01', null);

insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p where p.role = 'player';

-- Partia: (n, spotkanie, gra, status, saved_at); wersja notesu = numer gry.
create function pg_temp.play(n int, meeting int, game int, status text, saved_at timestamptz)
returns void
language sql
as $$
  insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at)
  values (('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid,
          ('00000000-0000-4000-c000-' || lpad(meeting::text, 12, '0'))::uuid,
          ('00000000-0000-4000-b000-' || lpad(game::text, 12, '0'))::uuid,
          ('00000000-0000-4000-e000-' || lpad(game::text, 12, '0'))::uuid,
          status, '{10,6,4,2}', '00000000-0000-4000-a000-000000000001', saved_at);
$$;

-- Wynik: (partia, gracz a0NN, miejsce w notesie, miejsce, punkty).
create function pg_temp.result(play int, profile int, seat int, place int, points int, tied boolean default false)
returns void
language sql
as $$
  insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value)
  select p.id, p.meeting_id, ('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid,
         seat, place, tied, points, place = 1, points
    from public.plays p where p.id = ('00000000-0000-4000-f000-' || lpad(play::text, 12, '0'))::uuid;
$$;

select pg_temp.play(1, 1, 1, 'saved', '2025-12-31 23:59+01');
select pg_temp.result(1, 11, 1, 1, 10), pg_temp.result(1, 12, 2, 2, 6);
select pg_temp.play(2, 2, 1, 'saved', '2026-01-10 19:00+01');
select pg_temp.result(2, 12, 1, 1, 8, true), pg_temp.result(2, 11, 2, 1, 8, true);
select pg_temp.play(3, 2, 2, 'saved', '2026-01-10 20:00+01');
select pg_temp.result(3, 13, 1, 1, 10), pg_temp.result(3, 11, 2, 2, 6);
select pg_temp.play(4, 3, 1, 'saved', '2026-02-10 19:00+01');
select pg_temp.result(4, 13, 1, 1, 10), pg_temp.result(4, 11, 2, 2, 6);
select pg_temp.play(5, 3, 2, 'saved', '2026-02-10 20:00+01');
select pg_temp.result(5, 14, 1, 1, 10), pg_temp.result(5, 11, 2, 2, 6);
select pg_temp.play(6, 4, 2, 'saved', '2026-03-10 19:00+01');
select pg_temp.result(6, 11, 1, 1, 10), pg_temp.result(6, 13, 2, 2, 6);
select pg_temp.play(7, 4, 3, 'saved', '2026-03-10 20:00+01');
select pg_temp.result(7, 11, 1, 1, 10), pg_temp.result(7, 12, 2, 2, 6);
select pg_temp.play(8, 4, 2, 'draft', null);
insert into public.play_results (play_id, meeting_id, profile_id, seat) values
  ('00000000-0000-4000-f000-000000000008', '00000000-0000-4000-c000-000000000004', '00000000-0000-4000-a000-000000000015', 1);

update public.profiles set deleted_at = '2026-11-01 12:00+01' where id = '00000000-0000-4000-a000-000000000014';

reset session_replication_role;

-- Statystyki gracza a0NN dla roku (NULL = cała historia).
create function public.test_stats(profile int, year int default null)
returns jsonb
language sql
set search_path = ''
as $$
  select public.player_stats(('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid, year);
$$;
grant execute on function public.test_stats(int, int) to authenticated;

-- Liczniki jako tekst: „spotkania/partie/wygrane/punkty seria rekord/bieżąca”.
create function public.test_totals(profile int, year int default null)
returns text
language sql
set search_path = ''
as $$
  select s ->> 'meetings' || '/' || (s ->> 'plays') || '/' || (s ->> 'wins') || '/' || (s ->> 'points')
         || ' seria ' || (s ->> 'streak_record') || '/' || (s ->> 'streak_current')
    from public.test_stats(profile, year) s;
$$;
grant execute on function public.test_totals(int, int) to authenticated;

-- Miejsca w rankingach jako tekst: „punkty/wygrane/seria” („-” = brak klasyfikacji).
create function public.test_places(profile int, year int default null)
returns text
language sql
set search_path = ''
as $$
  select coalesce(s -> 'places' ->> 'points', '-') || '/' || coalesce(s -> 'places' ->> 'wins', '-')
         || '/' || coalesce(s -> 'places' ->> 'streak', '-')
    from public.test_stats(profile, year) s;
$$;
grant execute on function public.test_places(int, int) to authenticated;

-- Numery partii z `recent_plays` (ostatnia cyfra uuid), od najnowszej.
create function public.test_recent(profile int, year int default null)
returns int[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(right(e ->> 'play_id', 12)::int order by o), '{}')
    from jsonb_array_elements(public.test_stats(profile, year) -> 'recent_plays') with ordinality as x(e, o);
$$;
grant execute on function public.test_recent(int, int) to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000013", "role": "authenticated"}';

-- =============================================================================================
-- Liczniki, serie i remisy (STAT-1, §5.6.3, §5.6.4)
-- =============================================================================================
select is(public.test_totals(11), '4/7/4/56 seria 2/1',
  'Łukasz: 4 spotkania, 7 partii, 4 wygrane (z remisem o 1. miejsce), 56 pkt; rekord 2, bieżąca 1');
select is(public.test_totals(12), '3/3/1/20 seria 1/0',
  'Lucyna: wygrana z remisu liczy się, przegrana w m4 zeruje bieżącą serię');
select is(public.test_totals(13), '3/3/2/26 seria 2/0', 'Mateusz: rekord 2, bieżąca 0');
select is(public.test_stats(11) -> 'years', '[2026, 2025]'::jsonb,
  'lata gracza w strefie klubu, od najnowszego (23:30 31 grudnia to jeszcze 2025)');

-- =============================================================================================
-- Zero partii (Bartek ma tylko szkic)
-- =============================================================================================
select is(public.test_totals(15), '0/0/0/0 seria 0/0', 'zero partii: same zera (szkic się nie liczy)');
select is(public.test_places(15), '-/-/-', 'zero partii: brak miejsc w rankingach');
select ok(public.test_stats(15) -> 'favorite_game' = 'null'::jsonb, 'zero partii: brak ulubionej gry');
select ok(public.test_stats(15) -> 'best_game' = 'null'::jsonb, 'zero partii: brak najlepszej gry');
select is(public.test_stats(15) -> 'recent_plays', '[]'::jsonb, 'zero partii: pusta lista partii');
select is(public.test_stats(15) -> 'years', '[]'::jsonb, 'zero partii: brak lat w filtrze');

-- =============================================================================================
-- Miejsca w trzech rankingach (STAT-1, LB-6, LB-7)
-- =============================================================================================
select is(public.test_places(11), '1/1/1', 'Łukasz: 1. w punktach i wygranych, wspólne 1. w serii');
select is(public.test_places(13), '2/2/1', 'Mateusz: wspólne 1. miejsce w serii (rekord 2 jak Łukasz)');
select is(public.test_places(12), '3/3/3', 'Lucyna: 3. miejsca (usunięta Celina nie wyprzedza)');

-- =============================================================================================
-- Ulubiona i najlepsza gra (STAT-2, Q21) — próg trzech partii
-- =============================================================================================
select is(public.test_stats(11) -> 'favorite_game' ->> 'title', 'Azul',
  'ulubiona: Azul i Brzdęk po 3 partie, remis rozstrzyga więcej wygranych (2 > 1)');
select is(public.test_stats(11) -> 'best_game' ->> 'title', 'Azul',
  'najlepsza: Carcassonne ma 100% z 1 partii, ale liczą się gry z ≥ 3 partiami');
select is(public.test_stats(11) -> 'best_game', jsonb_build_object(
    'game_id', '00000000-0000-4000-b000-000000000001', 'title', 'Azul', 'plays', 3, 'wins', 2),
  'najlepsza gra z liczbą partii i wygranych');
select ok(public.test_stats(12) -> 'best_game' = 'null'::jsonb,
  'Lucyna: brak gry z ≥ 3 partiami, więc najlepsza gra jest pusta');
select is(public.test_stats(13) -> 'favorite_game' ->> 'title', 'Brzdęk', 'Mateusz: ulubiona Brzdęk (2 partie)');

-- =============================================================================================
-- Ostatnie partie (STAT-2, §5.6.6 od najnowszej)
-- =============================================================================================
select is(public.test_recent(11), array[7, 6, 5, 4, 3, 2, 1],
  'ostatnie partie od najnowszej: spotkania malejąco, w spotkaniu po saved_at malejąco');
select is((public.test_stats(11) -> 'recent_plays' -> 0) - 'starts_at', jsonb_build_object(
    'play_id', '00000000-0000-4000-f000-000000000007', 'meeting_id', '00000000-0000-4000-c000-000000000004',
    'meeting_title', 'Marzec', 'game_id', '00000000-0000-4000-b000-000000000003', 'game_title', 'Carcassonne',
    'place', 1, 'points', 10, 'is_win', true),
  'wpis partii: spotkanie do linku, gra, miejsce, punkty, wygrana');

-- =============================================================================================
-- Filtr roku (STAT-3, LB-4, NFR-10)
-- =============================================================================================
select is(public.test_totals(11, 2025), '1/1/1/10 seria 1/1', 'rok 2025: tylko sylwestrowe spotkanie');
select is(public.test_totals(11, 2026), '3/6/3/46 seria 1/1', 'rok 2026: seria liczona tylko w obrębie roku');
select is(public.test_places(12, 2025), '2/2/2', 'miejsca w rankingach tego samego roku');
select is(public.test_recent(11, 2025), array[1], 'ostatnie partie tylko z wybranego roku');
select is(public.test_stats(11, 2025) -> 'years', '[2026, 2025]'::jsonb, 'lata filtru zawsze z całej historii');
select is(public.test_totals(11, 2024), '0/0/0/0 seria 0/0', 'rok bez partii: same zera');
select throws_ok($$ select public.test_stats(11, 0) $$, '22023', null, 'rok spoza zakresu to błąd 22023');

-- =============================================================================================
-- Usunięty członek (MEM-5) i brak profilu
-- =============================================================================================
select is(public.test_totals(14), '1/1/1/10 seria 1/1', 'usunięta Celina zachowuje historyczne statystyki');
select is(public.test_places(14), '-/-/-', 'usunięty członek nie ma miejsc w rankingach (LB-7)');
select ok(public.player_stats('00000000-0000-4000-a000-000000000099') is null, 'brak profilu: NULL');

-- =============================================================================================
-- Uprawnienia
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000014", "role": "authenticated"}';
select ok(public.test_stats(11) is null, 'usunięte konto nie widzi profili ani partii (RLS)');
reset role;
select ok(not has_function_privilege('anon', 'public.player_stats(uuid, int)', 'execute'),
  'anon nie wywoła player_stats');
set local role authenticated;

-- =============================================================================================
-- Usunięcie partii przelicza statystyki (§5.6.5)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.delete_play('00000000-0000-4000-f000-000000000004') $$,
  'admin usuwa p4 (Azul, wygrana Mateusza)');
select is(public.test_totals(11), '4/6/4/50 seria 2/1', 'Łukasz: o jedną partię i 6 pkt mniej');
select is(public.test_stats(11) -> 'best_game' ->> 'title', 'Brzdęk',
  'Azul spada poniżej progu 3 partii, najlepszą grą zostaje Brzdęk (1/3)');
select lives_ok($$ select public.delete_play('00000000-0000-4000-f000-000000000003') $$,
  'admin usuwa p3 (Brzdęk, wygrana Mateusza)');
select is(public.test_totals(13), '1/1/0/6 seria 0/0', 'Mateusz: zostaje jedna przegrana partia, seria 0');
select is(public.test_places(13), '3/3/3', 'Mateusz spada na 3. miejsca we wszystkich rankingach');

select * from finish();

rollback;
