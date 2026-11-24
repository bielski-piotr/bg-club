-- Głosowanie na termin (`save_meeting` z `date_options`, `meeting_date_votes`,
-- `decide_meeting_date`, `reopen_date_voting`), rekordy w partiach (`meeting_play_records`,
-- `play_record_preview`) i zmiany w klasyfikacji punktów (`meeting_leaderboard_changes`).
-- Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw');

-- a001 Ada: admin; a011 Łukasz, a012 Lucyna, a013 Mateusz: gracze; a015 Filip spoza spotkania.
insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000011', 'lukasz-nowak-a011', 'Łukasz', 'Nowak', 'player'),
  ('00000000-0000-4000-a000-000000000012', 'lucyna-kowal-a012', 'Lucyna', 'Kowal', 'player'),
  ('00000000-0000-4000-a000-000000000013', 'mateusz-zielinski-a013', 'Mateusz', 'Zieliński', 'player'),
  ('00000000-0000-4000-a000-000000000015', 'filip-obok-a015', 'Filip', 'Obok', 'player');

-- =============================================================================================
-- Głosowanie na termin
-- =============================================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ select public.save_meeting(
       '00000000-0000-4000-c000-000000000101', 'Grudniowe granie', '2030-12-05', '18:00',
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011',
             '00000000-0000-4000-a000-000000000012']::uuid[],
       null, true,
       '[{"date": "2030-12-05", "time": "18:00"}, {"date": "2030-12-06", "time": "17:30"},
         {"date": "2030-12-06", "time": "17:30"}]'::jsonb, true) $$,
  'admin planuje spotkanie z głosowaniem na termin i propozycjami (powtórzenia się łączą)');
select is((select count(*)::int from public.meeting_date_options
            where meeting_id = '00000000-0000-4000-c000-000000000101'), 2, 'dwie propozycje terminu');
select is((select date_voting_open from public.meetings where id = '00000000-0000-4000-c000-000000000101'),
  true, 'admin otworzył głosowanie na termin');
select is(
  (select array_agg(to_char(starts_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD HH24:MI') order by starts_at)
     from public.meeting_date_options where meeting_id = '00000000-0000-4000-c000-000000000101'),
  array['2030-12-05 18:00', '2030-12-06 17:30'], 'terminy w strefie klubu (NFR-10)');

-- Propozycje do testów: o1 = 5 grudnia, o2 = 6 grudnia.
create temp table opt on commit drop as
select row_number() over (order by starts_at)::int as n, id
  from public.meeting_date_options where meeting_id = '00000000-0000-4000-c000-000000000101';
grant select on opt to authenticated;

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000011", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.meeting_date_votes (option_id, meeting_id, profile_id)
     select id, '00000000-0000-4000-c000-000000000101', '00000000-0000-4000-a000-000000000011' from opt $$,
  'uczestnik głosuje na kilka terminów');
select throws_ok(
  $$ insert into public.meeting_date_votes (option_id, meeting_id, profile_id)
     select id, '00000000-0000-4000-c000-000000000101', '00000000-0000-4000-a000-000000000012' from opt where n = 1 $$,
  '42501', null, 'głos za innego uczestnika: odrzucony (RLS)');
select throws_ok(
  $$ select public.decide_meeting_date('00000000-0000-4000-c000-000000000101', (select id from opt where n = 1)) $$,
  '42501', null, 'gracz nie ustala terminu');

select lives_ok(
  $$ select public.propose_meeting_date('00000000-0000-4000-c000-000000000101', '2030-12-10', '19:00') $$,
  'uczestnik proponuje własny termin');
select lives_ok(
  $$ select public.propose_meeting_date('00000000-0000-4000-c000-000000000101', '2030-12-10', '19:00') $$,
  'ten sam termin drugi raz: bez duplikatu');
select is(
  (select count(*)::int || ' ' || bool_and(o.created_by = '00000000-0000-4000-a000-000000000011')
          || ' ' || (select count(*) from public.meeting_date_votes v where v.option_id = o.id)
     from public.meeting_date_options o
    where o.meeting_id = '00000000-0000-4000-c000-000000000101'
      and o.starts_at = '2030-12-10 19:00+01'
    group by o.id),
  '1 true 1', 'propozycja uczestnika z jego głosem, bez duplikatu');
select throws_ok(
  $$ select public.propose_meeting_date('00000000-0000-4000-c000-000000000101', '2020-01-10', '19:00') $$,
  '23514', null, 'termin w przeszłości: odrzucony');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000015", "role": "authenticated"}';
select throws_ok(
  $$ select public.propose_meeting_date('00000000-0000-4000-c000-000000000101', '2030-12-11', '19:00') $$,
  '42501', null, 'gracz spoza spotkania nie proponuje terminu');
select throws_ok(
  $$ insert into public.meeting_date_votes (option_id, meeting_id, profile_id)
     select id, '00000000-0000-4000-c000-000000000101', '00000000-0000-4000-a000-000000000015' from opt where n = 1 $$,
  '23503', null, 'głos spoza uczestników: odrzucony (klucz obcy)');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000012", "role": "authenticated"}';
select lives_ok(
  $$ insert into public.meeting_date_votes (option_id, meeting_id, profile_id)
     select id, '00000000-0000-4000-c000-000000000101', '00000000-0000-4000-a000-000000000012' from opt where n = 2 $$,
  'drugi uczestnik głosuje');
select lives_ok(
  $$ delete from public.meeting_date_votes where profile_id = '00000000-0000-4000-a000-000000000012' $$,
  'uczestnik cofa głos');
select is((select count(*)::int from public.meeting_date_votes
            where profile_id = '00000000-0000-4000-a000-000000000012'), 0, 'głos cofnięty');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$ select public.save_meeting(
       '00000000-0000-4000-c000-000000000101', 'Grudniowe granie (zmiana)', null, null,
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011',
             '00000000-0000-4000-a000-000000000012']::uuid[],
       null, false,
       '[{"date": "2030-12-06", "time": "17:30"}, {"date": "2030-12-07", "time": "16:00"},
         {"date": "2030-12-10", "time": "19:00"}]'::jsonb) $$,
  'admin zmienia listę propozycji');
