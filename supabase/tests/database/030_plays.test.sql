-- [003] Notesy, partie i wyniki: niezmienne wersje, snapshot w bazie, liczba graczy,
-- profil po usunięciu konta Auth. Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

set constraints all immediate;

select plan(49);

-- ---------------------------------------------------------------------------------------------
-- Dane testowe
-- ---------------------------------------------------------------------------------------------
-- Konta Auth tworzą profile (wyzwalacz z [005]): admin jako pierwszy, potem gracz.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001@users.bgclub.invalid',
   '{"bg_club": {"first_name": "Ada", "last_name": "Adminowska", "role": "admin"}}'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002@users.bgclub.invalid',
   '{"bg_club": {"first_name": "Bartek", "last_name": "Testowy", "role": "player"}}');

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'dawid-fikcyjny-d004', 'Dawid', 'Fikcyjny', 'player'),
  ('00000000-0000-4000-a000-000000000005', 'ewa-zmyslona-e005', 'Ewa', 'Zmyślona', 'player');

insert into public.games (id, title, min_players, max_players, placement_points) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 4, '{10,6,4,2}'),
  ('00000000-0000-4000-b000-000000000002', 'Łąka i Pszczoły', 3, 5, '{8,5,3,1,0}');

insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes podstawowy'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000002', 'Notes łąki');

insert into public.scorepad_versions (id, scorepad_id, version, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', 99, '{"version": 2}', 3),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000002', 1, '{"version": 2}', 5);

update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001'
 where id = '00000000-0000-4000-d000-000000000001';
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000003'
 where id = '00000000-0000-4000-d000-000000000002';

insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'Spotkanie w trakcie', '2026-11-20 18:00+01', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Spotkanie zaplanowane', '2026-11-27 18:00+01', '00000000-0000-4000-a000-000000000001');

insert into public.meeting_participants (meeting_id, profile_id)
select '00000000-0000-4000-c000-000000000001', id from public.profiles;

update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
 where id = '00000000-0000-4000-c000-000000000001';

-- ---------------------------------------------------------------------------------------------
-- scorepad_versions: niezmienne, numerowane w bazie (GAME-9)
-- ---------------------------------------------------------------------------------------------
select is(
  (select version from public.scorepad_versions where id = '00000000-0000-4000-e000-000000000001'),
  1,
  'numer wersji nadaje baza (pierwsza wersja = 1)'
);
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000001', '{"version": 2, "edited": true}', 12);
select is(
  (select version from public.scorepad_versions where id = '00000000-0000-4000-e000-000000000002'),
  2,
  'kolejna wersja notesu ma numer 2'
);
select ok(
  (select player_slots from public.scorepad_versions where id = '00000000-0000-4000-e000-000000000002') = 12,
  'notes może mieć więcej niż 8 miejsc dla graczy (EDT-8)'
);
select throws_like(
  $$ update public.scorepad_versions set template = '{"hacked": true}'
      where id = '00000000-0000-4000-e000-000000000001' $$,
  '%immutable%',
  'wersji notesu nie da się zmienić'
);
select throws_like(
  $$ update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000003'
      where id = '00000000-0000-4000-d000-000000000001' $$,
  '%scorepads_current_version_fkey%',
  'aktualna wersja musi należeć do tego samego notesu'
);
select throws_like(
  $$ update public.scorepads set game_id = '00000000-0000-4000-b000-000000000002'
      where id = '00000000-0000-4000-d000-000000000001' $$,
  '%game_id is immutable%',
  'notesu nie da się przenieść do innej gry'
);
select throws_like(
  $$ insert into public.scorepad_versions (scorepad_id, template, player_slots)
     values ('00000000-0000-4000-d000-000000000001', '[]', 2) $$,
  '%scorepad_versions_template_object%',
  'szablon jest obiektem JSON'
);

