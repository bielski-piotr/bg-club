-- [045] Skomplikowanie gry, punkty ułamkowe, przesunięcie miejsc i zespoły (PRD GAME-5, §5.6.2,
-- EDT-13, PAD-2, PAD-3). Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-bartkowski-a002', 'Bartek', 'Bartkowski', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-celinska-a003', 'Celina', 'Celińska', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'darek-darecki-a004', 'Darek', 'Darecki', 'player'),
  ('00000000-0000-4000-a000-000000000005', 'ewa-ewska-a005', 'Ewa', 'Ewska', 'player');

insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Zespoły', '2026-11-20 18:00+01', '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select '00000000-0000-4000-c000-000000000001', p.id from public.profiles p;
update public.meetings set status = 'in_progress', voting_open = false, started_at = now();

-- Gra 2–6 z punktacją ze wzoru (skomplikowanie 2,5) i dwa notesy: z zespołami i bez.
insert into public.games (id, title, min_players, max_players, placement_points, complexity) values
  ('00000000-0000-4000-b000-000000000001', 'Gra zespołowa', 2, 6, '{39.2,32.1,25.1,18,11,3.9}', 2.5);
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Zespoły'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001', 'Pojedynczo');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   '{"v":2,"lines":[{"id":"names","kind":"names","team":true},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 2),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000002',
   '{"v":2,"lines":[{"id":"names","kind":"names"},{"id":"total","kind":"input"}],"ranking":{"line":"total","dir":"desc","tiebreak":[]}}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001' where id = '00000000-0000-4000-d000-000000000001';
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000002' where id = '00000000-0000-4000-d000-000000000002';

select is(
  (select array_agg(v.teams order by v.id) from public.scorepad_versions v),
  array[true, false],
  'scorepad_versions.teams: kategoria nazwy gracza z team = true'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}';

-- Skomplikowanie jest wymagane przy dodaniu gry w aplikacji.
select throws_like(
  $$ insert into public.games (title, min_players, max_players, placement_points) values ('Bez skomplikowania', 2, 2, '{1,0}') $$,
  '%complexity is required%',
  'gra dodana w aplikacji wymaga skomplikowania'
);

-- Zespoły tylko w notesie z zespołami.
select throws_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000002',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003',
             '00000000-0000-4000-a000-000000000004']::uuid[], array[1, 1, 2]) $$,
  '23514', null, 'notes bez zespołów: jeden gracz na miejsce'
);
select throws_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[], array[1, 1]) $$,
  '23514', null, 'partia ma co najmniej 2 strony'
);
select throws_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000009', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003']::uuid[], array[1, 3]) $$,
  '23514', null, 'miejsce zespołu mieści się w notesie'
);

-- 2 na 2 w notesie z dwoma miejscami, choć gra ma do 6 graczy.
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003',
             '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000005']::uuid[],
       array[1, 1, 2, 2]) $$,
  'zespoły: kilku graczy na miejscu notesu'
);
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000001',
       array['00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000004',
             '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000002']::uuid[],
       array[2, 2, 1, 1]) $$,
  'ponowienie z tym samym składem w innej kolejności zwraca partię'
);
select results_eq(
  $$ select seat, count(*)::int from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000001' group by seat order by seat $$,
  $$ values (1, 2), (2, 2) $$,
  'dwa zespoły po dwóch graczy'
);

