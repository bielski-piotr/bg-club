-- ACH-4: nowe INSERT-y, odzyskanie odpowiedzi, osobne urządzenia i uprawnienia.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-admin-a001', 'Ada', 'Admin', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bea-test-b002', 'Bea', 'Test', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-test-c003', 'Celina', 'Test', 'player');
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Gra', 2, 4, '{10,6,4,2}');
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v": 2, "lines": [{"id": "n", "kind": "names"}, {"id": "a", "kind": "input"}, {"id": "s", "kind": "total"}]}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';
insert into public.meetings (id, title, starts_at, created_by, host_id) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie', '2026-11-01 18:00+01',
   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002');
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p;

create function pg_temp.play(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-f000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.start(n int) returns void language sql as $$
  select public.start_play(pg_temp.play(n), '00000000-0000-4000-c000-000000000001',
    '00000000-0000-4000-d000-000000000001',
    array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[]);
$$;
create function pg_temp.save(n int, req int, sheet jsonb default '{"cells":{"a":[5,3]}}') returns jsonb language sql as $$
  select public.save_play_with_achievements(pg_temp.play(n), '00000000-0000-4000-e000-000000000001', sheet,
    '[{"profile_id":"00000000-0000-4000-a000-000000000002","seat":1,"place":1,"scores":{"a":5},"ranking_value":5},
      {"profile_id":"00000000-0000-4000-a000-000000000003","seat":2,"place":2,"scores":{"a":3},"ranking_value":3}]',
    ('00000000-0000-4000-9000-' || lpad(req::text, 12, '0'))::uuid);
$$;

select ok(not has_function_privilege('anon', 'public.save_play_with_achievements(uuid,uuid,jsonb,jsonb,uuid)', 'execute'), 'anon nie zapisze partii');
select ok(not has_table_privilege('authenticated', 'private.play_save_notifications', 'select,insert,update,delete'), 'klient nie czyta ani nie zmienia potwierdzeń');
select ok(not has_function_privilege('authenticated', 'private.capture_achievement_notification()', 'execute'), 'klient nie uruchomi wyzwalacza');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select public.start_meeting('00000000-0000-4000-c000-000000000001');
select pg_temp.start(1);
create temporary table response as select pg_temp.save(1, 1) as data;
select is((select data->>'id' from response), pg_temp.play(1)::text, 'RPC zwraca zapisaną partię');
select is((select status from public.plays where id = pg_temp.play(1)), 'saved', 'partia zapisana');
select results_eq(
  $$ select u->>'profile_id', u->>'achievement_id' from response, jsonb_array_elements(data->'unlocks') u order by 1,2 $$,
  $$ values ('00000000-0000-4000-a000-000000000002','beginners-luck'),
            ('00000000-0000-4000-a000-000000000002','meet-1'),
            ('00000000-0000-4000-a000-000000000002','win-1'),
            ('00000000-0000-4000-a000-000000000003','meet-1') $$,
  'wszystkie nowe odznaki obu graczy, także gdy zapisujący nie grał');
select is(pg_temp.save(1, 1), (select data from response), 'utrata odpowiedzi: identyczne żądanie odzyskuje wynik');
select is(pg_temp.save(1, 2)->'unlocks', '[]'::jsonb, 'inne urządzenie: pusta lista');
select throws_ok($$ select pg_temp.save(1, 1, '{"changed":true}') $$, '23514', null::text, 'inna kartka z tym samym request_id nadal odrzucona');

-- Nawet znając identyfikator żądania, inny prowadzący nie dostaje jego powiadomień.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
select is(pg_temp.save(1, 1)->'unlocks', '[]'::jsonb, 'inny autor: pusta lista');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}';
select throws_ok($$ select pg_temp.save(1, 1) $$, '42501', null::text, 'uczestnik bez prowadzenia nie zapisze ani nie odczyta potwierdzenia');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select pg_temp.start(2);
select throws_ok($$ select pg_temp.save(2, 2, '[]') $$, '23514', null::text, 'błędna kartka wycofuje transakcję');
reset role;
select is((select count(*) from private.play_save_notifications where play_id = pg_temp.play(2)), 0::bigint, 'błąd nie zostawia potwierdzenia');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select is(pg_temp.save(2, 2)->'unlocks', '[]'::jsonb, 'kolejna partia: istniejące odznaki nie są nowe');
select pg_temp.start(3);
select is(jsonb_array_length(pg_temp.save(3, 3)->'unlocks'), 1, 'trzecia wygrana: tylko nowy Hat-trick');
select is(pg_temp.save(3, 3)->'unlocks'->0->>'achievement_id', 'hattrick', 'identyfikator nowej odznaki');
select public.finish_meeting('00000000-0000-4000-c000-000000000001');
select is(pg_temp.save(1, 1), (select data from response), 'ponowienie po zakończeniu spotkania odzyskuje wynik, nie dopisuje Bez skazy');
reset role;
select is(current_setting('bg_club.notification_play', true), '', 'RPC przywraca kontekst, inne operacje nie dopisują toastów');
select is((select jsonb_array_length(unlocks) from private.play_save_notifications where play_id = pg_temp.play(1)), 4, 'zakończenie spotkania nie zmienia wcześniejszego potwierdzenia');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select public.delete_play(pg_temp.play(1));
reset role;
select is((select count(*) from private.play_save_notifications where play_id = pg_temp.play(1)), 0::bigint, 'usunięcie partii usuwa potwierdzenie');
select * from finish();
rollback;
