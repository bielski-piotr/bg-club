-- [035] Statystyki gry i podsumowanie spotkania: public.game_stats(game_id),
-- public.meeting_summary(meeting_id) (PRD GAME-11, VIEW-4, §5.6, Q25, NFR-11). Dane fikcyjne.
--
-- Gra Ż „Żółwie” (punktacja 10/6/4/2), wersje notesu: e1 „więcej = lepiej”, e2 „mniej = lepiej”.
-- Gra G „Golf” (punktacja 10/6/4), wersja e3 „mniej = lepiej” (asc).
--   m1 2026-01-10: p1 Ż/e1: Łukasz 1 (30, 10), Lucyna 2 (20, 6)
--                  p2 G/e3: Lucyna 1 (40, 10), Mateusz 2 (45, 6), Łukasz 3 (50, 4)
--   m2 2026-02-10: p3 Ż/e1: Lucyna 1 (30, 8, remis), Łukasz 1 (30, 8, remis), Mateusz 3 (null, 4)
--                  p4 G/e3: Mateusz 1 (38, 10), Celina 2 (41, 6)
--   m3 2026-03-10: p5 Ż/e1: Mateusz 1 (25, 10), Łukasz 2 (24, 6); p6 szkic Ż (Bartek)
--   m4 2026-04-10: p7 Ż/e2 (asc!): Celina 1 (5, 10), Lucyna 2 (9, 6)
-- Celina jest usunięta (MEM-4). Bartek ma tylko szkic.
begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw');

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000011', 'lukasz-nowak-a011', 'Łukasz', 'Nowak', 'player'),
  ('00000000-0000-4000-a000-000000000012', 'lucyna-kowal-a012', 'Lucyna', 'Kowal', 'player'),
  ('00000000-0000-4000-a000-000000000013', 'mateusz-zielinski-a013', 'Mateusz', 'Zieliński', 'player'),
  ('00000000-0000-4000-a000-000000000014', 'celina-usunieta-a014', 'Celina', 'Usunięta', 'player'),
  ('00000000-0000-4000-a000-000000000015', 'bartek-bezpartii-a015', 'Bartek', 'Bezpartii', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Golf', 2, 3, '{10,6,4}'),
  ('00000000-0000-4000-b000-000000000003', 'Nowa gra', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Karta');
insert into public.scorepad_versions (id, scorepad_id, version, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', 1,
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "total", "kind": "total"}]}', 4),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000001', 2,
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "total", "kind": "total"}],
     "ranking": {"line": "total", "dir": "asc", "tiebreak": []}}', 4),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000002', 1,
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "total", "kind": "total"}],
     "ranking": {"line": "total", "dir": "asc", "tiebreak": []}}', 3);

set local session_replication_role = replica;

insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Styczeń', '2026-01-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-01-10 18:00+01', '2026-01-10 23:00+01'),
  ('00000000-0000-4000-c000-000000000002', 'Luty', '2026-02-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-02-10 18:00+01', '2026-02-10 23:00+01'),
  ('00000000-0000-4000-c000-000000000003', 'Marzec', '2026-03-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-03-10 18:00+01', '2026-03-10 23:00+01'),
  ('00000000-0000-4000-c000-000000000004', 'Kwiecień', '2026-04-10 18:00+02', 'in_progress', false,
   '00000000-0000-4000-a000-000000000001', '2026-04-10 18:00+02', null),
  ('00000000-0000-4000-c000-000000000005', 'Maj', '2026-05-10 18:00+02', 'planned', false,
   '00000000-0000-4000-a000-000000000001', null, null);

insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p where p.role = 'player';

