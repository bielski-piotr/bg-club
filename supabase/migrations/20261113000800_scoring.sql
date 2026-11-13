-- [014] Punkty leaderboardu za miejsca (PRD §5.6.2, §5.6.3, §8.3).
--
-- Miejsca wyznacza notes (pakiet `@bg-club/scoring`), a punkty liczy baza: klient ich nie
-- przysyła. `play_points` jest czystą funkcją dla RPC zapisu partii (zadanie [029]) i liczy
-- tak samo jak `placementPoints` w TypeScripcie. Obie wersje przechodzą wspólne przypadki
-- `packages/scoring/src/cases/play-cases.json` (test pgTAP 110 jest z nich generowany).

-- Punkty kolejnych graczy (w kolejności `places`) według punktacji miejsc `points`:
-- - gracz na miejscu k bez remisu dostaje points[k],
-- - m graczy zremisowanych na miejscu k dostaje floor((points[k] + … + points[k+m−1]) / m).
-- Miejsca muszą tworzyć numerację z remisami („1, 1, 3”): każde miejsce jest o jeden większe
-- od liczby graczy na lepszych miejscach. Błędne dane: wyjątek 22023.
create function public.play_points(places int[], points int[])
returns int[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  players int := coalesce(cardinality(places), 0);
  result int[] := '{}';
  place int;
  tied int;
  better int;
begin
  if places is null or points is null
     or (players > 0 and (array_ndims(places) <> 1 or array_lower(places, 1) <> 1))
     or array_position(places, null) is not null then
    raise exception 'play_points: places must be a one-dimensional array without NULL'
      using errcode = '22023';
  end if;
  if not public.is_valid_points(points, cardinality(points)) then
    raise exception 'play_points: invalid placement points %', points
      using errcode = '22023';
  end if;
  if players > cardinality(points) then
    raise exception 'play_points: % players, but placement points cover % places', players, cardinality(points)
      using errcode = '22023';
  end if;

  for i in 1 .. players loop
    place := places[i];
    select count(*) filter (where p = place), count(*) filter (where p < place)
      into tied, better
      from unnest(places) as p;
    if place <> better + 1 then
      raise exception 'play_points: invalid places %', places
        using errcode = '22023';
    end if;
    result := result || (
      select floor(sum(v)::numeric / tied)::int
        from unnest(points[place : place + tied - 1]) as v
    );
  end loop;

  return result;
end;
$$;

comment on function public.play_points(int[], int[]) is
  'Punkty za miejsca z remisami (floor ze średniej punktów zajętych miejsc, PRD §5.6.2). Dla RPC zapisu partii.';

-- Nie jest API klienta: wywoła ją RPC `save_play` (SECURITY DEFINER) w zadaniu [029].
revoke execute on function public.play_points(int[], int[]) from public, anon, authenticated;
