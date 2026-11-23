-- Statystyki gracza: public.player_stats(profile_id, date_from, date_to, game_ids) i rekordy
-- osobiste public.player_records(...) (PRD STAT-1–STAT-3, USR-4, MEM-5, §5.6, Q21, Q25, NFR-11).
-- Dane fikcyjne. Wartość decydująca (ranking_value) = punkty z notesu.
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
-- Celina jest usunięta (MEM-4). Bartek ma tylko szkic (zero partii). D „Dixit” jest usunięta bez partii.
begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

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
  ('00000000-0000-4000-b000-000000000003', 'Carcassonne', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000004', 'Dixit', 2, 4, '{10,6,4,2}');
update public.games set deleted_at = '2026-11-01 12:00+01' where id = '00000000-0000-4000-b000-000000000004';
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

-- Statystyki gracza a0NN z filtrami (NULL = bez ograniczenia).
create function public.test_stats(profile int, date_from date default null, date_to date default null, games int[] default null)
returns jsonb
language sql
set search_path = ''
as $$
  select public.player_stats(('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid, date_from, date_to,
    (select array_agg(('00000000-0000-4000-b000-' || lpad(g::text, 12, '0'))::uuid) from unnest(games) g));
$$;
grant execute on function public.test_stats(int, date, date, int[]) to authenticated;

-- Liczniki z filtrami jako tekst: „spotkania/partie/wygrane”.
create function public.test_filtered(profile int, date_from date default null, date_to date default null, games int[] default null)
returns text
language sql
set search_path = ''
as $$
  select s ->> 'meetings' || '/' || (s ->> 'plays') || '/' || (s ->> 'wins')
    from public.test_stats(profile, date_from, date_to, games) s;
$$;
grant execute on function public.test_filtered(int, date, date, int[]) to authenticated;

-- Liczniki z całej historii: „punkty/wygrane seria rekord/bieżąca miejsca punkty/wygrane”.
create function public.test_career(profile int, date_from date default null, date_to date default null, games int[] default null)
returns text
language sql
set search_path = ''
as $$
  select (s ->> 'points') || '/' || (s ->> 'wins_total') || ' seria ' || (s ->> 'streak_record') || '/'
         || (s ->> 'streak_current') || ' miejsca ' || coalesce(s -> 'places' ->> 'points', '-') || '/'
         || coalesce(s -> 'places' ->> 'wins', '-')
    from public.test_stats(profile, date_from, date_to, games) s;
$$;
grant execute on function public.test_career(int, date, date, int[]) to authenticated;

-- Numery spotkań z `recent_meetings`, od najnowszego.
create function public.test_recent(profile int)
returns int[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(right(e ->> 'meeting_id', 12)::int order by o), '{}')
    from jsonb_array_elements(public.test_stats(profile) -> 'recent_meetings') with ordinality as x(e, o);
$$;
grant execute on function public.test_recent(int) to authenticated;

-- Rekordy osobiste jako tekst: „tytuł:wartość@partia*” (* = rekord klubu, - = brak wyniku).
create function public.test_records(profile int, date_from date default null, date_to date default null, games int[] default null)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(r.title || ':' || coalesce(r.value::int::text || '@' || right(r.play_id::text, 1), '-')
                            || case when r.club_record then '*' else '' end), '{}')
    from public.player_records(('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid, date_from, date_to,
      (select array_agg(('00000000-0000-4000-b000-' || lpad(g::text, 12, '0'))::uuid) from unnest(games) g)) r;
$$;
grant execute on function public.test_records(int, date, date, int[]) to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000013", "role": "authenticated"}';

-- =============================================================================================
-- Statystyki profilu bez filtrów (STAT-1, §5.6.3)
-- =============================================================================================
select is(public.test_filtered(11), '4/7/4', 'Łukasz: 4 spotkania, 7 partii, 4 wygrane (z remisem o 1. miejsce)');
select is(public.test_filtered(12), '3/3/1', 'Lucyna: wygrana z remisu liczy się');
select is(public.test_filtered(13), '3/3/2', 'Mateusz');

-- =============================================================================================
-- Filtry dat i gier jak w rankingu (LB-4, NFR-10)
-- =============================================================================================
select is(public.test_filtered(11, '2026-01-01', '2026-12-31'), '3/6/3', 'rok 2026 jako zakres dni');
select is(public.test_filtered(11, '2025-12-31', '2025-12-31'), '1/1/1',
  'jeden dzień w strefie klubu: 23:30 31 grudnia to jeszcze 31 grudnia');
select is(public.test_filtered(11, null, null, array[2]), '3/3/1', 'tylko Brzdęk: 3 spotkania, 3 partie, 1 wygrana');
select is(public.test_filtered(11, '2026-02-01', null, array[1]), '1/1/0', 'filtry łączą się: od lutego i tylko Azul');
select is(public.test_filtered(11, null, null, '{}'), '4/7/4', 'pusta lista gier = wszystkie gry');
select is(public.test_filtered(11, '2024-01-01', '2024-12-31'), '0/0/0', 'zakres bez partii: same zera');
select throws_ok($$ select public.test_stats(11, '2026-02-01', '2026-01-01') $$, '22023', null,
  'pusty zakres dat to błąd 22023');

-- =============================================================================================
-- Ranking z całej historii (bez filtrów, §5.6.4, LB-1)
-- =============================================================================================
select is(public.test_career(11), '56/4 seria 2/1 miejsca 1/1', 'Łukasz: 56 pkt, 4 wygrane, seria 2/1, 1. miejsca');
select is(public.test_career(11, '2025-12-31', '2025-12-31', array[3]), '56/4 seria 2/1 miejsca 1/1',
  'filtry nie zmieniają grupy rankingu');
select is(public.test_career(12), '20/1 seria 1/0 miejsca 3/3', 'Lucyna: przegrana w m4 zeruje bieżącą serię');
select is(public.test_career(13), '26/2 seria 2/0 miejsca 2/2', 'Mateusz');
select ok(not (public.test_stats(11) -> 'places' ? 'streak'), 'brak miejsca w rankingu serii');

-- =============================================================================================
-- Ulubione z całej historii (STAT-2, Q21) — próg trzech partii
-- =============================================================================================
select is(public.test_stats(11) -> 'favorite_game' ->> 'title', 'Azul',
  'ulubiona: Azul i Brzdęk po 3 partie, remis rozstrzyga więcej wygranych (2 > 1)');
select is(public.test_stats(11) -> 'best_game', jsonb_build_object(
    'game_id', '00000000-0000-4000-b000-000000000001', 'title', 'Azul', 'cover_path', null, 'plays', 3, 'wins', 2),
  'najlepsza: Carcassonne ma 100% z 1 partii, ale liczą się gry z ≥ 3 partiami');
select is(public.test_stats(11, null, null, array[3]) -> 'favorite_game' ->> 'title', 'Azul',
  'filtr gier nie zmienia ulubionej gry');
select ok(public.test_stats(12) -> 'best_game' = 'null'::jsonb,
  'Lucyna: brak gry z ≥ 3 partiami, więc najlepsza gra jest pusta');

-- =============================================================================================
-- Ostatnie spotkania (5 najnowszych z partiami gracza, §5.6.6)
-- =============================================================================================
select is(public.test_recent(11), array[4, 3, 2, 1], 'spotkania od najnowszego');
select is((public.test_stats(11) -> 'recent_meetings' -> 0) - 'starts_at', jsonb_build_object(
    'meeting_id', '00000000-0000-4000-c000-000000000004', 'title', 'Marzec', 'plays', 2, 'wins', 2, 'points', 20),
  'wpis spotkania: link, tytuł, partie, wygrane i punkty gracza');
select is(public.test_recent(12), array[4, 2, 1], 'Lucyna: tylko spotkania z jej partiami');

-- =============================================================================================
-- Zero partii (Bartek ma tylko szkic)
-- =============================================================================================
select is(public.test_filtered(15), '0/0/0', 'zero partii: same zera (szkic się nie liczy)');
select is(public.test_career(15), '0/0 seria 0/0 miejsca -/-', 'zero partii: brak miejsc w rankingach');
select ok(public.test_stats(15) -> 'favorite_game' = 'null'::jsonb, 'zero partii: brak ulubionej gry');
select is(public.test_stats(15) -> 'recent_meetings', '[]'::jsonb, 'zero partii: pusta lista spotkań');

-- =============================================================================================
-- Rekordy osobiste (USR-4, Q25): każda gra, także bez wyniku; pieczątka rekordu klubu
-- =============================================================================================
select is(public.test_records(11), array['Azul:10@1*', 'Brzdęk:10@6*', 'Carcassonne:10@7*'],
  'Łukasz: rekord w każdej grze, wszystkie równe rekordom klubu; usunięta gra bez partii pominięta');
select is(public.test_records(12), array['Azul:8@2', 'Brzdęk:-', 'Carcassonne:6@7'],
  'Lucyna: gra bez partii bez wyniku, rekordy poniżej rekordów klubu');
select is(public.test_records(15), array['Azul:-', 'Brzdęk:-', 'Carcassonne:-'], 'zero partii: same gry bez wyników');
select is(public.test_records(11, '2026-01-01', '2026-12-31'), array['Azul:8@2', 'Brzdęk:10@6*', 'Carcassonne:10@7*'],
  'filtr dat: rekord z zakresu, pieczątka nadal względem rekordu klubu z całej historii');
select is(public.test_records(11, null, null, array[2]), array['Brzdęk:10@6*'], 'filtr gier');
select is(public.test_records(13), array['Azul:10@4*', 'Brzdęk:10@3*', 'Carcassonne:-'],
  'Mateusz: rekordy z jego partii, gra bez wyniku');
select throws_ok($$ select public.test_records(11, '2026-02-01', '2026-01-01') $$, '22023', null,
  'rekordy: pusty zakres dat to błąd 22023');

-- =============================================================================================
-- Usunięty członek (MEM-5) i brak profilu
-- =============================================================================================
select is(public.test_filtered(14), '1/1/1', 'usunięta Celina zachowuje historyczne statystyki');
select is(public.test_career(14), '10/1 seria 1/1 miejsca -/-', 'usunięty członek nie ma miejsc w rankingach (LB-7)');
select ok(public.player_stats('00000000-0000-4000-a000-000000000099') is null, 'brak profilu: NULL');

-- =============================================================================================
-- Uprawnienia
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000014", "role": "authenticated"}';
select ok(public.test_stats(11) is null, 'usunięte konto nie widzi profili ani partii (RLS)');
select is(public.test_records(11), '{}'::text[], 'usunięte konto nie widzi rekordów (RLS)');
reset role;
select ok(not has_function_privilege('anon', 'public.player_stats(uuid, date, date, uuid[])', 'execute'),
  'anon nie wywoła player_stats');
select ok(not has_function_privilege('anon', 'public.player_records(uuid, date, date, uuid[])', 'execute'),
  'anon nie wywoła player_records');
set local role authenticated;

-- =============================================================================================
-- Usunięcie partii przelicza statystyki i rekordy (§5.6.5)
-- =============================================================================================
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.delete_play('00000000-0000-4000-f000-000000000004') $$,
  'admin usuwa p4 (Azul, wygrana Mateusza)');
select is(public.test_filtered(11), '4/6/4', 'Łukasz: o jedną partię mniej');
select is(public.test_career(11), '50/4 seria 2/1 miejsca 1/1', 'Łukasz: 6 pkt mniej');
select is(public.test_stats(11) -> 'best_game' ->> 'title', 'Brzdęk',
  'Azul spada poniżej progu 3 partii, najlepszą grą zostaje Brzdęk (1/3)');
select is(public.test_records(13), array['Azul:-', 'Brzdęk:10@3*', 'Carcassonne:-'], 'Mateusz traci rekord w Azul');
select lives_ok($$ select public.delete_play('00000000-0000-4000-f000-000000000003') $$,
  'admin usuwa p3 (Brzdęk, wygrana Mateusza)');
select is(public.test_filtered(13), '1/1/0', 'Mateusz: zostaje jedna przegrana partia');
select is(public.test_career(13), '6/0 seria 0/0 miejsca 3/3', 'Mateusz spada na 3. miejsca');
select is(public.test_records(13), array['Azul:-', 'Brzdęk:6@6', 'Carcassonne:-'], 'Mateusz: rekord 6 poniżej rekordu klubu');

select * from finish();

rollback;