-- Partia: (n, spotkanie, gra, wersja notesu, status, saved_at).
create function pg_temp.play(n int, meeting int, game int, version int, status text, saved_at timestamptz)
returns void
language sql
as $$
  insert into public.plays (id, meeting_id, game_id, scorepad_version_id, status, points_snapshot, started_by, saved_at)
  values (('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid,
          ('00000000-0000-4000-c000-' || lpad(meeting::text, 12, '0'))::uuid,
          ('00000000-0000-4000-b000-' || lpad(game::text, 12, '0'))::uuid,
          ('00000000-0000-4000-e000-' || lpad(version::text, 12, '0'))::uuid,
          status, '{10,6,4,2}', '00000000-0000-4000-a000-000000000001', saved_at);
$$;

-- Wynik: (partia, gracz a0NN, miejsce w notesie, miejsce, punkty, wartość decydująca).
create function pg_temp.result(play int, profile int, seat int, place int, points int, value numeric,
                               tied boolean default false)
returns void
language sql
as $$
  insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value)
  select p.id, p.meeting_id, ('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid,
         seat, place, tied, points, place = 1, value
    from public.plays p where p.id = ('00000000-0000-4000-f000-' || lpad(play::text, 12, '0'))::uuid;
$$;

select pg_temp.play(1, 1, 1, 1, 'saved', '2026-01-10 19:00+01');
select pg_temp.result(1, 11, 1, 1, 10, 30), pg_temp.result(1, 12, 2, 2, 6, 20);
select pg_temp.play(2, 1, 2, 3, 'saved', '2026-01-10 20:00+01');
select pg_temp.result(2, 12, 1, 1, 10, 40), pg_temp.result(2, 13, 2, 2, 6, 45), pg_temp.result(2, 11, 3, 3, 4, 50);
select pg_temp.play(3, 2, 1, 1, 'saved', '2026-02-10 19:00+01');
select pg_temp.result(3, 12, 1, 1, 8, 30, true), pg_temp.result(3, 11, 2, 1, 8, 30, true),
       pg_temp.result(3, 13, 3, 3, 4, null);
select pg_temp.play(4, 2, 2, 3, 'saved', '2026-02-10 20:00+01');
select pg_temp.result(4, 13, 1, 1, 10, 38), pg_temp.result(4, 14, 2, 2, 6, 41);
select pg_temp.play(5, 3, 1, 1, 'saved', '2026-03-10 19:00+01');
select pg_temp.result(5, 13, 1, 1, 10, 25), pg_temp.result(5, 11, 2, 2, 6, 24);
select pg_temp.play(6, 3, 1, 1, 'draft', null);
insert into public.play_results (play_id, meeting_id, profile_id, seat) values
  ('00000000-0000-4000-f000-000000000006', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000015', 1);
select pg_temp.play(7, 4, 1, 2, 'saved', '2026-04-10 19:00+02');
select pg_temp.result(7, 14, 1, 1, 10, 5), pg_temp.result(7, 12, 2, 2, 6, 9);

update public.profiles set deleted_at = '2026-11-01 12:00+01' where id = '00000000-0000-4000-a000-000000000014';

reset session_replication_role;

-- Ranking gry jako tekst: „miejsce imię wygrane/punkty/partie[ usunięty]”.
create function public.test_game_ranking(game int)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(e ->> 'place' || ' ' || pr.first_name || ' ' || (e ->> 'wins') || '/'
           || (e ->> 'points') || '/' || (e ->> 'plays')
           || case when (e ->> 'deleted')::boolean then ' usunięty' else '' end order by o), '{}')
    from jsonb_array_elements(public.game_stats(('00000000-0000-4000-b000-' || lpad(game::text, 12, '0'))::uuid) -> 'ranking')
         with ordinality as x(e, o)
    join public.profiles pr on pr.id = (e ->> 'profile_id')::uuid;
$$;
grant execute on function public.test_game_ranking(int) to authenticated;

-- Imiona z tablicy obiektów z `profile_id` (rekordziści, najczęstsi zwycięzcy).
create function public.test_names(items jsonb)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(pr.first_name order by o), '{}')
    from jsonb_array_elements(items) with ordinality as x(e, o)
    join public.profiles pr on pr.id = (e ->> 'profile_id')::uuid;
$$;
grant execute on function public.test_names(jsonb) to authenticated;

