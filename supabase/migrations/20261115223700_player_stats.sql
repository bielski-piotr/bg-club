-- [034] Statystyki gracza w profilu (PRD STAT-1–STAT-3, USR-4, MEM-5, §5.6, Q21).
--
-- Zasady (jak `leaderboard`, [032], i `game_stats`, [035]):
-- - Liczą się tylko zapisane partie (`plays.status = 'saved'`), szkice nie. Wyniki są liczone
--   z `play_results` przy odczycie, więc zapis i usunięcie partii (`save_play`, `delete_play`)
--   zmieniają statystyki od razu (§5.6.5). Funkcja działa z prawami wywołującego (security
--   invoker): RLS daje wynik tylko aktywnym członkom.
-- - `year` NULL = cała historia, inaczej rok kalendarzowy w strefie klubu (STAT-3 „jak
--   w leaderboardzie”, LB-4, NFR-10): liczą się partie spotkań, których `starts_at` wypada
--   w tym roku lokalnie, a serie są liczone tylko w obrębie roku. Zły rok to błąd 22023
--   z HINT `leaderboard_year_invalid` (ten sam co w `leaderboard`).
-- - Kolejność zdarzeń (§5.6.6, Q24): spotkania po `starts_at`, potem `id`; partie w spotkaniu po
--   `saved_at`, potem `id`. „Ostatnie partie” odwracają tę kolejność.
--
-- `player_stats(profile_id, year)` zwraca obiekt jsonb (NULL, gdy profilu nie ma; usunięty
-- członek ma statystyki z historii, MEM-5):
-- - `years`: lata (strefa klubu) z zapisanymi partiami gracza, od najnowszego: opcje filtru;
-- - `meetings` (obecność: spotkania z ≥ 1 partią gracza, jak `meet-*` w §5.10), `plays`, `wins`
--   (także wspólne 1. miejsce, §5.6.3), `points` (§5.6.2);
-- - `streak_record` i `streak_current` (§5.6.4): spotkanie z ≥ 1 wygraną daje +1, spotkanie
--   z partiami bez wygranej zeruje serię, spotkanie bez partii gracza nic nie zmienia;
-- - `places`: aktualne miejsca w trzech klasyfikacjach `leaderboard` (points, wins, streak) dla
--   tego samego zakresu; NULL bez partii w zakresie i zawsze dla usuniętego członka (LB-7: nie
--   jest klasyfikowany razem z aktywnymi, DS §8: pozycja „–”);
-- - `favorite_game` (STAT-2): najczęściej grana; remis: więcej wygranych, potem tytuł
--   alfabetycznie (polskie sortowanie), potem `id`; NULL bez partii;
-- - `best_game` (STAT-2, Q21): spośród gier z ≥ 3 partiami gracza najwyższy % wygranych; remis:
--   więcej wygranych, więcej partii, tytuł, `id`; NULL bez takiej gry (pusty stan);
-- - `recent_plays`: najwyżej 10 ostatnich partii (od najnowszej) ze spotkaniem do linku, grą,
--   miejscem, punktami i wygraną.