-- ---------------------------------------------------------------------------------------------
-- plays: szkic i snapshot w bazie (GAME-9, Q23, PAD-9)
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-e000-000000000001', '{1}', '00000000-0000-4000-a000-000000000001') $$,
  '%in-progress meeting%',
  'partii nie da się rozpocząć w zaplanowanym spotkaniu'
);
select throws_like(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-e000-000000000002', '{1}', '00000000-0000-4000-a000-000000000001') $$,
  '%not the current version%',
  'partia startuje tylko z bieżącą wersją notesu'
);
select throws_like(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-e000-000000000003', '{1}', '00000000-0000-4000-a000-000000000001') $$,
  '%does not belong to game%',
  'notes musi należeć do gry partii'
);
select throws_like(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by, status, saved_at)
     values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-e000-000000000002', '{1}', '00000000-0000-4000-a000-000000000001', 'saved', now()) $$,
  '%created as a draft%',
  'partia powstaje jako szkic'
);

-- Wersja 2 jest teraz bieżąca, ale przy 12 miejscach liczbę graczy i tak ogranicza punktacja gry (4).
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000002'
 where id = '00000000-0000-4000-d000-000000000001';

-- Klient przysyła fałszywą punktację: baza ją zastępuje snapshotem z gry.
insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
values ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
        '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000002',
        '{999,999,999,999}', '00000000-0000-4000-a000-000000000001');

select is(
  (select points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  '{10,6,4,2}'::int[],
  'snapshot punktacji pochodzi z bazy, nie od klienta (GAME-9)'
);

-- Zmiana punktacji i notesu w trakcie partii dotyczy dopiero kolejnych partii.
update public.games set placement_points = '{12,7,3,1}' where id = '00000000-0000-4000-b000-000000000001';
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-d000-000000000001', '{"version": 2, "v": 3}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000004'
 where id = '00000000-0000-4000-d000-000000000001';

select is(
  (select points_snapshot from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  '{10,6,4,2}'::int[],
  'zmiana punktacji gry nie zmienia rozpoczętej partii (Q1, Q23)'
);
select is(
  (select scorepad_version_id from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  '00000000-0000-4000-e000-000000000002'::uuid,
  'zmiana notesu nie zmienia wersji rozpoczętej partii'
);
select throws_like(
  $$ update public.plays set points_snapshot = '{1,1,1,1}' where id = '00000000-0000-4000-f000-000000000001' $$,
  '%immutable%',
  'snapshotu partii nie da się zmienić'
);
select throws_like(
  $$ update public.plays set scorepad_version_id = '00000000-0000-4000-e000-000000000004'
      where id = '00000000-0000-4000-f000-000000000001' $$,
  '%immutable%',
  'wersji notesu partii nie da się zmienić'
);
select throws_like(
  $$ delete from public.scorepad_versions where id = '00000000-0000-4000-e000-000000000002' $$,
  '%immutable%',
  'wersji notesu nie da się usunąć (numer wersji nie wróci)'
);

-- ---------------------------------------------------------------------------------------------
-- play_results: gracze partii (PAD-3, PLAN-4)
-- ---------------------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002', 1) $$,
  'skład szkicu można budować w osobnych żądaniach (chwilowo 1 gracz)'
);
select throws_like(
  $$ update public.plays set status = 'saved', sheet = '{}' where id = '00000000-0000-4000-f000-000000000001' $$,
  '%at least 2 required%',
  'zapisana partia ma co najmniej 2 graczy (Q2)'
);
select lives_ok(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 2) $$,
  'szkic z dwoma graczami'
);
select throws_like(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002', 3) $$,
  '%play_results_pkey%',
  'jedna partia danego gracza na karteczce'
);
select throws_like(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004', 2) $$,
  '%play_results_seat_key%',
  'jeden gracz na miejsce w notesie'
);
select throws_like(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004', 13) $$,
  '%exceeds 12 player slots%',
  'miejsce gracza mieści się w notesie'
);
select throws_like(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004', 3),
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000005', 4),
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 5) $$,
  '%at most 4 allowed%',
  'graczy nie więcej niż max. liczba graczy gry ze snapshotu'
);
select throws_like(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000004', 3) $$,
  '%play_results_play_id_meeting_id_fkey%',
  'wynik należy do spotkania swojej partii'
);
select throws_like(
  $$ update public.play_results set place = 2, tied = false, points = 6, is_win = true
      where play_id = '00000000-0000-4000-f000-000000000001' and seat = 1 $$,
  '%play_results_win_is_first_place%',
  'wygrana tylko na miejscu 1'
);
select throws_like(
  $$ update public.play_results set place = 1
      where play_id = '00000000-0000-4000-f000-000000000001' and seat = 1 $$,
  '%play_results_outcome_complete%',
  'miejsce, remis, punkty i wygrana są uzupełniane razem'
);

