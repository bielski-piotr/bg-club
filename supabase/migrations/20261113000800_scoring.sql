-- Punkty leaderboardu za miejsca.
--
-- Miejsca wyznacza notes (pakiet `@bg-club/scoring`), a punkty liczy baza: klient ich nie
-- przysyła. `play_points` jest czystą funkcją dla RPC zapisu partii i liczy tak samo jak
-- `placementPoints` w TypeScripcie.

-- Punkty kolejnych stron (graczy albo zespołów, w kolejności `places`) według punktacji miejsc
-- `points`:
-- - n stron zajmuje ostatnie n pozycji punktacji (przesunięcie = cardinality(points) − n; gra
--   2–6, partia 4 graczy: zwycięzca za 3. miejsce, ostatni za 6.),
-- - strona na miejscu k bez remisu dostaje points[k + przesunięcie],
-- - m stron zremisowanych na miejscu k dostaje floor(100 · suma ich pozycji / m) / 100.
-- Miejsca muszą tworzyć numerację z remisami („1, 1, 3”): każde miejsce jest o jeden większe
-- od liczby stron na lepszych miejscach. Błędne dane: wyjątek 22023.
create function public.play_points(places int[], points numeric[])
returns numeric[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  players int := coalesce(cardinality(places), 0);
  result numeric[] := '{}'::numeric[];
  shift int;
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
  shift := cardinality(points) - players;

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
      select trim_scale(floor(sum(v) * 100 / tied) / 100)
        from unnest(points[shift + place : shift + place + tied - 1]) as v
    );
  end loop;

  return result;
end;
$$;

comment on function public.play_points(int[], numeric[]) is
  'Punkty za miejsca stron partii: ostatnie n pozycji punktacji dla n stron, remis = średnia zaokrąglona w dół do setnych. Dla RPC zapisu partii.';

-- Nie jest API klienta: woła ją RPC `save_play` (SECURITY DEFINER).
revoke execute on function public.play_points(int[], numeric[]) from public, anon, authenticated;