select is(
  (select array_agg(to_char(o.starts_at at time zone 'Europe/Warsaw', 'MM-DD') || ':' ||
                    (select count(*) from public.meeting_date_votes v where v.option_id = o.id) order by o.starts_at)
     from public.meeting_date_options o where o.meeting_id = '00000000-0000-4000-c000-000000000101'),
  array['12-06:1', '12-07:0', '12-10:1'],
  'pozostała propozycja zachowuje głosy, usunięta kasuje swoje, nowa jest bez głosów');
select lives_ok(
  $$ select public.save_meeting(
       '00000000-0000-4000-c000-000000000101', 'Grudniowe granie (zmiana)', null, null,
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011',
             '00000000-0000-4000-a000-000000000012']::uuid[], null, false,
       (select jsonb_agg(jsonb_build_object('date', '2031-01-' || lpad(d::text, 2, '0'), 'time', '18:00'))
          from generate_series(1, 12) d)
       || '[{"date": "2030-12-06", "time": "17:30"}, {"date": "2030-12-07", "time": "16:00"},
            {"date": "2030-12-10", "time": "19:00"}]'::jsonb) $$,
  'propozycji może być więcej niż 10 (bez limitu)');
select is((select count(*)::int from public.meeting_date_options
            where meeting_id = '00000000-0000-4000-c000-000000000101'), 15, '15 propozycji');

select lives_ok(
  $$ select public.decide_meeting_date('00000000-0000-4000-c000-000000000101', (select id from opt where n = 2)) $$,
  'admin ustala termin z propozycji');
select is(
  (select to_char(starts_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD HH24:MI') || ' ' || date_voting_open
     from public.meetings where id = '00000000-0000-4000-c000-000000000101'),
  '2030-12-06 17:30 false', 'termin spotkania z propozycji, głosowanie na termin zamknięte');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000012", "role": "authenticated"}';
select throws_ok(
  $$ insert into public.meeting_date_votes (option_id, meeting_id, profile_id)
     select id, '00000000-0000-4000-c000-000000000101', '00000000-0000-4000-a000-000000000012' from opt where n = 2 $$,
  '23514', null, 'głos po zamknięciu głosowania na termin: odrzucony');
select throws_ok(
  $$ select public.reopen_date_voting('00000000-0000-4000-c000-000000000101') $$,
  '42501', null, 'gracz nie otwiera głosowania ponownie');

set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.reopen_date_voting('00000000-0000-4000-c000-000000000101') $$,
  'admin otwiera głosowanie na termin ponownie');
select is((select date_voting_open from public.meetings where id = '00000000-0000-4000-c000-000000000101'),
  true, 'głosowanie na termin znów otwarte');
select lives_ok($$ select public.start_meeting('00000000-0000-4000-c000-000000000101') $$,
  'admin rozpoczyna spotkanie');
select is((select date_voting_open from public.meetings where id = '00000000-0000-4000-c000-000000000101'),
  false, 'rozpoczęcie zamyka głosowanie na termin');