-- Odroczone sprawdzenie: w transakcji graczy można dodawać pojedynczo.
select lives_ok(
  $$ do $d$
     begin
       set constraints all deferred;
       insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
       values ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001',
               '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-e000-000000000003',
               '{0}', '00000000-0000-4000-a000-000000000001');
       insert into public.play_results (play_id, meeting_id, profile_id, seat) values
         ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002', 1);
       insert into public.play_results (play_id, meeting_id, profile_id, seat) values
         ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 2);
       insert into public.play_results (play_id, meeting_id, profile_id, seat) values
         ('00000000-0000-4000-f000-000000000002', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004', 3);
       set constraints all immediate;
     end
     $d$ $$,
  'graczy szkicu można dodawać pojedynczo w jednej transakcji'
);
update public.games set min_players = 4 where id = '00000000-0000-4000-b000-000000000002';
select lives_ok(
  $$ update public.play_results set scores = '{"kwiaty": 3}'
      where play_id = '00000000-0000-4000-f000-000000000002' and seat = 1 $$,
  'zmiana min. graczy gry nie blokuje rozpoczętej partii (GAME-9)'
);

-- ---------------------------------------------------------------------------------------------
-- Zapis karteczki
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ update public.plays set status = 'saved', sheet = '{}'
      where id = '00000000-0000-4000-f000-000000000001' $$,
  '%without place%',
  'zapisana partia wymaga miejsc wszystkich graczy'
);
update public.play_results set place = 1, tied = false, points = 10, is_win = true, ranking_value = 42
 where play_id = '00000000-0000-4000-f000-000000000001' and seat = 1;
update public.play_results set place = 2, tied = false, points = 6, is_win = false, ranking_value = 30
 where play_id = '00000000-0000-4000-f000-000000000001' and seat = 2;
select lives_ok(
  $$ update public.plays set status = 'saved', saved_at = '2020-01-01', sheet = '{"cells": []}'
      where id = '00000000-0000-4000-f000-000000000001' $$,
  'partię z kompletnymi wynikami można zapisać'
);
select is(
  (select saved_at from public.plays where id = '00000000-0000-4000-f000-000000000001'),
  now(),
  'czas zapisu nadaje baza, nie klient (kolejność partii, §5.6.6)'
);
select throws_like(
  $$ update public.play_results set points = 100
      where play_id = '00000000-0000-4000-f000-000000000001' and seat = 1 $$,
  '%saved play are immutable%',
  'wyników zapisanej partii nie da się zmienić (PRD §1.2)'
);
select throws_like(
  $$ update public.plays set sheet = '{"cells": [1]}' where id = '00000000-0000-4000-f000-000000000001' $$,
  '%saved play is immutable%',
  'karteczki zapisanej partii nie da się zmienić'
);
select throws_like(
  $$ update public.plays set status = 'draft', saved_at = null where id = '00000000-0000-4000-f000-000000000001' $$,
  '%saved play is immutable%',
  'zapisanej partii nie da się cofnąć do szkicu'
);
select lives_ok(
  $$ update public.plays set sheet_image_path = 'sheets/test.webp' where id = '00000000-0000-4000-f000-000000000001' $$,
  'do zapisanej partii można dopisać obraz karteczki (PAD-6)'
);

