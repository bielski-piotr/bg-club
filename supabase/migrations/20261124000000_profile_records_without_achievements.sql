-- Profil: bez osiągnięć, rekordy osobiste w grach, statystyki z filtrami (PRD USR-4, STAT-1–STAT-3).
--
-- 1. Osiągnięcia znikają z systemu: katalog, przeliczanie, wyzwalacze, powiadomienia po zapisie
--    partii (`save_play_with_achievements`), migawka głosujących (`private.meeting_voters`, była
--    tylko dla „voter-10”), gablota i lista osiągnięć spotkania. Aplikacja zapisuje partie
--    zwykłym `save_play`. `private.recalculate_after_plays_change` zostaje (woła je `delete_play`)
--    i znów nic nie robi: wszystko liczy się z `play_results` przy odczycie (§5.6.5).
--
-- 2. `player_stats(profile_id, date_from, date_to, game_ids)` zwraca obiekt jsonb (NULL, gdy
--    profilu nie ma) w trzech grupach:
--    - statystyki profilu z filtrami jak w rankingu (LB-4, NFR-10: dni włącznie w strefie klubu,
--      zestaw gier; NULL / pusta tablica = bez ograniczenia; pusty zakres to błąd 22023 z HINT
--      `leaderboard_range_invalid`): `meetings` (spotkania z ≥ 1 partią gracza), `plays`, `wins`;
--    - ranking z całej historii (bez filtrów): `places.points` i `places.wins` (miejsca
--      z `leaderboard`, NULL bez partii i zawsze dla usuniętego członka, LB-7), `points`,
--      `wins_total`, `streak_current`, `streak_record` (§5.6.4);
--    - ulubione z całej historii: `favorite_game` (najwięcej partii) i `best_game` (najwyższy %
--      wygranych spośród gier z ≥ 3 partiami, Q21), obie z okładką;
--    oraz `recent_meetings`: 5 ostatnich spotkań z partiami gracza (od najnowszego, §5.6.6)
--    z liczbą partii, wygranych i punktów gracza na spotkaniu (bez filtrów).
--
-- 3. `player_records(profile_id, date_from, date_to, game_ids)`: rekord osobisty gracza w każdej
--    grze kolekcji (także bez partii: wtedy `value` NULL). Rekord to najlepsza wartość kategorii
--    decydującej (`ranking_value`) gracza, z tymi samymi zasadami co rekord gry w `game_stats`
--    (GAME-11, Q25): kierunek „lepiej” z wersji notesu ostatniej zapisanej partii gry, partie
--    z wersji o innym kierunku i bez wartości się nie liczą; przy równej wartości pierwsza partia
--    (§5.6.6). Filtry dat i gier jak wyżej. `club_record` = rekord osobisty równa się rekordowi
--    klubu w tej grze z całej historii. Usunięte gry są na liście tylko z rekordem gracza.

-- ---------------------------------------------------------------------------------------------
-- 1. Bez osiągnięć
-- ---------------------------------------------------------------------------------------------
drop trigger plays_after_save on public.plays;
drop function public.plays_after_save();
drop trigger meetings_after_change on public.meetings;
drop function public.meetings_after_change();
drop trigger meetings_before_delete on public.meetings;
drop trigger meetings_after_delete on public.meetings;
drop function public.meetings_before_delete();
drop function public.meetings_after_delete();

drop function public.save_play_with_achievements(uuid, uuid, jsonb, jsonb, uuid);
drop trigger achievement_unlocks_notify_insert on public.achievement_unlocks;
drop function private.capture_achievement_notification();
drop table private.play_save_notifications;

drop function public.player_achievements(uuid);
drop function public.meeting_achievements(uuid);
drop function private.recalculate_achievements();
drop function private.computed_achievement_unlocks();
drop table private.meeting_voters;
drop table public.achievement_unlocks;

create or replace function private.recalculate_after_plays_change(meeting_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Nie ma zapisanych agregatów: rankingi, statystyki, serie i rekordy liczą się
  -- z `play_results` przy odczycie. Punkt zostaje dla przyszłych agregatów (sygnatura bez zmian).
  perform recalculate_after_plays_change.meeting_id;
end;
$$;

comment on function private.recalculate_after_plays_change(uuid) is
  'Przeliczenie po zmianie zapisanych partii spotkania (§5.6.5). Obecnie nic nie robi: wszystko liczy się z play_results przy odczycie.';

-- ---------------------------------------------------------------------------------------------
-- Wspólny zakres filtrów (dni w strefie klubu, jak `leaderboard`)
-- ---------------------------------------------------------------------------------------------
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
  -- Północ dnia w strefie klubu: granice uwzględniają przesunięcie strefy (także DST).
  starts := coalesce(date_from::timestamp at time zone tz, '-infinity'::timestamptz);
  ends := coalesce((date_to + 1)::timestamp at time zone tz, 'infinity'::timestamptz);
end;
$$;

comment on function private.date_range_bounds(date, date) is
  'Granice zakresu dni (włącznie) w strefie klubu dla filtrów statystyk; pusty zakres to błąd leaderboard_range_invalid.';

revoke execute on function private.date_range_bounds(date, date) from public, anon;
grant execute on function private.date_range_bounds(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Statystyki gracza
-- ---------------------------------------------------------------------------------------------
drop function public.player_stats(uuid, int);

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
  'Statystyki gracza: spotkania, partie i wygrane z filtrami dat (strefa klubu) i gier; miejsca, punkty, wygrane i serie z całej historii; ulubiona i najlepsza gra (Q21); 5 ostatnich spotkań.';

revoke execute on function public.player_stats(uuid, date, date, uuid[]) from public, anon;
grant execute on function public.player_stats(uuid, date, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Rekordy osobiste
-- ---------------------------------------------------------------------------------------------
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
  club_record boolean
)
language plpgsql
stable
security invoker
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
    select p.id, p.game_id, p.meeting_id, p.saved_at, m.title as meeting_title, m.starts_at,
           coalesce(rk.dir, 'desc') as dir
      from public.plays p
      join public.meetings m on m.id = p.meeting_id
      left join public.scorepad_versions v on v.id = p.scorepad_version_id
      left join lateral private.scorepad_ranking(v.template) rk on true
     where p.status = 'saved'
  ),
  -- Kierunek wersji notesu ostatniej zapisanej partii gry (jak `game_stats`, §5.6.6).
  current_dir as (
    select distinct on (s.game_id) s.game_id, s.dir
      from saved s
     order by s.game_id, s.starts_at desc, s.meeting_id desc, s.saved_at desc, s.id desc
  ),
  comparable as (
    select r.profile_id, r.ranking_value, s.id, s.game_id, s.meeting_id, s.saved_at,
           s.meeting_title, s.starts_at, s.dir
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
         coalesce(mi.ranking_value = cl.best, false)
    from public.games g
    left join current_dir cd on cd.game_id = g.id
    left join mine mi on mi.game_id = g.id
    left join club cl on cl.game_id = g.id
   where (g.deleted_at is null or mi.id is not null)
     and (game_filter is null or g.id = any (game_filter))
   order by g.title collate "pl-x-icu", g.id;
end;
$$;

comment on function public.player_records(uuid, date, date, uuid[]) is
  'Rekord osobisty gracza w każdej grze (najlepsza wartość kategorii decydującej, kierunek jak w game_stats) z filtrami dat i gier; club_record, gdy równa się rekordowi klubu z całej historii.';

revoke execute on function public.player_records(uuid, date, date, uuid[]) from public, anon;
grant execute on function public.player_records(uuid, date, date, uuid[]) to authenticated;
