-- RUN-5/Q10: rzeczywiste RPC, historia i serie po dograniu starszego spotkania.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-testowa-a001', 'Ada', 'Testowa', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-a002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-testowa-a003', 'Celina', 'Testowa', 'player');
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Gra testowa', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"total","kind":"total"}]}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';
insert into public.meetings (id, title, starts_at, host_id, created_by)
select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid,
       'Spotkanie ' || n, '2026-01-01 18:00Z'::timestamptz + n * interval '1 week', null,
       '00000000-0000-4000-a000-000000000001'
from generate_series(1, 4) n;
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p;
update public.meetings set host_id = '00000000-0000-4000-a000-000000000002';
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002');

create function pg_temp.mid(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.pid(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.add_play(n int, m int, player_wins boolean) returns void language plpgsql as $$
declare
  a uuid := '00000000-0000-4000-a000-000000000001';
  b uuid := '00000000-0000-4000-a000-000000000002';
begin
  perform public.start_play(pg_temp.pid(n), pg_temp.mid(m), '00000000-0000-4000-d000-000000000001', array[a,b]);
  perform public.save_play(pg_temp.pid(n), '00000000-0000-4000-e000-000000000001',
    '{"cells":{"a":[5,3]}}', jsonb_build_array(
      jsonb_build_object('profile_id', a, 'seat', 1, 'place', case when player_wins then 2 else 1 end,
                        'scores', jsonb_build_object('a', case when player_wins then 3 else 5 end),
                        'ranking_value', case when player_wins then 3 else 5 end),
      jsonb_build_object('profile_id', b, 'seat', 2, 'place', case when player_wins then 1 else 2 end,
                        'scores', jsonb_build_object('a', case when player_wins then 5 else 3 end),
                        'ranking_value', case when player_wins then 5 else 3 end)));
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select public.start_meeting(pg_temp.mid(1));
select pg_temp.add_play(n, 1, false) from generate_series(1, 3) n;
select public.finish_meeting(pg_temp.mid(1));
select public.start_meeting(pg_temp.mid(2));
select pg_temp.add_play(4, 2, true);
select public.finish_meeting(pg_temp.mid(2));
select public.start_meeting(pg_temp.mid(3));
select pg_temp.add_play(5, 3, true);
select public.finish_meeting(pg_temp.mid(3));
select is((select streak_after from public.meeting_summary(pg_temp.mid(3))
           where profile_id = '00000000-0000-4000-a000-000000000002'), 2, 'przed dograniem: seria 2');

reset role;
-- Pełne wiersze, w tym sheet, snapshot, saved_at i wyniki.
insert into storage.objects(bucket_id, name) values ('sheets',
  '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-history01.png');
update public.plays set sheet_image_path =
  '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-history01.png'
where id = pg_temp.pid(1);
create temp table history as select p.* from public.plays p;
create temp table results_before as select r.* from public.play_results r;
create temp table meeting_before as select * from public.meetings where id = pg_temp.mid(1);
grant select on history, results_before, meeting_before to authenticated;
select ok(not has_function_privilege('anon', 'public.reopen_meeting(uuid)', 'execute'), 'anon nie ma EXECUTE');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
select throws_ok('select public.reopen_meeting(pg_temp.mid(1))', '42501', null, 'prowadzący nie otwiera');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}';
select throws_ok('select public.reopen_meeting(pg_temp.mid(1))', '42501', null, 'gracz nie otwiera');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select throws_ok('update public.meetings set status = ''in_progress'', finished_at = null where id = pg_temp.mid(1)',
  '42501', null, 'bezpośredni UPDATE jest zabroniony także adminowi');
select throws_ok('select public.reopen_meeting(pg_temp.mid(4))', '23514', 'meeting is not finished', 'zaplanowanego nie otwiera');
select throws_ok('select public.reopen_meeting(pg_temp.mid(99))', 'P0002', 'meeting does not exist', 'nieistniejące spotkanie');
select public.start_meeting(pg_temp.mid(4));
select throws_ok('select public.reopen_meeting(pg_temp.mid(1))', '23505', 'another meeting is in progress', 'inne spotkanie blokuje otwarcie');
select is((select status from public.meetings where id = pg_temp.mid(1)), 'finished', 'nieudane otwarcie nie zmienia statusu');
select public.finish_meeting(pg_temp.mid(4));

select is((public.reopen_meeting(pg_temp.mid(1))).status, 'in_progress', 'admin otwiera zakończone');
select ok((select finished_at is null and not voting_open from public.meetings where id = pg_temp.mid(1)),
  'finished_at wyczyszczone, głosowanie nadal zamknięte');
select results_eq(
  $$select id, title, starts_at, started_at, host_id, created_by from public.meetings where id = pg_temp.mid(1)$$,
  $$select id, title, starts_at, started_at, host_id, created_by from meeting_before$$,
  'to samo spotkanie, termin, pierwotne rozpoczęcie i prowadzący');
select results_eq('select * from public.plays order by id', 'select * from history order by id', 'partie i pełne snapshoty bez zmian');
select results_eq('select * from public.play_results order by play_id, seat', 'select * from results_before order by play_id, seat', 'historyczne wyniki bez zmian');
select throws_ok('select public.reopen_meeting(pg_temp.mid(1))', '23514', 'meeting is not finished', 'drugie otwarcie odrzucone');
select public.finish_meeting(pg_temp.mid(1));

select public.reopen_meeting(pg_temp.mid(1));
-- Prowadzący może dograć partię w tym samym spotkaniu i je zakończyć.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
select lives_ok('select pg_temp.add_play(6, 1, true)', 'prowadzący zapisuje nową partię po otwarciu');
select is((select count(*) from public.plays where meeting_id = pg_temp.mid(1)), 4::bigint, 'cztery partie w tym samym spotkaniu');
select public.finish_meeting(pg_temp.mid(1));
select is((select wins from public.meeting_summary(pg_temp.mid(1)) where profile_id = '00000000-0000-4000-a000-000000000002'), 1, 'podsumowanie obejmuje dograną wygraną');
select is((select points from public.meeting_summary(pg_temp.mid(1)) where profile_id = '00000000-0000-4000-a000-000000000002'), 10::numeric, 'podsumowanie punktów po dograniu: 3 * 2 + 4 (partia 2 graczy w grze do 4 liczy ostatnie 2 miejsca punktacji)');
select is((select streak_after from public.meeting_summary(pg_temp.mid(3)) where profile_id = '00000000-0000-4000-a000-000000000002'), 3, 'starsza wygrana przelicza późniejszą serię');
select is((public.player_stats('00000000-0000-4000-a000-000000000002') ->> 'streak_record')::int, 3, 'rekord serii w statystykach po dograniu');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select public.reopen_meeting(pg_temp.mid(1));
select public.finish_meeting(pg_temp.mid(1));
select public.reopen_meeting(pg_temp.mid(1));
select public.finish_meeting(pg_temp.mid(1));
select results_eq('select p.* from public.plays p join history h using(id) order by p.id',
  'select * from history order by id', 'dopisanie partii i kolejne cykle zachowują całą starą historię');
reset role;
select ok(exists(select 1 from storage.objects where bucket_id = 'sheets' and name =
  '00000000-0000-4000-c000-000000000001/00000000-0000-4000-f000-000000000001-history01.png'), 'obraz historycznej karteczki pozostaje w Storage');
select * from finish();
rollback;