-- Podsumowanie spotkania jako tekst: „miejsce imię punkty wygrane przed→po [gry]”.
create function public.test_summary(meeting int)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(s.place || ' ' || pr.first_name || ' ' || s.points || ' ' || s.wins || ' '
           || s.streak_before || '→' || s.streak_after || ' '
           || (select string_agg((g ->> 'title') || ' +' || (g ->> 'points') || '/' || (g ->> 'wins'), ', '
                                 order by o)
                 from jsonb_array_elements(s.games) with ordinality as y(g, o))
           || case when s.deleted then ' usunięty' else '' end), '{}')
    from public.meeting_summary(('00000000-0000-4000-c000-' || lpad(meeting::text, 12, '0'))::uuid) s
    join public.profiles pr on pr.id = s.profile_id;
$$;
grant execute on function public.test_summary(int) to authenticated;

-- =============================================================================================
-- Uprawnienia
-- =============================================================================================
select ok(not has_function_privilege('anon', 'public.game_stats(uuid)', 'execute'), 'anon nie wywoła game_stats');
select ok(not has_function_privilege('anon', 'public.meeting_summary(uuid)', 'execute'),
  'anon nie wywoła meeting_summary');
select is((select prosecdef from pg_proc where oid = 'public.game_stats(uuid)'::regprocedure), false,
  'game_stats działa z prawami wywołującego');
select is((select prosecdef from pg_proc where oid = 'public.meeting_summary(uuid)'::regprocedure), false,
  'meeting_summary działa z prawami wywołującego');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000014", "role": "authenticated"}';
select is(public.game_stats('00000000-0000-4000-b000-000000000001'), null,
  'usunięty członek nie widzi statystyk (RLS)');
select is((select count(*) from public.meeting_summary('00000000-0000-4000-c000-000000000001'))::int, 0,
  'usunięty członek nie widzi podsumowania (RLS)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000013", "role": "authenticated"}';

-- =============================================================================================
-- game_stats (GAME-11)
-- =============================================================================================
select is(public.game_stats('00000000-0000-4000-b000-0000000000ff'), null, 'nieistniejąca gra: NULL');
select is(public.game_stats('00000000-0000-4000-b000-000000000003'),
  '{"play_count": 0, "last_played_at": null, "top_winners": [], "record": null, "winner_average": null, "ranking": []}'::jsonb,
  'gra bez partii: zera i puste listy');

select is((public.game_stats('00000000-0000-4000-b000-000000000001') ->> 'play_count')::int, 4,
  'Żółwie: 4 zapisane partie, szkic się nie liczy');
select is((public.game_stats('00000000-0000-4000-b000-000000000001') ->> 'last_played_at')::timestamptz,
  '2026-04-10 18:00+02'::timestamptz, 'ostatnia partia: termin spotkania m4 (w trakcie)');
select is(public.test_game_ranking(1),
  array['1 Łukasz 2/24/3', '2 Lucyna 1/20/3', '3 Mateusz 1/14/2', '4 Celina 1/10/1 usunięty'],
  'ranking gry: wygrane, potem punkty; remis o 1. miejsce daje wygraną obu; usunięta na końcu');
select is(public.test_names(public.game_stats('00000000-0000-4000-b000-000000000001') -> 'top_winners'),
  array['Łukasz'], 'najczęstszy zwycięzca Żółwi');

-- Ostatnia partia Żółwi jest z wersji „mniej = lepiej”: rekord i średnia tylko z partii e2.
select is(public.game_stats('00000000-0000-4000-b000-000000000001') -> 'record' ->> 'dir', 'asc',
  'kierunek rekordu z wersji notesu ostatniej partii');
select is((public.game_stats('00000000-0000-4000-b000-000000000001') -> 'record' ->> 'value')::numeric, 5::numeric,
  'rekord liczony tylko z partii wersji o tym samym kierunku');
select is((public.game_stats('00000000-0000-4000-b000-000000000001') ->> 'winner_average')::numeric, 5::numeric,
  'średni wynik zwycięzcy z tych samych partii');

-- Golf: „mniej = lepiej” (asc) w jedynej wersji.
select is((public.game_stats('00000000-0000-4000-b000-000000000002') -> 'record' ->> 'value')::numeric, 38::numeric,
  'gra asc: rekordem jest najmniejsza wartość');
select is(public.test_names(public.game_stats('00000000-0000-4000-b000-000000000002') -> 'record' -> 'holders'),
  array['Mateusz'], 'gra asc: rekordzista');
select is((public.game_stats('00000000-0000-4000-b000-000000000002') ->> 'winner_average')::numeric, 39::numeric,
  'gra asc: średnia zwycięzców (40 + 38) / 2');
select is(public.test_names(public.game_stats('00000000-0000-4000-b000-000000000002') -> 'top_winners'),
  array['Lucyna', 'Mateusz'], 'remis najczęstszych zwycięzców: wszyscy, alfabetycznie');

-- Usunięcie partii wersji e2 przywraca kierunek „więcej = lepiej” i wspólny rekord (Q25).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.delete_play('00000000-0000-4000-f000-000000000007') $$,
  'admin usuwa p7 (jedyną partię wersji e2)');
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000013", "role": "authenticated"}';