select throws_like(
  $$ select public.save_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-e000-000000000001', '{}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000002","seat":1,"place":1,"scores":{"total":9},"ranking_value":9},
         {"profile_id":"00000000-0000-4000-a000-000000000003","seat":1,"place":2,"scores":{"total":9},"ranking_value":9},
         {"profile_id":"00000000-0000-4000-a000-000000000004","seat":2,"place":2,"scores":{"total":4},"ranking_value":4},
         {"profile_id":"00000000-0000-4000-a000-000000000005","seat":2,"place":2,"scores":{"total":4},"ranking_value":4}]'::jsonb) $$,
  '%team members must share place%',
  'członkowie zespołu mają to samo miejsce i wpisy'
);
select lives_ok(
  $$ select public.save_play('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-e000-000000000001', '{}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000002","seat":1,"place":1,"scores":{"total":9},"ranking_value":9},
         {"profile_id":"00000000-0000-4000-a000-000000000003","seat":1,"place":1,"scores":{"total":9},"ranking_value":9},
         {"profile_id":"00000000-0000-4000-a000-000000000004","seat":2,"place":2,"scores":{"total":4},"ranking_value":4},
         {"profile_id":"00000000-0000-4000-a000-000000000005","seat":2,"place":2,"scores":{"total":4},"ranking_value":4}]'::jsonb) $$,
  'zapis partii zespołów'
);
-- Dwie strony w grze do 6 graczy: miejsca 5 i 6 punktacji, pełne punkty dla każdego członka.
select results_eq(
  $$ select profile_id, place, tied, points, is_win from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000001' order by profile_id $$,
  $$ values ('00000000-0000-4000-a000-000000000002'::uuid, 1, false, 11::numeric, true),
            ('00000000-0000-4000-a000-000000000003'::uuid, 1, false, 11::numeric, true),
            ('00000000-0000-4000-a000-000000000004'::uuid, 2, false, 3.9::numeric, false),
            ('00000000-0000-4000-a000-000000000005'::uuid, 2, false, 3.9::numeric, false) $$,
  'zespół: każdy członek dostaje punkty i wygraną strony, bez remisu w zespole'
);

-- Partia 4 graczy pojedynczo: zwycięzca za 3. miejsce punktacji, ostatni za 6.
select lives_ok(
  $$ select public.start_play('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001',
       '00000000-0000-4000-d000-000000000002',
       array['00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003',
             '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000005']::uuid[]);
     select public.save_play('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-e000-000000000002', '{}'::jsonb,
       '[{"profile_id":"00000000-0000-4000-a000-000000000002","seat":1,"place":1,"scores":{"total":9},"ranking_value":9},
         {"profile_id":"00000000-0000-4000-a000-000000000003","seat":2,"place":2,"scores":{"total":5},"ranking_value":5},
         {"profile_id":"00000000-0000-4000-a000-000000000004","seat":3,"place":2,"scores":{"total":5},"ranking_value":5},
         {"profile_id":"00000000-0000-4000-a000-000000000005","seat":4,"place":4,"scores":{"total":1},"ranking_value":1}]'::jsonb) $$,
  'zapis partii 4 graczy w grze do 6'
);
select results_eq(
  $$ select seat, points from public.play_results
      where play_id = '00000000-0000-4000-f000-000000000002' order by seat $$,
  $$ values (1, 25.1::numeric), (2, 14.5::numeric), (3, 14.5::numeric), (4, 3.9::numeric) $$,
  'punkty z przesunięciem miejsc i remis (18 + 11) / 2 → 14,5'
);

-- Rankingi sumują punkty ułamkowe.
select results_eq(
  $$ select profile_id, value from public.leaderboard('points') order by profile_id $$,
  $$ values ('00000000-0000-4000-a000-000000000002'::uuid, 36.1::numeric),
            ('00000000-0000-4000-a000-000000000003'::uuid, 25.5::numeric),
            ('00000000-0000-4000-a000-000000000004'::uuid, 18.4::numeric),
            ('00000000-0000-4000-a000-000000000005'::uuid, 7.8::numeric) $$,
  'leaderboard punktów bez obcinania ułamków'
);
select is(
  (public.player_stats('00000000-0000-4000-a000-000000000003') ->> 'points')::numeric,
  25.5,
  'statystyki gracza: suma punktów ułamkowych'
);
select is(
  (select m.points from public.meeting_summary('00000000-0000-4000-c000-000000000001') m
    where m.profile_id = '00000000-0000-4000-a000-000000000002'),
  36.1::numeric,
  'podsumowanie spotkania: suma punktów ułamkowych'
);

select * from finish();
rollback;
