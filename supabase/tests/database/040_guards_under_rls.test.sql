-- [003] Strażnicy spójności działają także dla klienta pod RLS.
-- Polityki mogą ukrywać wiersze (np. usunięte gry) i klient nie ma praw do funkcji
-- pomocniczych. Test zakłada tymczasowe polityki i prawa (wycofywane razem z transakcją),
-- przełącza się na rolę authenticated i sprawdza, że reguły nie przestają działać.
-- Prawdziwe polityki z [004] (migracja access_control) nie dają tu dostępu, bo test nie ustawia
-- tokenu (auth.uid() = NULL). Klient nie pisze do plays i play_results (robi to RPC), więc
-- prawa INSERT są tu nadane tylko na czas testu. Dane testowe są fikcyjne.
begin;

create extension if not exists pgtap with schema extensions;

set constraints all immediate;

select plan(6);

insert into public.profiles (id, hook, first_name, last_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'ada-adminowska-a001', 'Ada', 'Adminowska', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'bartek-testowy-b002', 'Bartek', 'Testowy', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'celina-przykladowa-c003', 'Celina', 'Przykładowa', 'player');
insert into public.games (id, title, min_players, max_players, placement_points, deleted_at) values
  ('00000000-0000-4000-b000-000000000001', 'Żółwie Wyścigi', 2, 2, '{3,0}', null),
  ('00000000-0000-4000-b000-000000000002', 'Usunięta Gra', 2, 2, '{3,0}', now());
insert into public.scorepads (id, game_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Notes');
insert into public.scorepad_versions (id, scorepad_id, template, player_slots) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001', '{}', 4);
update public.scorepads set current_version_id = '00000000-0000-4000-e000-000000000001';
insert into public.meetings (id, title, starts_at, created_by) values
  ('00000000-0000-4000-c000-000000000001', 'W trakcie', now(), '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002', 'Zaplanowane', now(), '00000000-0000-4000-a000-000000000001');
insert into public.meeting_participants (meeting_id, profile_id)
select m.id, p.id from public.meetings m cross join public.profiles p;
update public.meetings set status = 'in_progress', voting_open = false, started_at = now()
 where id = '00000000-0000-4000-c000-000000000001';

-- Tymczasowe polityki: wszystko widoczne i zapisywalne, poza usuniętymi grami (niewidoczne)
-- i spotkaniami (tylko odczyt, bez polityki UPDATE).
create policy tmp_games on public.games for select to authenticated using (deleted_at is null);
create policy tmp_meetings on public.meetings for select to authenticated using (true);
create policy tmp_scorepads on public.scorepads for select to authenticated using (true);
create policy tmp_versions on public.scorepad_versions for select to authenticated using (true);
create policy tmp_participants on public.meeting_participants for select to authenticated using (true);
create policy tmp_votes on public.game_votes for all to authenticated using (true) with check (true);
create policy tmp_plays on public.plays for all to authenticated using (true) with check (true);
create policy tmp_results on public.play_results for all to authenticated using (true) with check (true);
grant insert on public.plays, public.play_results to authenticated;

set local role authenticated;

select throws_like(
  $$ insert into public.game_votes (meeting_id, game_id, profile_id) values
     ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002') $$,
  '%is deleted%',
  'głos na grę ukrytą przez RLS (usuniętą) jest odrzucany'
);
select throws_like(
  $$ insert into public.plays (meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001',
             '00000000-0000-4000-e000-000000000001', '{1}', '00000000-0000-4000-a000-000000000001') $$,
  '%in-progress meeting%',
  'bez polityki UPDATE na spotkaniach strażnik i tak widzi status spotkania'
);
select lives_ok(
  $$ insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
     values ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001',
             '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-e000-000000000001', '{1}',
             '00000000-0000-4000-a000-000000000001') $$,
  'klient tworzy szkic partii'
);
select lives_ok(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002', 1),
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 2) $$,
  'klient dodaje graczy; sprawdzenie liczby graczy działa bez praw do funkcji pomocniczych'
);
select throws_like(
  $$ insert into public.play_results (play_id, meeting_id, profile_id, seat) values
     ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 3) $$,
  '%at most 2 allowed%',
  'limit graczy z punktacji gry działa dla klienta'
);
select throws_like(
  $$ select public.check_play_players('00000000-0000-4000-f000-000000000001') $$,
  '%permission denied%',
  'klient nie wywoła funkcji pomocniczej bezpośrednio'
);

reset role;

select * from finish();

rollback;
