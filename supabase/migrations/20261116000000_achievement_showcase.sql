-- [037] Gablota osiągnięć w profilu i osiągnięcia spotkania (PRD ACH-3, VIEW-5, USR-4, §5.10).
--
-- Odblokowania zapisuje przeliczenie z [036] (`private.recalculate_achievements()`), w tej samej
-- transakcji co zapis i usunięcie partii, zakończenie spotkania, zamknięcie głosowania i
-- usunięcie spotkania. Te funkcje tylko je czytają, więc po usunięciu partii gablota i lista
-- spotkania pokazują stan po przeliczeniu (bez nieaktualnych odznak, §5.6.5).
--
-- `player_achievements(profile_id)` zwraca obiekt jsonb (NULL, gdy profilu nie ma):
-- - `unlocks`: odblokowania gracza z terminem i tytułem spotkania (link w szczegółach odznaki);
-- - `progress`: liczniki do postępu „7/10” nieodblokowanych odznak (ACH-3), liczone z całej
--   historii tak samo jak warunki w `computed_achievement_unlocks()` / `computeAchievements`:
--   `meetings` (spotkania z ≥ 1 partią), `plays`, `wins` (1. miejsce, także wspólne), `points`,
--   `streak` (bieżąca seria, §5.6.4), `games` (różne gry), `won_games` (różne wygrane gry),
--   `game_wins` (najwięcej wygranych w jednej grze), `last_places` (ostatnie miejsce, bez
--   partii, w której wszyscy dzielą 1. miejsce) i `votes` (zaliczone głosowania, Q18).
--   Usunięty członek zachowuje historię (MEM-5), więc ma gablotę tylko do odczytu.
-- Funkcja działa z prawami właściciela (security definer), bo `votes` czyta migawkę
-- `private.meeting_voters`, niedostępną dla klienta; dlatego sama sprawdza, że wywołuje ją
-- aktywny członek (jak RLS pozostałych tabel).
--
-- `meeting_achievements(meeting_id)` (VIEW-5): odblokowania, których datą jest to spotkanie,
-- w kolejności partii (§5.6.6), a `voter-10` (bez partii) na końcu. Security invoker: RLS
-- `achievement_unlocks` daje wynik tylko aktywnym członkom.

create function public.player_achievements(profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_active_member() then
    raise exception 'active member account required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = player_achievements.profile_id) then
    return null;
  end if;

  with mine as (
    select r.play_id, r.place, r.points, r.is_win, p.game_id, m.id as meeting_id, m.starts_at,
           lp.last_place
      from public.play_results r
      join public.plays p on p.id = r.play_id and p.status = 'saved'
      join public.meetings m on m.id = r.meeting_id
      -- Ostatnie miejsce partii jednym przejściem po partiach gracza.
      join (select o.play_id, max(o.place) as last_place
              from public.play_results o
             where o.play_id in (select own.play_id from public.play_results own
                                  where own.profile_id = player_achievements.profile_id)
             group by o.play_id) lp on lp.play_id = r.play_id
     where r.profile_id = player_achievements.profile_id
  ),
  meetings_played as (
    select x.meeting_id, min(x.starts_at) as starts_at, bool_or(x.is_win) as won
      from mine x
     group by x.meeting_id
  ),
  -- Bieżąca seria (§5.6.4, jak `player_stats`): wygrane spotkania od ostatniego bez wygranej.
  last_loss as (
    select mp.starts_at, mp.meeting_id
      from meetings_played mp
     where not mp.won
     order by mp.starts_at desc, mp.meeting_id desc
     limit 1
  ),
  game_wins as (
    select x.game_id, count(*) filter (where x.is_win) as wins
      from mine x
     group by x.game_id
  )
  select jsonb_build_object(
    'unlocks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'achievement_id', u.achievement_id, 'unlocked_at', u.unlocked_at,
               'meeting_id', u.meeting_id, 'meeting_title', m.title, 'play_id', u.play_id)
               order by u.unlocked_at, u.achievement_id)
        from public.achievement_unlocks u
        join public.meetings m on m.id = u.meeting_id
       where u.profile_id = player_achievements.profile_id
    ), '[]'::jsonb),
    'progress', jsonb_build_object(
      'meetings', (select count(*) from meetings_played)::int,
      'plays', (select count(*) from mine)::int,
      'wins', (select count(*) filter (where x.is_win) from mine x)::int,
      'points', coalesce((select sum(x.points) from mine x), 0)::int,
      'streak', (select count(*) from meetings_played mp
                  where mp.won
                    and not exists (select 1 from last_loss l
                                     where (mp.starts_at, mp.meeting_id) < (l.starts_at, l.meeting_id)))::int,
      'games', (select count(distinct x.game_id) from mine x)::int,
      'won_games', (select count(distinct x.game_id) filter (where x.is_win) from mine x)::int,
      'game_wins', coalesce((select max(g.wins) from game_wins g), 0)::int,
      'last_places', (select count(*) from mine x where x.place = x.last_place and x.last_place > 1)::int,
      'votes', (select count(*) from private.meeting_voters v
                 where v.profile_id = player_achievements.profile_id)::int
    )
  ) into result;

  return result;
end;
$$;

comment on function public.player_achievements(uuid) is
  'Gablota osiągnięć gracza (ACH-3, USR-4): odblokowania ze spotkaniem i liczniki postępu nieodblokowanych odznak z całej historii.';

revoke execute on function public.player_achievements(uuid) from public, anon;
grant execute on function public.player_achievements(uuid) to authenticated;

create function public.meeting_achievements(meeting_id uuid)
returns table (profile_id uuid, achievement_id text, play_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.profile_id, u.achievement_id, u.play_id
    from public.achievement_unlocks u
    left join public.plays p on p.id = u.play_id
   where u.meeting_id = meeting_achievements.meeting_id
   order by p.saved_at nulls last, p.id nulls last, u.profile_id, u.achievement_id;
$$;

comment on function public.meeting_achievements(uuid) is
  'Osiągnięcia odblokowane na spotkaniu (VIEW-5), w kolejności partii; voter-10 na końcu.';

revoke execute on function public.meeting_achievements(uuid) from public, anon;
grant execute on function public.meeting_achievements(uuid) to authenticated;