create function public.player_stats(profile_id uuid, year int default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tz text := private.club_timezone();
  year_starts timestamptz := '-infinity'::timestamptz;
  year_ends timestamptz := 'infinity'::timestamptz;
  removed boolean;
  result jsonb;
begin
  if player_stats.year is not null then
    if player_stats.year not between 1 and 9999 then
      raise exception 'player stats year % is out of range', player_stats.year
        using errcode = '22023', hint = 'leaderboard_year_invalid';
    end if;
    -- Północ 1 stycznia w strefie klubu, jak w `leaderboard` (także DST).
    year_starts := make_timestamptz(player_stats.year, 1, 1, 0, 0, 0, tz);
    year_ends := make_timestamptz(player_stats.year + 1, 1, 1, 0, 0, 0, tz);
  end if;

  select pr.deleted_at is not null into removed
    from public.profiles pr
   where pr.id = player_stats.profile_id;
  if not found then
    return null;
  end if;

  with all_results as (
    select r.play_id, r.place, r.points, r.is_win, p.game_id, p.saved_at,
           m.id as meeting_id, m.title as meeting_title, m.starts_at
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
     where r.profile_id = player_stats.profile_id
  ),
  results as (
    select ar.* from all_results ar
     where ar.starts_at >= year_starts and ar.starts_at < year_ends
  ),
  meetings_played as (
    select r.meeting_id, min(r.starts_at) as starts_at, bool_or(r.is_win) as won
      from results r
     group by r.meeting_id
  ),
  -- Każde spotkanie bez wygranej zaczyna nową grupę; wygrane w grupie to jedna seria.
  runs as (
    select mp.won, count(*) filter (where not mp.won) over (order by mp.starts_at, mp.meeting_id) as run
      from meetings_played mp
  ),
  streaks as (
    select ru.run, (count(*) filter (where ru.won))::int as length
      from runs ru
     group by ru.run
  ),
  games_played as (
    select r.game_id, g.title, count(*)::int as plays, (count(*) filter (where r.is_win))::int as wins
      from results r
      join public.games g on g.id = r.game_id
     group by r.game_id, g.title
  ),
  -- Miejsca bierzemy z `leaderboard`, więc zawsze zgadzają się z rankingiem. Ranking liczymy
  -- tylko dla aktywnego gracza z partiami w zakresie: inaczej miejsca i tak nie ma (LB-5, LB-7).
  places as (
    select k.kind,
           (select lb.place from public.leaderboard(k.kind, player_stats.year) lb
             where lb.profile_id = player_stats.profile_id) as place
      from unnest(array['points', 'wins', 'streak']) as k(kind)
     where not removed and exists (select 1 from results)
  )
  select jsonb_build_object(
    'years', coalesce((
      select jsonb_agg(y.year order by y.year desc)
        from (select distinct extract(year from ar.starts_at at time zone tz)::int as year
                from all_results ar) y
    ), '[]'::jsonb),
    'meetings', (select count(*) from meetings_played)::int,
    'plays', (select count(*) from results)::int,
    'wins', (select count(*) filter (where r.is_win) from results r)::int,
    'points', coalesce((select sum(r.points) from results r), 0)::int,
    'streak_record', coalesce((select max(s.length) from streaks s), 0),
    'streak_current', coalesce((select s.length from streaks s order by s.run desc limit 1), 0),
    'places', jsonb_build_object(
      'points', (select pl.place from places pl where pl.kind = 'points'),
      'wins', (select pl.place from places pl where pl.kind = 'wins'),
      'streak', (select pl.place from places pl where pl.kind = 'streak')
    ),
    'favorite_game', (
      select jsonb_build_object('game_id', gp.game_id, 'title', gp.title, 'plays', gp.plays, 'wins', gp.wins)
        from games_played gp
       order by gp.plays desc, gp.wins desc, gp.title collate "pl-x-icu", gp.game_id
       limit 1
    ),
    'best_game', (
      select jsonb_build_object('game_id', gp.game_id, 'title', gp.title, 'plays', gp.plays, 'wins', gp.wins)
        from games_played gp
       where gp.plays >= 3
       order by gp.wins::numeric / gp.plays desc, gp.wins desc, gp.plays desc,
                gp.title collate "pl-x-icu", gp.game_id
       limit 1
    ),
    'recent_plays', coalesce((
      select jsonb_agg(jsonb_build_object(
               'play_id', x.play_id, 'meeting_id', x.meeting_id, 'meeting_title', x.meeting_title,
               'starts_at', x.starts_at, 'game_id', x.game_id, 'game_title', x.title,
               'place', x.place, 'points', x.points, 'is_win', x.is_win)
               order by x.starts_at desc, x.meeting_id desc, x.saved_at desc, x.play_id desc)
        from (select r.*, g.title
                from results r
                join public.games g on g.id = r.game_id
               order by r.starts_at desc, r.meeting_id desc, r.saved_at desc, r.play_id desc
               limit 10) x
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

comment on function public.player_stats(uuid, int) is
  'Statystyki gracza (STAT-1–STAT-3): obecność, partie, wygrane, punkty, rekord i bieżąca seria, miejsca w trzech rankingach, ulubiona i najlepsza gra (Q21), ostatnie partie; cała historia albo rok w strefie klubu.';

revoke execute on function public.player_stats(uuid, int) from public, anon;
grant execute on function public.player_stats(uuid, int) to authenticated;
