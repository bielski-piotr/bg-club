-- Statystyki gry i podsumowanie spotkania.
--
-- Zasady:
-- - Jak `leaderboard` : liczą się tylko zapisane partie (`plays.status = 'saved'`,
--   szkice nie), wyniki liczone są z `play_results` przy odczycie, więc zapis i usunięcie
--   partii (`save_play`, `delete_play`) zmieniają statystyki od razu. Funkcje działają
--   z prawami wywołującego (security invoker): RLS daje wynik tylko aktywnym członkom.
-- - Kolejność zdarzeń: spotkania po `starts_at`, potem `id`; partie w spotkaniu
--   po `saved_at`, potem `id`.
--
-- `game_stats(game_id)` zwraca obiekt jsonb (NULL, gdy gry nie ma):
-- - `play_count`, `last_played_at` (termin spotkania ostatniej partii; NULL bez partii);
-- - `top_winners`: aktywni gracze z największą liczbą wygranych (> 0) w tej grze, wszyscy przy
--   remisie, alfabetycznie; usunięci członkowie nie są wyróżniani (jak podium);
-- - `record`: najlepsza wartość kategorii decydującej (`ranking_value`) i wszyscy, którzy ją
--   osiągnęli, każdy z pierwszą partią, w której to zrobił (kto i kiedy). Kierunek
--   „lepiej” bierzemy z reguły notesu (`private.scorepad_ranking`): wersje notesu mogą się
--   różnić, więc obowiązuje kierunek wersji ostatniej zapisanej partii, a partie
--   z wersji o innym kierunku nie biorą udziału w rekordzie ani średniej (ich wartości nie są
--   porównywalne). Partia bez wartości decydującej u gracza (NULL) nie liczy się do rekordu.
--   Bez żadnej wartości `record` jest NULL;
-- - `winner_average`: średnia wartość decydująca zwycięzców (także remisujących o 1. miejsce)
--   z tych samych partii co rekord; NULL bez wartości;
-- - `ranking`: gracze z ≥ 1 zapisaną partią gry: wygrane, potem punkty;
--   wspólne miejsce przy równych obu (1, 1, 3), alfabetycznie w remisie, usunięci na końcu
--   z miejscami liczonymi dalej (jak).
--
-- `meeting_summary(meeting_id)` zwraca graczy z ≥ 1 zapisaną partią spotkania: punkty
-- i wygrane z rozbiciem na gry (w kolejności pierwszej partii gry w spotkaniu) oraz serię
-- zwycięstw przed i po spotkaniu, liczoną z całej historii. Seria po spotkaniu:
-- wygrana → seria przed + 1, brak wygranej → 0. Spotkania późniejsze nie mają znaczenia.
-- Kolejność: punkty malejąco (wspólne miejsce przy równych), alfabetycznie, usunięci na końcu.

-- Reguła miejsc notesu jest czysta (immutable) i nie zdradza danych: statystyki gry działają
-- z prawami wywołującego, więc potrzebują jej do kierunku rekordu.
grant execute on function private.scorepad_ranking(jsonb) to authenticated;

-- Dodatki partii jako [{id, title}] w kolejności tytułów.
create function private.play_expansions_json(expansion_ids uuid[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title)
                    order by g.title collate "pl-x-icu", g.id), '[]'::jsonb)
    from public.games g
   where g.id = any (coalesce(play_expansions_json.expansion_ids, '{}'));
$$;