select is(public.game_stats('00000000-0000-4000-b000-000000000001') -> 'record' ->> 'dir', 'desc',
  'po usunięciu partii e2 obowiązuje kierunek wersji e1');
select is((public.game_stats('00000000-0000-4000-b000-000000000001') -> 'record' ->> 'value')::numeric, 30::numeric,
  'rekord 30 (wartość NULL Mateusza pominięta)');
select is(public.test_names(public.game_stats('00000000-0000-4000-b000-000000000001') -> 'record' -> 'holders'),
  array['Łukasz', 'Lucyna'], 'równy rekord: wszyscy rekordziści, od najwcześniejszego (Q25)');
select is((public.game_stats('00000000-0000-4000-b000-000000000001') -> 'record' -> 'holders' -> 0 ->> 'meeting_id')::uuid,
  '00000000-0000-4000-c000-000000000001'::uuid, 'rekordzista z pierwszą partią, w której osiągnął rekord');
select is(round((public.game_stats('00000000-0000-4000-b000-000000000001') ->> 'winner_average')::numeric, 2),
  28.75::numeric, 'średnia zwycięzców (30 + 30 + 30 + 25) / 4 z remisem o 1. miejsce');

-- =============================================================================================
-- meeting_summary (VIEW-4)
-- =============================================================================================
select is(public.test_summary(1),
  array['1 Lucyna 16 1 0→1 Żółwie +6/0, Golf +10/1',
        '2 Łukasz 14 1 0→1 Żółwie +10/1, Golf +4/0',
        '3 Mateusz 6 0 0→0 Golf +6/0'],
  'm1: punkty i wygrane z rozbiciem na gry w kolejności partii; seria od zera');
select is(public.test_summary(2),
  array['1 Mateusz 14 1 0→1 Żółwie +4/0, Golf +10/1',
        '2 Lucyna 8 1 1→2 Żółwie +8/1',
        '2 Łukasz 8 1 1→2 Żółwie +8/1',
        '4 Celina 6 0 0→0 Golf +6/0 usunięty'],
  'm2: remis o 1. miejsce przedłuża serię obu; remis punktów alfabetycznie; usunięta na końcu');
select is(public.test_summary(3),
  array['1 Mateusz 10 1 1→2 Żółwie +10/1', '2 Łukasz 6 0 2→0 Żółwie +6/0'],
  'm3: seria przerwana; szkic Bartka się nie liczy');
select is(public.test_summary(5), '{}'::text[], 'spotkanie bez partii: puste podsumowanie');

-- Usunięcie partii przelicza serie kolejnych spotkań (§5.6.5).
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.delete_play('00000000-0000-4000-f000-000000000003') $$,
  'admin usuwa p3 (remis Lucyny i Łukasza w m2)');
select is(public.test_summary(3),
  array['1 Mateusz 10 1 1→2 Żółwie +10/1', '2 Łukasz 6 0 1→0 Żółwie +6/0'],
  'm3 po usunięciu p3: seria Łukasza przed spotkaniem 1');

select * from finish();

rollback;
