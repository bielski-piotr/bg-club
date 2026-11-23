-- [044] Manual: runner ACL, subgroup boundaries, shared places, persistence and retry.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
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

insert into public.scorepad_versions(id, scorepad_id, template, player_slots) values
('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000001',
'{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"},{"id":"b","kind":"input"},{"id":"s","kind":"total","of":["b"]}],
"ranking":{"line":"a","dir":"desc","tiebreak":[{"type":"line","line":"s","dir":"asc"},{"type":"manual"}]}}',4),
('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-d000-000000000002',
'{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"a","kind":"input"}],"ranking":{"line":"a","dir":"asc","tiebreak":[{"type":"manual"}]}}',4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000003' where id = '00000000-0000-4000-d000-000000000001';
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000004' where id = '00000000-0000-4000-d000-000000000002';
create function public.test_manual_save(n int, places int[]) returns public.plays language sql as $$
 select public.save_play(('00000000-0000-4000-f000-'||lpad(n::text,12,'0'))::uuid,
   (case when n=3 then '00000000-0000-4000-e000-000000000004' else '00000000-0000-4000-e000-000000000003' end)::uuid,
   '{"game":1,"names":["Ada","Bartek","Celina","Dawid"],"cells":{"a":[10,10,10,10],"b":[1,2,2,2]}}',
   (select jsonb_agg(jsonb_build_object('profile_id', ('00000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,
     'seat',i,'place',places[i],'scores',jsonb_build_object('a',10,'b',case when i=1 then 1 else 2 end),'ranking_value',10)) from generate_series(1,4) i));
$$;
grant execute on function public.test_manual_save(int,int[]) to authenticated;
create function public.test_manual_fourth(places int[]) returns public.plays language sql as $$
 select public.save_play('00000000-0000-4000-f000-000000000004',
   '00000000-0000-4000-e000-000000000004', '{"game":1,"cells":{"a":[10,10,10,10]}}',
   (select jsonb_agg(jsonb_build_object('profile_id', ('00000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,
     'seat',i,'place',places[i],'scores',jsonb_build_object('a',10),'ranking_value',10)) from generate_series(1,4) i));
$$;
grant execute on function public.test_manual_fourth(int[]) to authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
select lives_ok($$ select public.start_play(('00000000-0000-4000-f000-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-4000-c000-000000000001',
 (case when n>=3 then '00000000-0000-4000-d000-000000000002' else '00000000-0000-4000-d000-000000000001' end)::uuid,
 array['00000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000002','00000000-0000-4000-a000-000000000003','00000000-0000-4000-a000-000000000004']::uuid[]) from generate_series(1,4) n $$, 'host starts manual plays');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.test_manual_save(1,array[1,3,2,4]) $$, '42501', null, 'ordinary player cannot submit manual places');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.test_manual_save(1,array[2,1,3,4]) $$, '23514', 'manual decision changes an already resolved group', 'manual cannot move a category winner behind others');
select throws_ok($$ select public.test_manual_save(1,array[1,1,3,4]) $$, '23514', 'manual decision changes an already resolved group', 'manual cannot merge established groups');
select is((select status from public.plays where id='00000000-0000-4000-f000-000000000001'), 'draft', 'failed manual decisions roll back atomically');
select lives_ok($$ select public.test_manual_save(1,array[1,3,2,3]) $$, 'host resolves subgroup and leaves a smaller tie');
select results_eq($$ select seat,place,tied,points,is_win from public.play_results where play_id='00000000-0000-4000-f000-000000000001' order by seat $$,
 $$ values (1,1,false,10::numeric,true),(2,3,true,3::numeric,false),(3,2,false,6::numeric,false),(4,3,true,3::numeric,false) $$, 'saved manual places drive points, ties and wins');
select lives_ok($$ select public.test_manual_save(1,array[1,3,2,3]) $$, 'identical retry succeeds');
select is((select sheet->'cells'->'b' from public.plays where id='00000000-0000-4000-f000-000000000001'), '[1,2,2,2]'::jsonb, 'sheet values survive manual ordering');
select throws_ok($$ select public.test_manual_save(1,array[1,2,3,4]) $$, '23514', null, 'saved manual outcome is immutable');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.test_manual_save(2,array[1,2,2,2]) $$, 'admin may leave whole remaining group tied');
select lives_ok($$ select public.test_manual_save(3,array[2,1,3,4]) $$, 'first manual rule permits reordering equal primary values');
select is((select count(*)::int from public.play_results where play_id='00000000-0000-4000-f000-000000000003' and is_win),1,'manual first place has one winner');
select ok(has_function_privilege('authenticated', 'private.scorepad_ranking(jsonb)', 'execute'), 'stats retain ranking helper ACL');
select ok(not has_function_privilege('authenticated', 'private.manual_score_value(jsonb,jsonb,text,text[])', 'execute'), 'client cannot invoke private evaluator');
select throws_ok($$ select public.test_manual_fourth(array[1,3,3,4]) $$, '23514', null::text, 'save_play validates manual places');
select lives_ok($$ select public.test_manual_fourth(array[3,2,1,4]) $$, 'host saves a fully manual order');
select results_eq($$ select seat,place,is_win from public.play_results where play_id='00000000-0000-4000-f000-000000000004' order by seat $$,
 $$ values (1,3,false),(2,2,false),(3,1,true),(4,4,false) $$, 'save_play persists manual winner');
select lives_ok($$ select public.test_manual_fourth(array[3,2,1,4]) $$, 'manual retry with the same content succeeds');
reset role;
select is((select r.tiebreak from private.scorepad_ranking('{"lines":[{"id":"a","kind":"input"}],"ranking":{"line":"a","dir":"desc","tiebreak":[]}}') r), false, 'empty hierarchy retains a boolean false');
select is((select r.tiebreak from private.scorepad_ranking('{"lines":[{"id":"a","kind":"input"}],"ranking":{"line":"a","dir":"desc","tiebreak":[{"type":"manual"}]}}') r), true, 'first manual rule allows a split');
select is((select r.tiebreak from private.scorepad_ranking('{"lines":[{"id":"a","kind":"input"}],"ranking":{"line":"a","dir":"desc","tiebreak":[{"type":"shared"},{"type":"manual"}]}}') r), false, 'manual after shared is unreachable');
select is((select r.tiebreak from private.scorepad_ranking('{"lines":[{"id":"a","kind":"input"}],"ranking":{"line":"missing","dir":"desc","tiebreak":[{"type":"manual"}]}}') r), false, 'invalid ranking retains legacy fallback');
select is(private.manual_score_value('{"lines":[{"id":"a","kind":"input"},{"id":"s","kind":"sum","of":["a"]},{"id":"t","kind":"total","of":["s","a"]}]}','{"a":3}','t'),6::numeric,'nested totals agree with TypeScript');
select is(private.manual_score_value('{"lines":[{"id":"a","kind":"input"},{"id":"b","kind":"bonus","of":["a"],"threshold":5,"bonus":10}]}','{"a":4}','b'),0::numeric,'completed bonus below threshold is zero');
select is(private.manual_score_value('{"lines":[{"id":"a","kind":"input"},{"id":"b","kind":"bonus","of":["a"],"threshold":5,"bonus":10}]}','{}','b'),null::numeric,'empty bonus stays empty');
select * from finish();
rollback;