revoke execute on function private.play_expansions_json(uuid[]) from public, anon;
grant execute on function private.play_expansions_json(uuid[]) to authenticated;

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
    select p.id, p.meeting_id, p.saved_at, m.starts_at, r.dir, p.expansion_ids
      from public.plays p
      join public.meetings m on m.id = p.meeting_id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) r on true
     where p.game_id = game_stats.game_id and p.status = 'saved'
  ),
  -- Kierunek wersji notesu ostatniej zapisanej partii.
  current_dir as (
    select coalesce(pl.dir, 'desc') as dir
      from plays pl
     order by pl.starts_at desc, pl.meeting_id desc, pl.saved_at desc, pl.id desc
     limit 1
  ),
  results as (
    select r.profile_id, r.points, r.is_win, r.ranking_value, pl.id as play_id, pl.meeting_id,
           pl.starts_at, pl.saved_at, pl.expansion_ids,
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
  -- Każdy rekordzista raz: z pierwszą partią, w której osiągnął rekord.
  holders as (
    select distinct on (r.profile_id)
           r.profile_id, r.play_id, r.meeting_id, r.starts_at, r.saved_at, r.expansion_ids
      from results r
     where r.comparable and r.ranking_value = (select b.value from best b)
     order by r.profile_id, r.starts_at, r.meeting_id, r.saved_at, r.play_id
  ),
  players as (
    select r.profile_id,
           (count(*) filter (where r.is_win))::int as wins,
           sum(r.points) as points,
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
                          'meeting_id', h.meeting_id, 'starts_at', h.starts_at,
                          'expansions', private.play_expansions_json(h.expansion_ids))
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
  'Statystyki gry: partie, ostatnia data, najczęstsi zwycięzcy, rekord (wszyscy przy równej wartości), średni wynik zwycięzcy i ranking graczy (wygrane, punkty).';

revoke execute on function public.game_stats(uuid) from public, anon;
grant execute on function public.game_stats(uuid) to authenticated;

create function public.meeting_summary(meeting_id uuid)
returns table (
  place int,
  profile_id uuid,
  deleted boolean,
  points numeric,
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
           sum(r.points) as points, (count(*) filter (where r.is_win))::int as wins,
           min(r.play_order) as first_play
      from results r
      join public.games g on g.id = r.game_id
     group by r.profile_id, r.game_id, g.title, g.deleted_at
  ),
  players as (
    select pg.profile_id,
           sum(pg.points) as points,
           sum(pg.wins)::int as wins,
           jsonb_agg(jsonb_build_object(
             'game_id', pg.game_id, 'title', pg.title, 'deleted', pg.game_deleted,
             'points', pg.points, 'wins', pg.wins)
             order by pg.first_play) as games
      from per_game pg
     group by pg.profile_id
  ),
  -- Spotkania graczy przed tym spotkaniem: wygrana w spotkaniu albo jej brak.
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
  'Podsumowanie leaderboardowe spotkania: punkty i wygrane graczy z rozbiciem na gry oraz seria zwycięstw przed i po spotkaniu.';

revoke execute on function public.meeting_summary(uuid) from public, anon;
grant execute on function public.meeting_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Statystyki i rekordy gracza
-- ---------------------------------------------------------------------------------------------
--    i znów nic nie robi: wszystko liczy się z `play_results` przy odczycie.
--
-- 2. `player_stats(profile_id, date_from, date_to, game_ids)` zwraca obiekt jsonb (NULL, gdy
--   profilu nie ma) w trzech grupach:
--   - statystyki profilu z filtrami jak w rankingu (dni włącznie w strefie klubu,
--     zestaw gier; NULL / pusta tablica = bez ograniczenia; pusty zakres to błąd 22023 z HINT
--     `leaderboard_range_invalid`): `meetings` (spotkania z ≥ 1 partią gracza), `plays`, `wins`;
--   - ranking z całej historii (bez filtrów): `places.points` i `places.wins` (miejsca
--     z `leaderboard`, NULL bez partii i zawsze dla usuniętego członka), `points`,
--     `wins_total`, `streak_current`, `streak_record`;
--   - ulubione z całej historii: `favorite_game` (najwięcej partii) i `best_game` (najwyższy %
--     wygranych spośród gier z ≥ 3 partiami), obie z okładką;
--   oraz `recent_meetings`: 5 ostatnich spotkań z partiami gracza (od najnowszego)
--   z liczbą partii, wygranych i punktów gracza na spotkaniu (bez filtrów).
--
-- `player_records(profile_id, date_from, date_to, game_ids)`: rekord osobisty gracza w każdej
--   grze kolekcji (także bez partii: wtedy `value` NULL). Rekord to najlepsza wartość kategorii
--   decydującej (`ranking_value`) gracza, z tymi samymi zasadami co rekord gry w `game_stats`
--  : kierunek „lepiej” z wersji notesu ostatniej zapisanej partii gry, partie
--   Tylko gry podstawowe (dodatki nie mają rekordów), z dodatkami partii rekordu.

-- Wspólny zakres filtrów (dni w strefie klubu, jak `leaderboard`).
create function private.date_range_bounds(
  date_from date, date_to date, out starts timestamptz, out ends timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  tz text := private.club_timezone();
begin
  if date_from > date_to then
    raise exception 'range % – % is empty', date_from, date_to
      using errcode = '22023', hint = 'leaderboard_range_invalid';
  end if;
  -- Północ dnia w strefie klubu: granice uwzględniają przesunięcie strefy (takżeT).
  starts := coalesce(date_from::timestamp at time zone tz, '-infinity'::timestamptz);
  ends := coalesce((date_to + 1)::timestamp at time zone tz, 'infinity'::timestamptz);
end;
$$;

comment on function private.date_range_bounds(date, date) is
  'Granice zakresu dni (włącznie) w strefie klubu dla filtrów statystyk; pusty zakres to błąd leaderboard_range_invalid.';

revoke execute on function private.date_range_bounds(date, date) from public, anon;
grant execute on function private.date_range_bounds(date, date) to authenticated;

create function public.player_stats(
  profile_id uuid,
  date_from date default null,
  date_to date default null,
  game_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  range_starts timestamptz;
  range_ends timestamptz;
  game_filter uuid[] := nullif(player_stats.game_ids, '{}'::uuid[]);
  removed boolean;
  result jsonb;
begin
  select b.starts, b.ends into range_starts, range_ends
    from private.date_range_bounds(player_stats.date_from, player_stats.date_to) b;

  select pr.deleted_at is not null into removed
    from public.profiles pr
   where pr.id = player_stats.profile_id;
  if not found then
    return null;
  end if;

  with all_results as (
    select r.play_id, r.points, r.is_win, p.game_id, p.saved_at,
           m.id as meeting_id, m.title as meeting_title, m.starts_at
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
     where r.profile_id = player_stats.profile_id
  ),
  filtered as (
    select ar.* from all_results ar
     where ar.starts_at >= range_starts and ar.starts_at < range_ends
       and (game_filter is null or ar.game_id = any (game_filter))
  ),
  meetings_played as (
    select ar.meeting_id, min(ar.meeting_title) as title, min(ar.starts_at) as starts_at,
           bool_or(ar.is_win) as won, count(*)::int as plays,
           (count(*) filter (where ar.is_win))::int as wins, sum(ar.points) as points
      from all_results ar
     group by ar.meeting_id
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
    select ar.game_id, g.title, g.cover_path, count(*)::int as plays,
           (count(*) filter (where ar.is_win))::int as wins
      from all_results ar
      join public.games g on g.id = ar.game_id
     group by ar.game_id, g.title, g.cover_path
  ),
  -- Miejsca z `leaderboard` (cała historia), więc zawsze zgadzają się z rankingiem.
  places as (
    select k.kind,
           (select lb.place from public.leaderboard(k.kind) lb
             where lb.profile_id = player_stats.profile_id) as place
      from unnest(array['points', 'wins']) as k(kind)
     where not removed and exists (select 1 from all_results)
  )
  select jsonb_build_object(
    'meetings', (select count(distinct f.meeting_id) from filtered f)::int,
    'plays', (select count(*) from filtered)::int,
    'wins', (select count(*) filter (where f.is_win) from filtered f)::int,
    'points', coalesce((select sum(ar.points) from all_results ar), 0),
    'wins_total', (select count(*) filter (where ar.is_win) from all_results ar)::int,
    'streak_record', coalesce((select max(s.length) from streaks s), 0),
    'streak_current', coalesce((select s.length from streaks s order by s.run desc limit 1), 0),
    'places', jsonb_build_object(
      'points', (select pl.place from places pl where pl.kind = 'points'),
      'wins', (select pl.place from places pl where pl.kind = 'wins')
    ),
    'favorite_game', (
      select jsonb_build_object('game_id', gp.game_id, 'title', gp.title, 'cover_path', gp.cover_path,
                                'plays', gp.plays, 'wins', gp.wins)
        from games_played gp
       order by gp.plays desc, gp.wins desc, gp.title collate "pl-x-icu", gp.game_id
       limit 1
    ),
    'best_game', (
      select jsonb_build_object('game_id', gp.game_id, 'title', gp.title, 'cover_path', gp.cover_path,
                                'plays', gp.plays, 'wins', gp.wins)
        from games_played gp
       where gp.plays >= 3
       order by gp.wins::numeric / gp.plays desc, gp.wins desc, gp.plays desc,
                gp.title collate "pl-x-icu", gp.game_id
       limit 1
    ),
    'recent_meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'meeting_id', x.meeting_id, 'title', x.title, 'starts_at', x.starts_at,
               'plays', x.plays, 'wins', x.wins, 'points', x.points)
               order by x.starts_at desc, x.meeting_id desc)
        from (select mp.*
                from meetings_played mp
               order by mp.starts_at desc, mp.meeting_id desc
               limit 5) x
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

comment on function public.player_stats(uuid, date, date, uuid[]) is
  'Statystyki gracza: spotkania, partie i wygrane z filtrami dat (strefa klubu) i gier; miejsca, punkty, wygrane i serie z całej historii; ulubiona i najlepsza gra; 5 ostatnich spotkań.';

revoke execute on function public.player_stats(uuid, date, date, uuid[]) from public, anon;
grant execute on function public.player_stats(uuid, date, date, uuid[]) to authenticated;

create function public.player_records(
  profile_id uuid,
  date_from date default null,
  date_to date default null,
  game_ids uuid[] default null
)
returns table (
  game_id uuid,
  title text,
  cover_path text,
  game_deleted boolean,
  dir text,
  value numeric,
  play_id uuid,
  meeting_id uuid,
  meeting_title text,
  starts_at timestamptz,
  club_record boolean,
  expansions jsonb
)
language plpgsql
stable
set search_path = ''
as $$
declare
  range_starts timestamptz;
  range_ends timestamptz;
  game_filter uuid[] := nullif(player_records.game_ids, '{}'::uuid[]);
begin
  select b.starts, b.ends into range_starts, range_ends
    from private.date_range_bounds(player_records.date_from, player_records.date_to) b;

  return query
  with saved as (
    select p.id, p.game_id, p.meeting_id, p.saved_at, p.expansion_ids, m.title as meeting_title,
           m.starts_at, coalesce(rk.dir, 'desc') as dir
      from public.plays p
      join public.meetings m on m.id = p.meeting_id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where p.status = 'saved'
  ),
  -- Kierunek wersji notesu ostatniej zapisanej partii gry (jak `game_stats`).
  current_dir as (
    select distinct on (s.game_id) s.game_id, s.dir
      from saved s
     order by s.game_id, s.starts_at desc, s.meeting_id desc, s.saved_at desc, s.id desc
  ),
  comparable as (
    select r.profile_id, r.ranking_value, s.id, s.game_id, s.meeting_id, s.saved_at,
           s.meeting_title, s.starts_at, s.dir, s.expansion_ids
      from public.play_results r
      join saved s on s.id = r.play_id
      join current_dir cd on cd.game_id = s.game_id and cd.dir = s.dir
     where r.ranking_value is not null
  ),
  club as (
    select c.game_id,
           case min(c.dir) when 'asc' then min(c.ranking_value) else max(c.ranking_value) end as best
      from comparable c
     group by c.game_id
  ),
  mine as (
    select distinct on (c.game_id) c.*
      from comparable c
     where c.profile_id = player_records.profile_id
       and c.starts_at >= range_starts and c.starts_at < range_ends
     order by c.game_id,
              case when c.dir = 'asc' then c.ranking_value end asc,
              case when c.dir = 'desc' then c.ranking_value end desc,
              c.starts_at, c.meeting_id, c.saved_at, c.id
  )
  select g.id, g.title, g.cover_path, g.deleted_at is not null, cd.dir, mi.ranking_value, mi.id,
         mi.meeting_id, mi.meeting_title, mi.starts_at,
         coalesce(mi.ranking_value = cl.best, false),
         case when mi.id is not null then private.play_expansions_json(mi.expansion_ids) end
    from public.games g
    left join current_dir cd on cd.game_id = g.id
    left join mine mi on mi.game_id = g.id
    left join club cl on cl.game_id = g.id
   where g.base_game_id is null
     and (g.deleted_at is null or mi.id is not null)
     and (game_filter is null or g.id = any (game_filter))
   order by g.title collate "pl-x-icu", g.id;
end;
$$;

comment on function public.player_records(uuid, date, date, uuid[]) is
  'Rekordy gracza w grach podstawowych (najlepsza wartość decydująca w zakresie dat i gier) z dodatkami partii rekordu i znacznikiem rekordu klubu.';

revoke execute on function public.player_records(uuid, date, date, uuid[]) from public, anon;
grant execute on function public.player_records(uuid, date, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rekordy w partiach i zmiany w rankingu po spotkaniu
-- ---------------------------------------------------------------------------------------------
-- `meeting_play_records(meeting_id)`: wyniki zapisanych partii spotkania, które były
--   rekordem w chwili rozegrania. Wartość to kategoria decydująca (`ranking_value`), kierunek
--   „lepiej” i porównywalne partie jak w `game_stats` / `player_records` (wersja notesu
--   ostatniej zapisanej partii gry). Partie wcześniejsze to te przed nią w kolejności
--   (spotkanie `starts_at`, `id`, partia `saved_at`, `id`).
--   - `club_record`: najlepsza wartość partii i lepsza od każdej wcześniejszej w tej grze;
--     pierwsza partia gry ustanawia rekord klubu (najlepsza wartość tej partii);
--   - `personal_record`: lepsza od każdej wcześniejszej wartości gracza w tej grze (pierwsza
--     partia gracza w grze nie jest rekordem osobistym: nie ma z czym porównać).
--   `play_record_preview(play_id, results)` liczy to samo dla partii w toku przed zapisem
--   (podsumowanie oderwanej karteczki): porównuje z zapisanymi partiami gry
--   w kierunku wersji notesu tej partii.
--
-- `meeting_leaderboard_changes(meeting_id, game_ids)` zastępuje w aplikacji
--   `meeting_summary`: dla graczy z partią spotkania (w wybranych grach) punkty zdobyte
--   spotkaniu, suma i miejsce w klasyfikacji punktów przed spotkaniem i po nim. Klasyfikacja
--   jak `leaderboard('points', …, game_ids)` (te same rozstrzygnięcia, usunięci na końcu),
--   ale liczona z partii do spotkania włącznie (po) albo sprzed niego (przed); liczba wygranych
--   w rozstrzygnięciu też z tego okresu. Pusta tablica / NULL = wszystkie gry.

create function public.meeting_play_records(meeting_id uuid)
returns table (
  play_id uuid,
  profile_id uuid,
  value numeric,
  club_record boolean,
  personal_record boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with games as (
    select distinct p.game_id from public.plays p
     where p.meeting_id = meeting_play_records.meeting_id and p.status = 'saved'
  ),
  saved as (
    select p.id, p.game_id, p.meeting_id, p.saved_at, m.starts_at, coalesce(rk.dir, 'desc') as dir
      from public.plays p
      join public.meetings m on m.id = p.meeting_id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where p.status = 'saved' and p.game_id in (select g.game_id from games g)
  ),
  -- Kierunek wersji notesu ostatniej zapisanej partii gry (jak `game_stats`).
  current_dir as (
    select distinct on (s.game_id) s.game_id, s.dir
      from saved s
     order by s.game_id, s.starts_at desc, s.meeting_id desc, s.saved_at desc, s.id desc
  ),
  -- Wartość „im większa, tym lepsza” niezależnie od kierunku.
  comparable as (
    select r.profile_id, r.ranking_value as value,
           case when s.dir = 'asc' then -r.ranking_value else r.ranking_value end as score,
           s.id as play_id, s.game_id, s.meeting_id, s.starts_at, s.saved_at
      from public.play_results r
      join saved s on s.id = r.play_id
      join current_dir cd on cd.game_id = s.game_id and cd.dir = s.dir
     where r.ranking_value is not null
  ),
  target as (
    select c.*, max(c.score) over (partition by c.play_id) as play_best
      from comparable c
     where c.meeting_id = meeting_play_records.meeting_id
  ),
  marked as (
    select t.play_id, t.profile_id, t.value,
           coalesce(t.score = t.play_best and t.score > club.best, t.score = t.play_best) as club_record,
           coalesce(t.score > mine.best, false) as personal_record
      from target t
      cross join lateral (
        select max(c.score) as best from comparable c
         where c.game_id = t.game_id
           and (c.starts_at, c.meeting_id, c.saved_at, c.play_id) < (t.starts_at, t.meeting_id, t.saved_at, t.play_id)
      ) club
      cross join lateral (
        select max(c.score) as best from comparable c
         where c.game_id = t.game_id and c.profile_id = t.profile_id
           and (c.starts_at, c.meeting_id, c.saved_at, c.play_id) < (t.starts_at, t.meeting_id, t.saved_at, t.play_id)
      ) mine
  )
  select mk.play_id, mk.profile_id, mk.value, mk.club_record, mk.personal_record
    from marked mk
   where mk.club_record or mk.personal_record
   order by mk.play_id, mk.profile_id;
$$;

comment on function public.meeting_play_records(uuid) is
  'Rekordy klubu i rekordy osobiste ustanowione w zapisanych partiach spotkania (wartość decydująca lepsza od wszystkich wcześniejszych w grze, kierunek jak w game_stats).';

revoke execute on function public.meeting_play_records(uuid) from public, anon;
grant execute on function public.meeting_play_records(uuid) to authenticated;

-- Podgląd przed zapisem: `results` to tablica `{"profile_id": uuid, "value": liczba | null}`.
create function public.play_record_preview(play_id uuid, results jsonb)
returns table (
  profile_id uuid,
  value numeric,
  club_record boolean,
  personal_record boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select p.id, p.game_id, coalesce(rk.dir, 'desc') as dir
      from public.plays p
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where p.id = play_record_preview.play_id
  ),
  candidate as (
    select (e ->> 'profile_id')::uuid as profile_id, (e ->> 'value')::numeric as value
      from jsonb_array_elements(coalesce(play_record_preview.results, '[]'::jsonb)) e
     where e ->> 'value' is not null
  ),
  scored as (
    select c.profile_id, c.value,
           case when t.dir = 'asc' then -c.value else c.value end as score
      from candidate c cross join target t
  ),
  previous as (
    select r.profile_id, case when t.dir = 'asc' then -r.ranking_value else r.ranking_value end as score
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join target t on t.game_id = p.game_id and p.id <> t.id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where r.ranking_value is not null and coalesce(rk.dir, 'desc') = t.dir
  ),
  marked as (
    select s.profile_id, s.value,
           s.score = max(s.score) over ()
             and coalesce(s.score > (select max(pv.score) from previous pv), true) as club_record,
           coalesce(s.score > (select max(pv.score) from previous pv where pv.profile_id = s.profile_id),
                    false) as personal_record
      from scored s
  )
  select mk.profile_id, mk.value, mk.club_record, mk.personal_record
    from marked mk
   where mk.club_record or mk.personal_record
   order by mk.profile_id;
$$;

comment on function public.play_record_preview(uuid, jsonb) is
  'Podgląd rekordów klubu i osobistych dla wyników partii przed zapisem (podsumowanie oderwanej karteczki).';

revoke execute on function public.play_record_preview(uuid, jsonb) from public, anon;
grant execute on function public.play_record_preview(uuid, jsonb) to authenticated;

create function public.meeting_leaderboard_changes(meeting_id uuid, game_ids uuid[] default null)
returns table (
  profile_id uuid,
  deleted boolean,
  points numeric,
  games jsonb,
  total_before numeric,
  total_after numeric,
  place_before int,
  place_after int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select m.id, m.starts_at from public.meetings m where m.id = meeting_leaderboard_changes.meeting_id
  ),
  game_filter as (
    select nullif(meeting_leaderboard_changes.game_ids, '{}'::uuid[]) as ids
  ),
  -- Wszystkie zapisane wyniki do spotkania włącznie (kolejność).
  results as (
    select r.profile_id, r.points, r.is_win, p.game_id,
           dense_rank() over (partition by m.id order by p.saved_at, p.id) as play_order,
           m.id as meeting_id, m.starts_at,
           (m.starts_at, m.id) < (t.starts_at, t.id) as earlier
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
      cross join target t
     where (m.starts_at, m.id) <= (t.starts_at, t.id)
  ),
  -- Dwa okresy: przed spotkaniem (bez niego) i po nim (z nim).
  phased as (
    select ph.after, r.*
      from results r
      cross join (values (false), (true)) as ph(after)
     where ph.after or r.earlier
  ),
  filtered as (
    select ph.* from phased ph
     cross join game_filter gf
     where gf.ids is null or ph.game_id = any (gf.ids)
  ),
  per_meeting as (
    select f.after, f.profile_id, f.meeting_id, min(f.starts_at) as starts_at, sum(f.points) as points
      from filtered f
     group by f.after, f.profile_id, f.meeting_id
  ),
  totals as (
    select pm.after, pm.profile_id, sum(pm.points) as points
      from per_meeting pm
     group by pm.after, pm.profile_id
  ),
  -- Wygrane z okresu we wszystkich grach (3. kryterium rozstrzygnięcia jak w `leaderboard`).
  career as (
    select ph.after, ph.profile_id, (count(*) filter (where ph.is_win))::int as won
      from phased ph
     group by ph.after, ph.profile_id
  ),
  -- Spotkanie, na którym gracz osiągnął wynik: ostatnie, które ten wynik zmieniło.
  reached as (
    select distinct on (pm.after, pm.profile_id)
           pm.after, pm.profile_id, pm.meeting_id, pm.starts_at, pm.points
      from per_meeting pm
     where pm.points <> 0
     order by pm.after, pm.profile_id, pm.starts_at desc, pm.meeting_id desc
  ),
  scored as (
    select t.after, t.profile_id, t.points as score, pr.first_name, pr.last_name,
           pr.deleted_at is not null as deleted, coalesce(cw.won, 0) as career_won,
           rc.meeting_id as reached_id, rc.starts_at as reached_starts, rc.points as reached_score
      from totals t
      join public.profiles pr on pr.id = t.profile_id
      left join reached rc on rc.after = t.after and rc.profile_id = t.profile_id
      left join career cw on cw.after = t.after and cw.profile_id = t.profile_id
  ),
  ranked as (
    select sc.after, sc.profile_id, sc.score, sc.deleted,
           (row_number() over (
              partition by sc.after, sc.deleted
              order by sc.score desc, sc.reached_starts desc nulls last, sc.reached_id desc nulls last,
                       sc.reached_score desc nulls last, sc.career_won desc,
                       sc.first_name collate "pl-x-icu", sc.last_name collate "pl-x-icu", sc.profile_id)
             + case when sc.deleted then count(*) filter (where not sc.deleted) over (partition by sc.after) else 0 end
           )::int as place
      from scored sc
  ),
  -- Punkty spotkania z rozbiciem na gry (w kolejności pierwszej partii gry w spotkaniu).
  meeting_games as (
    select f.profile_id, f.game_id, g.title, g.deleted_at is not null as game_deleted,
           sum(f.points) as points, min(f.play_order) as first_play
      from filtered f
      join target t on t.id = f.meeting_id
      join public.games g on g.id = f.game_id
     where f.after
     group by f.profile_id, f.game_id, g.title, g.deleted_at
  ),
  players as (
    select mg.profile_id, sum(mg.points) as points,
           jsonb_agg(jsonb_build_object(
             'game_id', mg.game_id, 'title', mg.title, 'deleted', mg.game_deleted, 'points', mg.points)
             order by mg.first_play) as games
      from meeting_games mg
     group by mg.profile_id
  )
  select pl.profile_id, af.deleted, pl.points, pl.games, bf.score, af.score, bf.place, af.place
    from players pl
    join ranked af on af.after and af.profile_id = pl.profile_id
    left join ranked bf on not bf.after and bf.profile_id = pl.profile_id
   order by af.place;
$$;

comment on function public.meeting_leaderboard_changes(uuid, uuid[]) is
  'Zmiany w klasyfikacji punktów po spotkaniu dla graczy z partią spotkania (opcjonalnie tylko wybrane gry): punkty zdobyte na spotkaniu z rozbiciem na gry, suma i miejsce przed spotkaniem i po nim (rozstrzygnięcia jak leaderboard).';

revoke execute on function public.meeting_leaderboard_changes(uuid, uuid[]) from public, anon;
grant execute on function public.meeting_leaderboard_changes(uuid, uuid[]) to authenticated;
