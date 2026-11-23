-- GAME-12. Fikcyjne dane, prawdziwe RLS, publikacja i kaskady. Bez prywatnych danych w RPC.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-admin-a001', 'Ada', 'Testowa', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bea-player-a002', 'Bea', 'Testowa', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-host-a003', 'Celina', 'Testowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-outside-a004', 'Dawid', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000005', 'ewa-deleted-a005', 'Ewa', 'Testowa', 'player');
update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000005';
insert into public.club (name, timezone) values ('Klub Testowy', 'Europe/Warsaw');
insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Azul', 1, 2, '{2,1}'),
  ('00000000-0000-4000-b000-000000000002', 'Łąka', 1, 2, '{2,1}'),
  ('00000000-0000-4000-b000-000000000003', 'Bez głosów', 1, 2, '{2,1}');
insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Pierwsze', now() + interval '1 day', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Drugie', now() + interval '2 days', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000003', 'Historyczne', now() + interval '3 days', '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p
where p.id in ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003');
update public.meetings set host_id = '00000000-0000-4000-a000-000000000003';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 0::bigint, 'zero głosów');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000099'), null::bigint, 'brak gry to NULL');
insert into public.game_votes (meeting_id, game_id, profile_id)
select id, '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002' from public.meetings;
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 3::bigint, 'ten sam gracz w trzech spotkaniach to trzy głosy');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000002'), 1::bigint, 'głosy liczone osobno dla każdej gry');
select throws_ok($$insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002')$$,
  '23505', null, 'duplikat odrzucony');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 3::bigint, 'ponowienie nie podwaja wyniku');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}';
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 4::bigint, 'prowadzący widzi pełny agregat');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 4::bigint, 'aktywny członek spoza spotkań też widzi agregat');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000003'), 0::bigint, 'gra bez głosów wśród innych głosowań');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select public.publish_meeting_games('00000000-0000-4000-c000-000000000001', array['00000000-0000-4000-b000-000000000002']::uuid[]);
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 4::bigint, 'publikacja innej gry zachowuje sumę, bez podwójnego liczenia migawki');
reset role;
set local role authenticated;
select public.reopen_voting('00000000-0000-4000-c000-000000000001');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
delete from public.game_votes where meeting_id = '00000000-0000-4000-c000-000000000001' and game_id = '00000000-0000-4000-b000-000000000001';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 3::bigint, 'cofnięcie po ponownym otwarciu zmniejsza sumę mimo migawki');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select public.publish_meeting_games('00000000-0000-4000-c000-000000000001', array['00000000-0000-4000-b000-000000000002']::uuid[]);
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 3::bigint, 'ponowna publikacja nie przywraca cofniętego głosu');
select public.save_meeting('00000000-0000-4000-c000-000000000001', 'Pierwsze', current_date + 1, '18:00', array['00000000-0000-4000-a000-000000000002']::uuid[], null, false);
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 2::bigint, 'usunięcie uczestnika planowanego spotkania usuwa jego głos');
delete from public.meetings where id = '00000000-0000-4000-c000-000000000001';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000002'), 0::bigint, 'usunięcie opublikowanego planu usuwa jego głosy');
reset role;
set local role authenticated;
delete from public.meetings where id = '00000000-0000-4000-c000-000000000002';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 1::bigint, 'usunięcie otwartego planu zmniejsza sumę');
select public.start_meeting('00000000-0000-4000-c000-000000000003');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 1::bigint, 'rozpoczęcie zachowuje głos i nie dolicza migawki');
select public.finish_meeting('00000000-0000-4000-c000-000000000003');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 1::bigint, 'zakończone spotkanie zachowuje historię głosu');
select public.save_meeting('00000000-0000-4000-c000-000000000004', 'Nowy plan', current_date + 4, '18:00', array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[], null, true);
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 2::bigint, 'głos historyczny i nowy głos w planie');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
select public.publish_meeting_games('00000000-0000-4000-c000-000000000004', array['00000000-0000-4000-b000-000000000002']::uuid[]);
reset role;
update public.profiles set deleted_at = now() where id = '00000000-0000-4000-a000-000000000002';
set local role authenticated;
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 1::bigint, 'usunięcie członka usuwa głos z opublikowanego planu, zachowuje historyczny');
select public.reopen_voting('00000000-0000-4000-c000-000000000004');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}';
insert into public.game_votes (meeting_id, game_id, profile_id) values
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003');
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 2::bigint, 'głos historyczny i głos prowadzącej w planie');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
update public.games set deleted_at = now() where id = '00000000-0000-4000-b000-000000000001';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), 1::bigint, 'usunięcie gry usuwa głos z planu, zachowuje historyczny');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), null::bigint, 'usunięty członek nie odczyta sumy');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000099","role":"authenticated"}';
select is(public.game_vote_total('00000000-0000-4000-b000-000000000001'), null::bigint, 'konto bez profilu nie odczyta sumy');
set local role anon;
select throws_ok($$select public.game_vote_total('00000000-0000-4000-b000-000000000001')$$, '42501', null, 'anon nie wykona agregatu');
reset role;
select ok(not (select prosecdef from pg_proc where oid = 'public.game_vote_total(uuid)'::regprocedure), 'RPC działa jako invoker, bez obejścia RLS');
select * from finish();
rollback;
