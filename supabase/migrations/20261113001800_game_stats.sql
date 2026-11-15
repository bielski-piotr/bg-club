-- [035] Statystyki gry i podsumowanie spotkania (PRD GAME-10, GAME-11, VIEW-4, §5.6, Q25).
--
-- Zasady:
-- - Jak `leaderboard` ([032]): liczą się tylko zapisane partie (`plays.status = 'saved'`,
--   szkice nie), wyniki liczone są z `play_results` przy odczycie, więc zapis i usunięcie
--   partii (`save_play`, `delete_play`) zmieniają statystyki od razu (§5.6.5). Funkcje działają
--   z prawami wywołującego (security invoker): RLS daje wynik tylko aktywnym członkom.
-- - Kolejność zdarzeń (§5.6.6, Q24): spotkania po `starts_at`, potem `id`; partie w spotkaniu
--   po `saved_at`, potem `id`.
--
-- `game_stats(game_id)` (GAME-11) zwraca obiekt jsonb (NULL, gdy gry nie ma):
-- - `play_count`, `last_played_at` (termin spotkania ostatniej partii; NULL bez partii);
-- - `top_winners`: aktywni gracze z największą liczbą wygranych (> 0) w tej grze, wszyscy przy
--   remisie, alfabetycznie; usunięci członkowie nie są wyróżniani (jak podium, LB-7);
-- - `record`: najlepsza wartość kategorii decydującej (`ranking_value`) i wszyscy, którzy ją
--   osiągnęli (Q25), każdy z pierwszą partią, w której to zrobił (kto i kiedy). Kierunek
--   „lepiej” bierzemy z reguły notesu (`private.scorepad_ranking`): wersje notesu mogą się
--   różnić (GAME-9), więc obowiązuje kierunek wersji ostatniej zapisanej partii, a partie
--   z wersji o innym kierunku nie biorą udziału w rekordzie ani średniej (ich wartości nie są
--   porównywalne). Partia bez wartości decydującej u gracza (NULL) nie liczy się do rekordu.
--   Bez żadnej wartości `record` jest NULL;
-- - `winner_average`: średnia wartość decydująca zwycięzców (także remisujących o 1. miejsce)
--   z tych samych partii co rekord; NULL bez wartości;
-- - `ranking`: gracze z ≥ 1 zapisaną partią gry: wygrane, potem punkty (§5.6.2, §5.6.3);
--   wspólne miejsce przy równych obu (1, 1, 3), alfabetycznie w remisie, usunięci na końcu
--   z miejscami liczonymi dalej (jak LB-6, LB-7).
--
-- `meeting_summary(meeting_id)` (VIEW-4) zwraca graczy z ≥ 1 zapisaną partią spotkania: punkty
-- i wygrane z rozbiciem na gry (w kolejności pierwszej partii gry w spotkaniu) oraz serię
-- zwycięstw przed i po spotkaniu, liczoną z całej historii (§5.6.4). Seria po spotkaniu:
-- wygrana → seria przed + 1, brak wygranej → 0. Spotkania późniejsze nie mają znaczenia.
-- Kolejność: punkty malejąco (wspólne miejsce przy równych), alfabetycznie, usunięci na końcu.

-- Reguła miejsc notesu jest czysta (immutable) i nie zdradza danych: statystyki gry działają
-- z prawami wywołującego, więc potrzebują jej do kierunku rekordu.
grant execute on function private.scorepad_ranking(jsonb) to authenticated;

create function public.game_stats(game_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with game as (
    select g.id from public.games g where g.id = game_stats.game_id
  ),
  plays as (
    select p.id, p.meeting_id, p.saved_at, m.starts_at, r.dir
      from public.plays p
      join public.meetings m on m.id = p.meeting_id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) r on true
     where p.game_id = game_stats.game_id and p.status = 'saved'
  ),
  -- Kierunek wersji notesu ostatniej zapisanej partii (§5.6.6).
  current_dir as (
    select coalesce(pl.dir, 'desc') as dir
      from plays pl
     order by pl.starts_at desc, pl.meeting_id desc, pl.saved_at desc, pl.id desc
     limit 1
  ),
  results as (
    select r.profile_id, r.points, r.is_win, r.ranking_value, pl.id as play_id, pl.meeting_id,
           pl.starts_at, pl.saved_at,
           coalesce(pl.dir, 'desc') = (select cd.dir from current_dir cd) as comparable
      from public.play_results r
      join plays pl on pl.id = r.play_id
  ),
  best as (
    select case (select cd.dir from current_dir cd)
             when 'asc' then min(r.ranking_value)
             else max(r.ranking_value)
           end as value
      from results r
     where r.comparable and r.ranking_value is not null
  ),
  -- Każdy rekordzista raz: z pierwszą partią, w której osiągnął rekord (§5.6.6).
  holders as (
    select distinct on (r.profile_id)
           r.profile_id, r.play_id, r.meeting_id, r.starts_at, r.saved_at
      from results r
     where r.comparable and r.ranking_value = (select b.value from best b)
     order by r.profile_id, r.starts_at, r.meeting_id, r.saved_at, r.play_id
  ),
  players as (
    select r.profile_id,
           (count(*) filter (where r.is_win))::int as wins,
           sum(r.points)::int as points,
           count(*)::int as plays,
           pr.first_name, pr.last_name, pr.deleted_at is not null as deleted
      from results r
      join public.profiles pr on pr.id = r.profile_id
     group by r.profile_id, pr.first_name, pr.last_name, pr.deleted_at
  ),
  ranked as (
    select pl.*,
           (rank() over (partition by pl.deleted order by pl.wins desc, pl.points desc)
             + case when pl.deleted then count(*) filter (where not pl.deleted) over () else 0 end)::int as place
      from players pl
  )
  select jsonb_build_object(
    'play_count', (select count(*) from plays)::int,
    'last_played_at', (select max(pl.starts_at) from plays pl),
    'top_winners', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', rk.profile_id, 'wins', rk.wins)
               order by rk.first_name collate "pl-x-icu", rk.last_name collate "pl-x-icu", rk.profile_id)
        from ranked rk
       where not rk.deleted and rk.wins > 0
         and rk.wins = (select max(x.wins) from ranked x where not x.deleted)
    ), '[]'::jsonb),
    'record', (
      select jsonb_build_object(
               'value', b.value,
               'dir', (select cd.dir from current_dir cd),
               'holders', (
                 select jsonb_agg(jsonb_build_object(
                          'profile_id', h.profile_id, 'play_id', h.play_id,
                          'meeting_id', h.meeting_id, 'starts_at', h.starts_at)
                          order by h.starts_at, h.meeting_id, h.saved_at, h.play_id)
                   from holders h))
        from best b
       where b.value is not null
    ),
    'winner_average', (
      select avg(r.ranking_value) from results r
       where r.comparable and r.is_win and r.ranking_value is not null
    ),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object(
               'place', rk.place, 'profile_id', rk.profile_id, 'deleted', rk.deleted,
               'wins', rk.wins, 'points', rk.points, 'plays', rk.plays)
               order by rk.deleted, rk.wins desc, rk.points desc,
                        rk.first_name collate "pl-x-icu", rk.last_name collate "pl-x-icu", rk.profile_id)
        from ranked rk
    ), '[]'::jsonb)
  )
    from game;