select throws_ok(
  $$ select public.save_meeting(
       '00000000-0000-4000-c000-000000000101', 'Grudniowe granie (zmiana)', null, null,
       array['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011',
             '00000000-0000-4000-a000-000000000012']::uuid[],
       null, false, '[{"date": "2030-12-09", "time": "18:00"}]'::jsonb) $$,
  '23514', null, 'propozycji terminu nie zmienia się w trwającym spotkaniu');
select throws_ok(
  $$ select public.decide_meeting_date('00000000-0000-4000-c000-000000000101', (select id from opt where n = 2)) $$,
  '23514', null, 'terminu trwającego spotkania nie da się zmienić');

reset role;

-- =============================================================================================
-- Rekordy w partiach i zmiany w klasyfikacji punktów
-- =============================================================================================
-- Gra Ż (więcej = lepiej), gra G (mniej = lepiej).
--   m1 2026-01-10: p1 Ż: Łukasz 1 (30, 10), Lucyna 2 (20, 6)
--   m2 2026-02-10: p2 Ż: Mateusz 1 (40, 10), Lucyna 2 (35, 6), Łukasz 3 (30, 4)
--                  p3 G: Łukasz 1 (40, 10), Mateusz 2 (45, 6)
--   m3 2026-03-10: p4 G: Mateusz 1 (39, 10), Łukasz 2 (41, 6)
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Golf', 2, 3, '{10,6,4}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Karta');
insert into public.scorepad_versions (id, scorepad_id, version, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', 1,
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "total", "kind": "total"}]}', 4),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000002', 1,
   '{"v": 2, "lines": [{"id": "names", "kind": "names"}, {"id": "total", "kind": "total"}],
     "ranking": {"line": "total", "dir": "asc", "tiebreak": []}}', 3);

set local session_replication_role = replica;

insert into public.meetings (id, title, starts_at, status, voting_open, created_by, started_at, finished_at) values
  ('00000000-0000-4000-c000-000000000001', 'Styczeń', '2026-01-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-01-10 18:00+01', '2026-01-10 23:00+01'),
  ('00000000-0000-4000-c000-000000000002', 'Luty', '2026-02-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-02-10 18:00+01', '2026-02-10 23:00+01'),
  ('00000000-0000-4000-c000-000000000003', 'Marzec', '2026-03-10 18:00+01', 'finished', false,
   '00000000-0000-4000-a000-000000000001', '2026-03-10 18:00+01', '2026-03-10 23:00+01');
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p
 where p.role = 'player' and m.id::text like '00000000-0000-4000-c000-00000000000_';

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

create function pg_temp.result(play int, profile int, seat int, place int, points int, value numeric)
returns void
language sql
as $$
  insert into public.play_results (play_id, meeting_id, profile_id, seat, place, tied, points, is_win, ranking_value)
  select p.id, p.meeting_id, ('00000000-0000-4000-a000-' || lpad(profile::text, 12, '0'))::uuid,
         seat, place, false, points, place = 1, value
    from public.plays p where p.id = ('00000000-0000-4000-f000-' || lpad(play::text, 12, '0'))::uuid;
$$;

select pg_temp.play(1, 1, 1, 'saved', '2026-01-10 19:00+01');
select pg_temp.result(1, 11, 1, 1, 10, 30), pg_temp.result(1, 12, 2, 2, 6, 20);
select pg_temp.play(2, 2, 1, 'saved', '2026-02-10 19:00+01');
select pg_temp.result(2, 13, 1, 1, 10, 40), pg_temp.result(2, 12, 2, 2, 6, 35), pg_temp.result(2, 11, 3, 3, 4, 30);
select pg_temp.play(3, 2, 2, 'saved', '2026-02-10 20:00+01');
select pg_temp.result(3, 11, 1, 1, 10, 40), pg_temp.result(3, 13, 2, 2, 6, 45);
select pg_temp.play(4, 3, 2, 'saved', '2026-03-10 19:00+01');
select pg_temp.result(4, 13, 1, 1, 10, 39), pg_temp.result(4, 11, 2, 2, 6, 41);
select pg_temp.play(5, 3, 1, 'draft', null);
insert into public.play_results (play_id, meeting_id, profile_id, seat) values
  ('00000000-0000-4000-f000-000000000005', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000011', 1),
  ('00000000-0000-4000-f000-000000000005', '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000012', 2);

reset session_replication_role;

-- Rekordy jako tekst: „partia imię wartość K/O” (K = rekord klubu, O = osobisty).
create function public.test_records(meeting int)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(right(r.play_id::text, 1) || ' ' || pr.first_name || ' ' || r.value::text || ' '
           || case when r.club_record then 'K' else '-' end || case when r.personal_record then 'O' else '-' end
           order by r.play_id, pr.first_name), '{}')
    from public.meeting_play_records(('00000000-0000-4000-c000-' || lpad(meeting::text, 12, '0'))::uuid) r
    join public.profiles pr on pr.id = r.profile_id;