-- ---------------------------------------------------------------------------------------------
-- Spotkanie z partiami
-- ---------------------------------------------------------------------------------------------
select throws_like(
  $$ delete from public.meeting_participants
      where meeting_id = '00000000-0000-4000-c000-000000000001' and profile_id = '00000000-0000-4000-a000-000000000002' $$,
  '%play_results_meeting_id_profile_id_fkey%',
  'uczestnika z partią nie da się usunąć ze spotkania (PLAN-4)'
);
select throws_like(
  $$ update public.meetings set status = 'finished', finished_at = now()
      where id = '00000000-0000-4000-c000-000000000001' $$,
  '%draft plays%',
  'spotkania z partią w toku nie da się zakończyć (RUN-4)'
);
delete from public.plays where id = '00000000-0000-4000-f000-000000000002';
select is(
  (select count(*)::int from public.play_results where play_id = '00000000-0000-4000-f000-000000000002'),
  0,
  'porzucenie szkicu usuwa jego graczy (PAD-8)'
);
select lives_ok(
  $$ update public.meetings set status = 'finished', finished_at = now()
      where id = '00000000-0000-4000-c000-000000000001' $$,
  'spotkanie bez szkiców można zakończyć'
);
select throws_like(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-e000-000000000004', '{1}', '00000000-0000-4000-a000-000000000001') $$,
  '%in-progress meeting%',
  'po zakończeniu spotkania nie można dodawać partii (RUN-4)'
);
select throws_like(
  $$ delete from public.meetings where id = '00000000-0000-4000-c000-000000000001' $$,
  '%plays_meeting_id_fkey%',
  'spotkania z partiami nie da się usunąć (PLAN-5, Q4)'
);

-- ---------------------------------------------------------------------------------------------
-- Osiągnięcia
-- ---------------------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.achievement_unlocks (profile_id, achievement_id, unlocked_at, meeting_id, play_id)
     values ('00000000-0000-4000-a000-000000000002', 'win-1', '2026-11-20 18:00+01',
             '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-f000-000000000001') $$,
  'odblokowanie osiągnięcia'
);
select throws_like(
  $$ insert into public.achievement_unlocks (profile_id, achievement_id, unlocked_at, meeting_id)
     values ('00000000-0000-4000-a000-000000000003', 'Win 1', now(), '00000000-0000-4000-c000-000000000001') $$,
  '%achievement_unlocks_id_format%',
  'identyfikator osiągnięcia ma format z katalogu'
);

-- ---------------------------------------------------------------------------------------------
-- Profil przeżywa usunięcie konta Auth (MEM-4)
-- ---------------------------------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-4000-a000-000000000002';
select isnt(
  (select deleted_at from public.profiles where id = '00000000-0000-4000-a000-000000000002'),
  null,
  'usunięcie konta Auth oznacza profil jako usunięty'
);
select is(
  (select count(*)::int from public.play_results where profile_id = '00000000-0000-4000-a000-000000000002'),
  1,
  'wyniki usuniętego gracza zostają w historii'
);
select throws_like(
  $$ delete from auth.users where id = '00000000-0000-4000-a000-000000000001' $$,
  '%profiles_admin_not_deleted%',
  'konta Auth admina nie da się usunąć'
);
select throws_like(
  $$ delete from public.profiles where id = '00000000-0000-4000-a000-000000000002' $$,
  '%violates foreign key constraint%',
  'profilu z historią nie da się usunąć fizycznie'
);

-- Usunięcie zapisanej partii (admin, §5.6.5) usuwa wyniki i odblokowania z tej partii.
delete from public.plays where id = '00000000-0000-4000-f000-000000000001';
select is(
  (select count(*)::int from public.achievement_unlocks where play_id = '00000000-0000-4000-f000-000000000001'),
  0,
  'usunięcie partii usuwa wskazujące ją odblokowania'
);

select * from finish();

rollback;