$$;

comment on function public.game_stats(uuid) is
  'Statystyki gry (GAME-11): partie, ostatnia data, najczęstsi zwycięzcy, rekord (wszyscy przy równej wartości, Q25), średni wynik zwycięzcy i ranking graczy (wygrane, punkty).';

revoke execute on function public.game_stats(uuid) from public, anon;
grant execute on function public.game_stats(uuid) to authenticated;

create function public.meeting_summary(meeting_id uuid)
returns table (
  place int,
  profile_id uuid,
  deleted boolean,
  points int,
  wins int,
  games jsonb,
  streak_before int,
  streak_after int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select m.id, m.starts_at from public.meetings m where m.id = meeting_summary.meeting_id
  ),
  results as (
    select r.profile_id, r.points, r.is_win, p.game_id,
           dense_rank() over (order by p.saved_at, p.id) as play_order
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
     where r.meeting_id = (select t.id from target t)
  ),
  per_game as (
    select r.profile_id, r.game_id, g.title, g.deleted_at is not null as game_deleted,
           sum(r.points)::int as points, (count(*) filter (where r.is_win))::int as wins,
           min(r.play_order) as first_play
      from results r
      join public.games g on g.id = r.game_id
     group by r.profile_id, r.game_id, g.title, g.deleted_at
  ),
  players as (
    select pg.profile_id,
           sum(pg.points)::int as points,
           sum(pg.wins)::int as wins,
           jsonb_agg(jsonb_build_object(
             'game_id', pg.game_id, 'title', pg.title, 'deleted', pg.game_deleted,
             'points', pg.points, 'wins', pg.wins)
             order by pg.first_play) as games
      from per_game pg
     group by pg.profile_id
  ),
  -- Spotkania graczy przed tym spotkaniem (§5.6.6): wygrana w spotkaniu albo jej brak.
  history as (
    select r.profile_id, m.id as meeting_id, m.starts_at, bool_or(r.is_win) as won
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
      cross join target t
     where r.profile_id in (select pl.profile_id from players pl)
       and (m.starts_at, m.id) < (t.starts_at, t.id)
     group by r.profile_id, m.id, m.starts_at
  ),
  -- Bieżąca seria to wygrane spotkania po ostatnim spotkaniu bez wygranej.
  streaks as (
    select h.profile_id, (count(*) filter (where h.losses_after = 0))::int as streak
      from (select hi.profile_id, hi.won,
                   count(*) filter (where not hi.won)
                     over (partition by hi.profile_id order by hi.starts_at desc, hi.meeting_id desc) as losses_after
              from history hi) h
     group by h.profile_id
  ),
  scored as (
    select pl.profile_id, pl.points, pl.wins, pl.games,
           pr.first_name, pr.last_name, pr.deleted_at is not null as deleted,
           coalesce(s.streak, 0) as streak_before
      from players pl
      join public.profiles pr on pr.id = pl.profile_id
      left join streaks s on s.profile_id = pl.profile_id
  ),
  ranked as (
    select sc.*,
           (rank() over (partition by sc.deleted order by sc.points desc)
             + case when sc.deleted then count(*) filter (where not sc.deleted) over () else 0 end)::int as place
      from scored sc
  )
  select rk.place, rk.profile_id, rk.deleted, rk.points, rk.wins, rk.games, rk.streak_before,
         case when rk.wins > 0 then rk.streak_before + 1 else 0 end as streak_after
    from ranked rk
   order by rk.deleted, rk.points desc,
            rk.first_name collate "pl-x-icu", rk.last_name collate "pl-x-icu", rk.profile_id;
$$;

comment on function public.meeting_summary(uuid) is
  'Podsumowanie leaderboardowe spotkania (VIEW-4): punkty i wygrane graczy z rozbiciem na gry oraz seria zwycięstw przed i po spotkaniu (§5.6.4).';

revoke execute on function public.meeting_summary(uuid) from public, anon;
grant execute on function public.meeting_summary(uuid) to authenticated;