$$;
grant execute on function public.test_records(int) to authenticated;

-- Zmiany jako tekst: „imię +punkty suma_przed→suma_po miejsce_przed→miejsce_po [gry]”.
create function public.test_changes(meeting int, games uuid[] default null)
returns text[]
language sql
set search_path = ''
as $$
  select coalesce(array_agg(pr.first_name || ' +' || c.points::text || ' '
           || coalesce(c.total_before::text, '-') || '→' || c.total_after::text || ' '
           || coalesce(c.place_before::text, '-') || '→' || c.place_after::text || ' '
           || (select string_agg((g ->> 'title') || ' ' || (g ->> 'points'), ', ' order by o)
                 from jsonb_array_elements(c.games) with ordinality as x(g, o))
           order by c.place_after), '{}')
    from public.meeting_leaderboard_changes(
           ('00000000-0000-4000-c000-' || lpad(meeting::text, 12, '0'))::uuid, games) c
    join public.profiles pr on pr.id = c.profile_id;
$$;
grant execute on function public.test_changes(int, uuid[]) to authenticated;

select ok(not has_function_privilege('anon', 'public.meeting_play_records(uuid)', 'execute'),
  'anon nie wywoła meeting_play_records');
select ok(not has_function_privilege('anon', 'public.meeting_leaderboard_changes(uuid,uuid[])', 'execute'),
  'anon nie wywoła meeting_leaderboard_changes');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000012", "role": "authenticated"}';

select is(public.test_records(1), array['1 Łukasz 30 K-'],
  'pierwsza partia gry: najlepszy wynik to rekord klubu, ale nie osobisty (nie ma z czym porównać)');
select is(public.test_records(2), array['2 Lucyna 35 -O', '2 Mateusz 40 K-', '3 Łukasz 40 K-'],
  'm2: Mateusz bije rekord klubu, Lucyna poprawia osobisty, wyrównanie (Łukasz 30) to nie rekord; pierwsza partia Golfa to rekord klubu');
select is(public.test_records(3), array['4 Mateusz 39 KO'],
  'm3: „mniej = lepiej”: 39 bije rekord klubu i osobisty; szkic się nie liczy');

select is(
  (select array_agg(pr.first_name || ' ' || p.club_record || ' ' || p.personal_record order by pr.first_name)
     from public.play_record_preview('00000000-0000-4000-f000-000000000005',
            '[{"profile_id": "00000000-0000-4000-a000-000000000011", "value": 41},
              {"profile_id": "00000000-0000-4000-a000-000000000012", "value": 36}]'::jsonb) p
     join public.profiles pr on pr.id = p.profile_id),
  array['Lucyna false true', 'Łukasz true true'],
  'podgląd przed zapisem: najlepsza wartość ponad rekord klubu i poprawa rekordów osobistych');
select is(
  (select count(*)::int from public.play_record_preview('00000000-0000-4000-f000-000000000005',
            '[{"profile_id": "00000000-0000-4000-a000-000000000011", "value": 30},
              {"profile_id": "00000000-0000-4000-a000-000000000012", "value": null}]'::jsonb)),
  0, 'podgląd: wyrównanie rekordu osobistego i brak wartości to nie rekord');

select is(public.test_changes(1),
  array['Łukasz +10 -→10 -→1 Żółwie 10', 'Lucyna +6 -→6 -→2 Żółwie 6'],
  'm1: pierwsze spotkanie, bez miejsc przed');
select is(public.test_changes(2),
  array['Łukasz +14 10→24 1→1 Żółwie 4, Golf 10', 'Mateusz +16 -→16 -→2 Żółwie 10, Golf 6',
        'Lucyna +6 6→12 2→3 Żółwie 6'],
  'm2: punkty spotkania z rozbiciem na gry, sumy i miejsca przed i po');
select is(public.test_changes(2, array['00000000-0000-4000-b000-000000000001']::uuid[]),
  array['Łukasz +4 10→14 1→1 Żółwie 4', 'Lucyna +6 6→12 2→2 Żółwie 6', 'Mateusz +10 -→10 -→3 Żółwie 10'],
  'm2 tylko Żółwie: klasyfikacja i punkty tylko z tej gry');
select is(public.test_changes(3),
  array['Łukasz +6 24→30 1→1 Golf 6', 'Mateusz +10 16→26 2→2 Golf 10'],
  'm3: tylko gracze z partią spotkania; szkic się nie liczy');

select * from finish();
rollback;
