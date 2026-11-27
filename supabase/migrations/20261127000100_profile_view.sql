-- Widok profilu i ustawień.
--
-- - `profiles.admin_view`: administrator sam włącza widok administratora (przyciski
--   administracyjne w aplikacji). Wyłączony ukrywa je także administratorowi; uprawnień w bazie
--   nie zmienia (RLS i RPC dalej sprawdzają rolę). Gracz może zmienić flagę, ale nic mu ona nie daje.
-- - `private.play_expansions_json`: dodatki partii z okładką (miniatury przy rekordzie).
-- - `player_stats`: najlepsza gra to gra z największą liczbą wygranych (ulubiona bez zmian:
--   najwięcej partii), obie z całej historii; bez listy ostatnich spotkań, którą zastępuje
--   `player_meetings`.
-- - `player_meetings(profile_id, date_from, date_to, game_ids)`: spotkania z ≥ 1 zapisaną partią
--   gracza w zakresie dat (strefa klubu) i grach, od najnowszego, z liczbą partii, wygranych
--   i punktów z tych partii.

alter table public.profiles
  add column admin_view boolean not null default false;

comment on column public.profiles.admin_view is
  'Administrator widzi przyciski administracyjne w aplikacji; nie zmienia uprawnień w bazie.';

grant update (admin_view) on public.profiles to authenticated;

create or replace function private.play_expansions_json(expansion_ids uuid[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title, 'cover_path', g.cover_path)
                    order by g.title collate "pl-x-icu", g.id), '[]'::jsonb)
    from public.games g
   where g.id = any (coalesce(play_expansions_json.expansion_ids, '{}'));
$$;

create or replace function public.player_stats(
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
           m.id as meeting_id, m.starts_at
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
    select ar.meeting_id, min(ar.starts_at) as starts_at, bool_or(ar.is_win) as won
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
    -- Remis w wygranych rozstrzyga mniej partii (lepszy procent wygranych).
    'best_game', (
      select jsonb_build_object('game_id', gp.game_id, 'title', gp.title, 'cover_path', gp.cover_path,
                                'plays', gp.plays, 'wins', gp.wins)
        from games_played gp
       where gp.wins > 0
       order by gp.wins desc, gp.plays, gp.title collate "pl-x-icu", gp.game_id
       limit 1
    )
  ) into result;

  return result;
end;
$$;

comment on function public.player_stats(uuid, date, date, uuid[]) is
  'Statystyki gracza: spotkania, partie i wygrane z filtrami dat (strefa klubu) i gier; miejsca, punkty, wygrane, serie, ulubiona i najlepsza gra z całej historii.';

create function public.player_meetings(
  profile_id uuid,
  date_from date default null,
  date_to date default null,
  game_ids uuid[] default null
)
returns table (
  meeting_id uuid,
  title text,
  starts_at timestamptz,
  plays int,
  wins int,
  points numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  range_starts timestamptz;
  range_ends timestamptz;
  game_filter uuid[] := nullif(player_meetings.game_ids, '{}'::uuid[]);
begin
  select b.starts, b.ends into range_starts, range_ends
    from private.date_range_bounds(player_meetings.date_from, player_meetings.date_to) b;

  return query
  select m.id, m.title, m.starts_at, count(*)::int,
         (count(*) filter (where r.is_win))::int, coalesce(sum(r.points), 0)
    from public.play_results r
    join public.plays p on p.id = r.play_id and p.status = 'saved'
    join public.meetings m on m.id = r.meeting_id
   where r.profile_id = player_meetings.profile_id
     and m.starts_at >= range_starts and m.starts_at < range_ends
     and (game_filter is null or p.game_id = any (game_filter))
   group by m.id, m.title, m.starts_at
   order by m.starts_at desc, m.id desc;
end;
$$;

comment on function public.player_meetings(uuid, date, date, uuid[]) is
  'Spotkania z zapisanymi partiami gracza w zakresie dat (strefa klubu) i grach: partie, wygrane i punkty z tych partii, od najnowszego.';

revoke execute on function public.player_meetings(uuid, date, date, uuid[]) from public, anon;
grant execute on function public.player_meetings(uuid, date, date, uuid[]) to authenticated;
