-- Skomplikowanie gry, punkty ułamkowe, przesunięcie miejsc w mniejszych partiach i zespoły.
--
-- Zasady:
-- - `games.complexity`: skomplikowanie gry 1,00…5,00 (dwa miejsca po przecinku). Wymagane dla
--   nowych gier i przy każdej edycji gry, która je ma; starsze gry bez wartości zostają bez
--   zmian (snapshoty partii), dopóki administrator go nie uzupełni. Formularz gry
--   wylicza z niego punktację miejsc (`complexityPoints` w `@bg-club/scoring`); baza
--   sprawdza tylko poprawność punktacji, bo administrator może ją poprawić ręcznie.
-- - Punkty za miejsca, snapshot partii i punkty wyniku to `numeric` ≥ 0 z najwyżej dwoma
--   miejscami po przecinku (`games.placement_points`, `plays.points_snapshot`,
--   `play_results.points`). Rankingi, statystyki i osiągnięcia sumują je bez obcinania do
--   liczb całkowitych.
-- - `play_points(places, points)`: w partii z n stronami liczą się ostatnie n pozycji
--   punktacji (gra 2–6, partia 4 graczy: zwycięzca za 3. miejsce, ostatni za 6.). Remis to
--   średnia punktów zajętych miejsc zaokrąglona w dół do setnych.
-- - Zespoły: kategoria „nazwa gracza” z `team: true` w szablonie notesu pozwala posadzić kilku
--   graczy na jednym miejscu kartki (`scorepad_versions.teams`). Strona (miejsce na kartce)
--   zajmuje jedno miejsce w partii; każdy członek zespołu dostaje pełne punkty tego miejsca
--   (bez dzielenia) i wygraną przy 1. miejscu. Remis to wspólne miejsce różnych stron.
--   Partia ma co najmniej 2 strony i max(2, min gry)…max gry graczy.
-- - `start_play(…, player_ids, seat_numbers)`: bez `seat_numbers` jak dotąd (`player_ids[i]` na
--   miejscu i, NULL = wolne); z `seat_numbers` płaska lista graczy i ich miejsc na kartce
--   (kilku na jednym miejscu tylko w notesie z zespołami).
-- - Osiągnięcie `tie-top` liczy wspólne 1. miejsce różnych stron (`play_results.tied`), więc
--   wygrana zespołu nie jest „ex aequo”.

-- Podmiana fragmentu definicji funkcji z kontrolą, że fragment istnieje (pomocnicza, usuwana
-- na końcu migracji).
create function private.migration_rewrite(def text, old text, new text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if strpos(def, old) = 0 then
    raise exception 'migration: fragment not found: %', old;
  end if;
  return replace(def, old, new);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Punktacja ułamkowa
-- ---------------------------------------------------------------------------------------------
create function public.is_valid_points(points numeric[], expected_length int)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
return points is not null
  and expected_length is not null
  and cardinality(points) = expected_length
  and (expected_length = 0 or array_ndims(points) = 1)
  and coalesce(array_lower(points, 1), 1) = 1
  and array_position(points, null) is null
  and coalesce(0 <= all (points), true)
  and not exists (select 1 from unnest(points) v where v <> round(v, 2));

comment on function public.is_valid_points(numeric[], int) is
  'Walidacja punktacji miejsc: jednowymiarowa, indeksy od 1, bez NULL, wartości ≥ 0 z najwyżej dwoma miejscami po przecinku, zadana długość.';

revoke execute on function public.is_valid_points(numeric[], int) from public, anon;
grant execute on function public.is_valid_points(numeric[], int) to authenticated;

-- Widok kolekcji zależy od kolumny punktacji: odtwarzamy go (z nową kolumną) po zmianie typu.
drop function public.search_games(text);
drop view public.game_collection;

alter table public.games drop constraint games_placement_points_check;
alter table public.plays drop constraint plays_points_snapshot_check;
alter table public.play_results drop constraint play_results_points_check;

alter table public.games alter column placement_points type numeric[] using placement_points::numeric[];
alter table public.plays alter column points_snapshot type numeric[] using points_snapshot::numeric[];
alter table public.play_results alter column points type numeric using points::numeric;

alter table public.games
  add constraint games_placement_points_check check (public.is_valid_points(placement_points, max_players));
alter table public.plays
  add constraint plays_points_snapshot_check check (public.is_valid_points(points_snapshot, cardinality(points_snapshot))
    and cardinality(points_snapshot) >= 1);
alter table public.play_results
  add constraint play_results_points_check check (points >= 0 and points = round(points, 2));

drop function public.is_valid_points(int[], int);

comment on column public.games.placement_points is
  'Punkty leaderboardu za miejsca 1…max_players (długość = max_players), ≥ 0, do dwóch miejsc po przecinku.';

-- ---------------------------------------------------------------------------------------------
-- Skomplikowanie gry
-- ---------------------------------------------------------------------------------------------
alter table public.games
  add column complexity numeric(3, 2)
    constraint games_complexity_range check (complexity between 1 and 5);

comment on column public.games.complexity is
  'Skomplikowanie gry 1,00…5,00; podstawa wzoru punktacji miejsc. NULL tylko w grach sprzed tej migracji.';

-- Wymagane przy dodaniu gry przez aplikację (rola `authenticated`, formularz gry); gra, która
-- je ma, nie może go stracić. Import i dane techniczne (service_role, właściciel bazy) mogą
-- dodać grę bez niego, jak gry sprzed tej migracji.
create function public.games_require_complexity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.complexity is null
     and ((tg_op = 'INSERT' and current_user = 'authenticated')
          or (tg_op = 'UPDATE' and old.complexity is not null)) then
    raise exception 'game complexity is required'
      using errcode = '23502', constraint = 'games_complexity_required', hint = 'games_complexity_required';
  end if;
  return new;
end;
$$;

revoke execute on function public.games_require_complexity() from public, anon, authenticated;

create trigger games_require_complexity before insert or update on public.games
  for each row execute function public.games_require_complexity();

grant insert (complexity) on public.games to authenticated;
grant update (complexity) on public.games to authenticated;

create view public.game_collection
with (security_invoker = true)
as
select
  g.id,
  g.title,
  g.title_search,
  g.cover_path,
  g.min_players,
  g.max_players,
  g.placement_points,
  g.created_at,
  g.updated_at,
  (select max(p.saved_at)
     from public.plays p
    where p.game_id = g.id
      and p.status = 'saved') as last_played_at,
  g.complexity
from public.games g
where g.deleted_at is null;

comment on view public.game_collection is
  'Aktywne gry kolekcji z datą ostatniej zapisanej partii (kolejność widżetu).';
comment on column public.game_collection.last_played_at is
  'saved_at ostatniej zapisanej partii gry; NULL = gra jeszcze nie grana.';

create function public.search_games(query text default null)
returns setof public.game_collection
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
    from public.game_collection c
   where coalesce(btrim(query), '') = ''
      or c.title_search like '%' || replace(replace(replace(
           public.search_text(btrim(query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by c.title_search, c.id;
$$;

comment on function public.search_games(text) is
  'Aktywne gry, których tytuł zawiera zapytanie (bez wielkości liter i polskich znaków).';

revoke all on public.game_collection from anon, authenticated;
grant select on public.game_collection to authenticated;
revoke execute on function public.search_games(text) from public, anon;
grant execute on function public.search_games(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Punkty za miejsca: przesunięcie w mniejszych partiach i remisy do setnych
-- ---------------------------------------------------------------------------------------------
drop function public.play_points(int[], int[]);

-- Punkty kolejnych stron (w kolejności `places`) według punktacji miejsc `points`:
-- - n stron zajmuje ostatnie n pozycji punktacji (przesunięcie = cardinality(points) − n),
-- - strona na miejscu k bez remisu dostaje points[k + przesunięcie],
-- - m stron zremisowanych na miejscu k dostaje floor(100 · suma ich pozycji / m) / 100.
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

revoke execute on function public.play_points(int[], numeric[]) from public, anon, authenticated;

-- Snapshot punktacji w zmiennej numeric[] (wcześniej int[] obcinałby ułamki).
do $$
declare
  def text := pg_get_functiondef('public.plays_before_insert()'::regprocedure);
begin
  execute private.migration_rewrite(def, 'points int[];', 'points numeric[];');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Zespoły
-- ---------------------------------------------------------------------------------------------
alter table public.scorepad_versions
  add column teams boolean not null
    generated always as (
      jsonb_path_exists(template, '$.lines[*] ? (@.kind == "names" && @.team == true)')
    ) stored;

comment on column public.scorepad_versions.teams is
  'Kategoria „nazwa gracza” przyjmuje zespoły (template.lines[].team): kilku graczy na jednym miejscu kartki.';

-- Kilku graczy na miejscu kartki (zespół). Jednego gracza na miejsce w notesie bez zespołów
-- pilnuje wyzwalacz `play_results_before_write` (blokada wiersza partii szereguje zapisy).
alter table public.play_results drop constraint play_results_seat_key;
create index play_results_play_seat_idx on public.play_results (play_id, seat);

create or replace function public.play_results_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  play public.plays;
  slots int;
  teams boolean;
begin
  if tg_op = 'UPDATE' and (new.play_id is distinct from old.play_id or new.meeting_id is distinct from old.meeting_id) then
    raise exception 'play_results.play_id and meeting_id are immutable'
      using errcode = '23514', constraint = 'play_results_play_immutable';
  end if;

  -- Blokada wiersza partii szereguje równoległe zmiany graczy tej samej partii (dwa urządzenia),
  -- więc sprawdzenie liczby graczy na końcu transakcji widzi wszystkie zatwierdzone zmiany.
  select * into play from public.plays where id = coalesce(new.play_id, old.play_id) for update;
  if not found then
    if tg_op = 'DELETE' then
      -- Kaskadowe usunięcie partii: jej wiersz jest już usunięty, wyniki znikają razem z nią.
      return old;
    end if;
    raise exception 'play % does not exist', new.play_id
      using errcode = '23503', constraint = 'play_results_play_id_meeting_id_fkey';
  end if;

  if play.status = 'saved' then
    raise exception 'results of a saved play are immutable'
      using errcode = '23514', constraint = 'play_results_saved_immutable';
  end if;

  if tg_op <> 'DELETE' then
    select v.player_slots, v.teams into slots, teams
      from public.scorepad_versions v where v.id = play.scorepad_version_id;
    if new.seat > slots then
      raise exception 'seat % exceeds % player slots of the scorepad', new.seat, slots
        using errcode = '23514', constraint = 'play_results_seat_within_slots';
    end if;
    -- Notes bez zespołów: jeden gracz na miejsce w notesie.
    if not coalesce(teams, false) and exists (
      select 1 from public.play_results r
       where r.play_id = new.play_id and r.seat = new.seat and r.profile_id <> new.profile_id
         and (tg_op = 'INSERT' or r.profile_id <> old.profile_id)
    ) then
      raise exception 'seat % of play % is taken (play_results_seat_key)', new.seat, new.play_id
        using errcode = '23505', constraint = 'play_results_seat_key';
    end if;
  end if;

  return coalesce(new, old);
end;
$fn$;

-- - Szkic: najwyżej tylu graczy, ilu mieści snapshot punktacji gry (max graczy gry); w notesie
--   bez zespołów miejsca są pojedyncze (`play_results_before_write`), więc graczy jest też
--   najwyżej tyle, ile miejsc notesu.
-- - Zapisana partia: dodatkowo co najmniej 2 strony i uzupełnione wyniki wszystkich.
create or replace function public.check_play_players(target_play_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  play public.plays;
  players int;
  sides int;
  incomplete int;
begin
  select * into play from public.plays where id = target_play_id;
  if not found then
    return;
  end if;

  select count(*), count(distinct r.seat), count(*) filter (where r.place is null)
    into players, sides, incomplete
    from public.play_results r
   where r.play_id = target_play_id;

  if players > cardinality(play.points_snapshot) then
    raise exception 'play % has % players, at most % allowed', target_play_id, players, cardinality(play.points_snapshot)
      using errcode = '23514', constraint = 'plays_max_players';
  end if;

  if play.status = 'saved' then
    if sides < 2 then
      raise exception 'saved play % has % sides, at least 2 required', target_play_id, sides
        using errcode = '23514', constraint = 'plays_min_players';
    end if;
    if incomplete > 0 then
      raise exception 'saved play % has results without place', target_play_id
        using errcode = '23514', constraint = 'plays_saved_results_complete';
    end if;
  end if;
end;
$$;

-- Ponowienie start_play: istniejąca partia, gdy to ta sama (autor, spotkanie, notes, gracze na
-- miejscach); inaczej błąd `plays_already_exists`.
drop function public.start_play(uuid, uuid, uuid, uuid[]);
drop function private.same_started_play(public.plays, uuid, uuid, uuid[]);

create function private.same_started_play(existing public.plays, meeting_id uuid, scorepad_id uuid, player_ids uuid[], seat_numbers int[])
returns public.plays
language plpgsql
stable
set search_path = ''
as $$
begin
  if existing.started_by = auth.uid()
     and existing.meeting_id = same_started_play.meeting_id
     and exists (
       select 1 from public.scorepad_versions v
        where v.id = existing.scorepad_version_id and v.scorepad_id = same_started_play.scorepad_id
     )
     and array(
       select r.seat || ':' || r.profile_id from public.play_results r
        where r.play_id = existing.id order by r.seat, r.profile_id
     ) = array(
       select coalesce(same_started_play.seat_numbers[s.n], s.n::int) || ':' || s.id
         from unnest(same_started_play.player_ids) with ordinality as s(id, n)
        where s.id is not null
        order by coalesce(same_started_play.seat_numbers[s.n], s.n::int), s.id
     ) then
    return existing;
  end if;
  raise exception 'play % already exists', existing.id
    using errcode = '23505', constraint = 'plays_pkey', hint = 'plays_already_exists';
end;
$$;

revoke execute on function private.same_started_play(public.plays, uuid, uuid, uuid[], int[]) from public, anon, authenticated;

create function public.start_play(play_id uuid, meeting_id uuid, scorepad_id uuid, player_ids uuid[], seat_numbers int[] default null)
returns public.plays
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_status text;
  existing public.plays;
  pad public.scorepads;
  game public.games;
  slots int;
  teams boolean;
  seated record;
  players uuid[];
  sides int;
  lower_bound int;
  upper_bound int;
  saved public.plays;
  created boolean;
begin
  perform private.require_meeting_runner(start_play.meeting_id);

  if start_play.play_id is null then
    raise exception 'play id is required' using errcode = '23502';
  end if;
  if start_play.scorepad_id is null then
    raise exception 'scorepad is required'
      using errcode = '23502', hint = 'plays_scorepad_unavailable';
  end if;

  -- Blokada współdzielona: zakończenie spotkania (FOR UPDATE) czeka na rozpoczęcie partii
  -- i widzi nowy szkic, a partia nie powstanie w spotkaniu, które się właśnie kończy.
  select m.status into meeting_status from public.meetings m where m.id = start_play.meeting_id for share;
  if meeting_status is distinct from 'in_progress' then
    raise exception 'plays can be started only in an in-progress meeting'
      using errcode = '23514', constraint = 'plays_meeting_in_progress', hint = 'plays_meeting_in_progress';
  end if;

  -- Ponowienie po błędzie sieci: partia już jest.
  select p.* into existing from public.plays p where p.id = start_play.play_id;
  if found then
    return private.same_started_play(existing, start_play.meeting_id, start_play.scorepad_id,
      start_play.player_ids, start_play.seat_numbers);
  end if;

  -- Blokady: równoległe usunięcie notesu albo gry czeka na rozpoczęcie partii albo partia
  -- widzi już `deleted_at`.
  select s.* into pad from public.scorepads s where s.id = start_play.scorepad_id for share;
  if not found or pad.deleted_at is not null or pad.current_version_id is null then
    raise exception 'scorepad % is not available', start_play.scorepad_id
      using errcode = 'P0002', hint = 'plays_scorepad_unavailable';
  end if;
  select g.* into game from public.games g where g.id = pad.game_id for share;
  if not found or game.deleted_at is not null then
    raise exception 'game of scorepad % is not available', pad.id
      using errcode = '23514', constraint = 'plays_game_active', hint = 'plays_game_active';
  end if;
  select v.player_slots, v.teams into slots, teams from public.scorepad_versions v where v.id = pad.current_version_id;
  if slots is null then
    raise exception 'scorepad % has no current version', pad.id
      using errcode = 'P0002', hint = 'plays_scorepad_unavailable';
  end if;

  lower_bound := greatest(2, game.min_players);
  -- W notesie z zespołami miejsc kartki może być mniej niż graczy.
  upper_bound := case when teams then game.max_players else least(game.max_players, slots) end;
  if (teams and slots < 2) or (not teams and slots < lower_bound) then
    raise exception 'scorepad has % player slots, game needs at least %', slots, lower_bound
      using errcode = '23514', constraint = 'plays_scorepad_fits_game', hint = 'plays_scorepad_fits_game';
  end if;

  if start_play.seat_numbers is null then
    if coalesce(cardinality(start_play.player_ids), 0) > slots then
      raise exception 'seats exceed % player slots of the scorepad', slots
        using errcode = '23514', constraint = 'play_results_seat_within_slots', hint = 'play_results_seat_within_slots';
    end if;
  elsif cardinality(start_play.seat_numbers) is distinct from cardinality(start_play.player_ids)
     or array_position(start_play.seat_numbers, null) is not null
     or array_position(start_play.player_ids, null) is not null
     or exists (select 1 from unnest(start_play.seat_numbers) s where s < 1 or s > slots) then
    raise exception 'every player needs a seat within % player slots of the scorepad', slots
      using errcode = '23514', constraint = 'play_results_seat_within_slots', hint = 'play_results_seat_within_slots';
  end if;

  players := array(select p from unnest(start_play.player_ids) p where p is not null);
  if cardinality(players) <> (select count(distinct p) from unnest(players) p) then
    raise exception 'a player can take only one seat'
      using errcode = '23514', constraint = 'play_results_pkey', hint = 'plays_players_unique';
  end if;

  select count(distinct s) into sides
    from unnest(coalesce(start_play.seat_numbers,
      array(select n::int from unnest(start_play.player_ids) with ordinality as x(id, n) where x.id is not null))) s;
  if not teams and sides < cardinality(players) then
    raise exception 'scorepad % has no teams: one player per seat', pad.id
      using errcode = '23514', constraint = 'play_results_seat_key', hint = 'plays_teams_unavailable';
  end if;
  if cardinality(players) < lower_bound or cardinality(players) > upper_bound or sides < 2 then
    raise exception 'play needs % to % players on at least 2 seats, got % on %', lower_bound, upper_bound, cardinality(players), sides
      using errcode = '23514', constraint = 'plays_players_count', hint = 'plays_players_count';
  end if;

  -- Uczestnik usunięty z klubu zostaje w historii spotkania, ale nie zagra.
  if exists (
    select 1 from unnest(players) p(id)
     where not exists (
       select 1
         from public.meeting_participants mp
         join public.profiles pr on pr.id = mp.profile_id
        where mp.meeting_id = start_play.meeting_id
          and mp.profile_id = p.id
          and pr.deleted_at is null
     )
  ) then
    raise exception 'players must be active participants of the meeting'
      using errcode = '23514', constraint = 'play_results_participant', hint = 'plays_player_participant';
  end if;

  -- Równoległe ponowienie z tym samym id czeka na pierwsze wywołanie i dostaje jego partię.
  insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
  values (start_play.play_id, start_play.meeting_id, game.id, pad.current_version_id, game.placement_points, auth.uid())
  on conflict (id) do nothing
  returning * into saved;
  created := found;
  if not created then
    select p.* into existing from public.plays p where p.id = start_play.play_id;
    return private.same_started_play(existing, start_play.meeting_id, start_play.scorepad_id,
      start_play.player_ids, start_play.seat_numbers);
  end if;

  for seated in
    select s.id, coalesce(start_play.seat_numbers[s.n], s.n::int) as seat
      from unnest(start_play.player_ids) with ordinality as s(id, n)
     where s.id is not null
  loop
    insert into public.play_results (play_id, meeting_id, profile_id, seat)
    values (saved.id, saved.meeting_id, seated.id, seated.seat);
  end loop;

  return saved;
end;
$$;

comment on function public.start_play(uuid, uuid, uuid, uuid[], int[]) is
  'Rozpoczyna partię (szkic) z bieżącą wersją notesu i graczami w miejscach notesu; z seat_numbers płaska lista graczy i miejsc, kilku na miejscu tylko w notesie z zespołami. Admin lub prowadzący, tylko spotkanie w trakcie.';

revoke execute on function public.start_play(uuid, uuid, uuid, uuid[], int[]) from public, anon;
grant execute on function public.start_play(uuid, uuid, uuid, uuid[], int[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Zapis partii: miejsca i punkty po stronach (graczach albo zespołach)
-- ---------------------------------------------------------------------------------------------
create or replace function public.save_play(play_id uuid, scorepad_version_id uuid, sheet jsonb, results jsonb)
returns public.plays
language plpgsql
security definer
set search_path = ''
as $$
declare
  play_meeting_id uuid;
  meeting_status text;
  play public.plays;
  saved public.plays;
  dir text;
  tiebreak boolean;
  players int;
  sides int;
  seat_numbers int[];
  seat_places int[];
  seat_points numeric[];
  input private.play_result_input[];
begin
  play_meeting_id := private.play_meeting(save_play.play_id);
  perform private.require_meeting_runner(play_meeting_id);

  -- Blokada współdzielona: zakończenie spotkania czeka na zapis partii (koniec spotkania widzi wynik).
  -- Status sprawdzamy po ponowieniu: zapisana partia wraca także po zakończeniu spotkania.
  select m.status into meeting_status from public.meetings m where m.id = play_meeting_id for share;

  -- Blokada wiersza szereguje równoległe zapisy i ponowienia: drugi widzi już zapisaną partię.
  select p.* into play from public.plays p where p.id = save_play.play_id for update;
  if not found then
    raise exception 'play % does not exist', save_play.play_id
      using errcode = 'P0002', hint = 'plays_not_found';
  end if;

  -- Kształt wyników sprawdzamy od razu, także przy ponowieniu.
  input := private.play_results_input(save_play.results);

  if play.status = 'saved' then
    -- Ponowienie (np. po przekroczeniu czasu): ta sama kartka i te same wyniki → zapisana partia.
    if play.sheet is not distinct from save_play.sheet
       and play.scorepad_version_id is not distinct from save_play.scorepad_version_id
       and cardinality(input) = (select count(*) from public.play_results r where r.play_id = play.id)
       and cardinality(input) = (select count(distinct i.profile_id) from unnest(input) i)
       and not exists (
         select i.profile_id, i.seat, i.place, i.scores, i.ranking_value from unnest(input) i
         except
         select r.profile_id, r.seat, r.place, r.scores, r.ranking_value
           from public.play_results r where r.play_id = play.id
       ) then
      return play;
    end if;
    raise exception 'play % is already saved', play.id
      using errcode = '23514', constraint = 'plays_saved_immutable', hint = 'plays_already_saved';
  end if;

  if meeting_status is distinct from 'in_progress' then
    raise exception 'plays can be saved only in an in-progress meeting'
      using errcode = '23514', constraint = 'plays_meeting_in_progress', hint = 'plays_meeting_in_progress';
  end if;

  if save_play.scorepad_version_id is distinct from play.scorepad_version_id then
    raise exception 'results were computed for scorepad version %, play uses %',
        save_play.scorepad_version_id, play.scorepad_version_id
      using errcode = '23514', constraint = 'plays_scorepad_version_snapshot', hint = 'plays_scorepad_version_mismatch';
  end if;

  if save_play.sheet is null or jsonb_typeof(save_play.sheet) <> 'object' then
    raise exception 'sheet must be a JSON object'
      using errcode = '23514', constraint = 'plays_sheet_object', hint = 'plays_sheet_invalid';
  end if;
  if octet_length(save_play.sheet::text) > private.play_draft_max_bytes() then
    raise exception 'sheet exceeds % bytes', private.play_draft_max_bytes()
      using errcode = '23514', constraint = 'plays_draft_size', hint = 'plays_sheet_too_large';
  end if;

  -- Gracze i miejsca w notesie: dokładnie te ze szkicu, każdy raz.
  select count(*), count(distinct r.seat) into players, sides
    from public.play_results r where r.play_id = play.id;
  if cardinality(input) <> players
     or (select count(distinct i.profile_id) from unnest(input) i) <> players
     or exists (
       select 1 from unnest(input) i
        where not exists (
          select 1 from public.play_results r
           where r.play_id = play.id and r.profile_id = i.profile_id and r.seat = i.seat
        )
     ) then
    raise exception 'results must cover exactly the players and seats of play %', play.id
      using errcode = '23514', constraint = 'play_results_players', hint = 'plays_results_players';
  end if;
  if sides < 2 then
    raise exception 'play % has % sides, at least 2 required', play.id, sides
      using errcode = '23514', constraint = 'plays_min_players', hint = 'plays_results_players';
  end if;

  -- Snapshot punktacji z rozpoczęcia partii obejmuje wszystkie strony.
  if cardinality(play.points_snapshot) < sides then
    raise exception 'points snapshot covers % places, play has % sides', cardinality(play.points_snapshot), sides
      using errcode = '23514', constraint = 'plays_max_players', hint = 'plays_points_snapshot';
  end if;

  -- Zespół to jedna strona: członkowie mają to samo miejsce i te same wpisy kartki.
  if exists (
    select 1
      from unnest(input) a
      join unnest(input) b on a.seat = b.seat and a.profile_id <> b.profile_id
     where a.place <> b.place
        or a.scores is distinct from b.scores
        or a.ranking_value is distinct from b.ranking_value
  ) then
    raise exception 'team members must share place and scores'
      using errcode = '23514', constraint = 'play_results_places', hint = 'plays_results_places';
  end if;

  -- Numeracja miejsc stron z remisami: miejsce = 1 + liczba stron na lepszych miejscach.
  if exists (
    with s as (select distinct i.seat, i.place from unnest(input) i)
    select 1 from s
     where s.place <> 1 + (select count(*) from s o where o.place < s.place)
  ) then
    raise exception 'places must be numbered with ties (1, 1, 3)'
      using errcode = '23514', constraint = 'play_results_places', hint = 'plays_results_places';
  end if;

  if not exists (select 1 from unnest(input) i where i.ranking_value is not null) then
    raise exception 'no player has a value of the deciding category'
      using errcode = '23514', constraint = 'play_results_ranking', hint = 'plays_results_empty';
  end if;

  -- Miejsca zgodne z kategorią decydującą: lepsze miejsce nie ma gorszej
  -- wartości, wspólne miejsce ma tę samą. Reguły remisów rozdzielają tylko równe wartości;
  -- tego, jak je rozdzieliły, baza nie sprawdza (sumy i reguły liczy notes).
  select r.dir, r.tiebreak into dir, tiebreak
    from public.scorepad_versions v
   cross join lateral private.scorepad_ranking(v.template) r
   where v.id = play.scorepad_version_id;
  if exists (
    select 1
      from unnest(input) a
      join unnest(input) b on a.place < b.place
     where a.ranking_value is null and b.ranking_value is not null
        or (a.ranking_value is not null and b.ranking_value is not null
            and case when dir = 'asc' then a.ranking_value > b.ranking_value
                     else a.ranking_value < b.ranking_value end)
  ) or exists (
    select 1
      from unnest(input) a
      join unnest(input) b on a.place = b.place and a.profile_id <> b.profile_id
     where a.ranking_value is distinct from b.ranking_value
  ) or (not tiebreak and exists (
    -- Bez reguł remisu równe wartości decydujące dają wspólne miejsce.
    select 1
      from unnest(input) a
      join unnest(input) b on a.place < b.place
     where a.ranking_value is not distinct from b.ranking_value
  )) then
    raise exception 'places do not follow the deciding category'
      using errcode = '23514', constraint = 'play_results_ranking', hint = 'plays_results_ranking';
  end if;

  -- Punkty stron z snapshotu punktacji; każdy członek zespołu dostaje punkty strony.
  select array_agg(s.seat order by s.seat), array_agg(s.place order by s.seat)
    into seat_numbers, seat_places
    from (select distinct i.seat, i.place from unnest(input) i) s;
  seat_points := public.play_points(seat_places, play.points_snapshot);

  -- Najpierw wyniki (wyzwalacz nie pozwala zmieniać wyników zapisanej partii), potem status.
  update public.play_results r
     set scores = i.scores,
         ranking_value = i.ranking_value,
         place = i.place,
         tied = (select count(distinct o.seat) from unnest(input) o where o.place = i.place) > 1,
         points = pts.points,
         is_win = i.place = 1
    from unnest(input) i
    join unnest(seat_numbers, seat_points) as pts(seat, points) on pts.seat = i.seat
   where r.play_id = play.id and r.profile_id = i.profile_id;

  update public.plays p
     set status = 'saved',
         sheet = save_play.sheet
   where p.id = play.id
  returning p.* into saved;

  return saved;
end;
$$;

comment on function public.save_play(uuid, uuid, jsonb, jsonb) is
  'Kończy partię: zapisuje kartkę i wyniki graczy w jednej transakcji; punkty (po stronach: graczach albo zespołach), remisy i wygrane liczy baza. Admin lub prowadzący, tylko spotkanie w trakcie; ponowienie z tą samą treścią zwraca zapisaną partię.';

-- ---------------------------------------------------------------------------------------------
-- Rankingi, statystyki i osiągnięcia: punkty bez obcinania do liczb całkowitych
-- ---------------------------------------------------------------------------------------------
do $$
declare
  def text;
begin
  -- leaderboard: wartość klasyfikacji staje się numeric (zmiana typu wyniku wymaga DROP).
  def := pg_get_functiondef('public.leaderboard(text, int)'::regprocedure);
  def := private.migration_rewrite(def, 'value integer', 'value numeric');
  def := private.migration_rewrite(def, 'sum(r.points)::int as points', 'sum(r.points) as points');
  def := private.migration_rewrite(def, 'when ''wins'' then t.wins', 'when ''wins'' then t.wins::numeric');
  def := private.migration_rewrite(def, 'else coalesce(s.record, 0)', 'else coalesce(s.record, 0)::numeric');
  drop function public.leaderboard(text, int);
  execute def;

  -- meeting_summary: punkty graczy i gier jako numeric.
  def := pg_get_functiondef('public.meeting_summary(uuid)'::regprocedure);
  def := private.migration_rewrite(def, 'points integer', 'points numeric');
  def := private.migration_rewrite(def, 'sum(r.points)::int as points', 'sum(r.points) as points');
  def := private.migration_rewrite(def, 'sum(pg.points)::int as points', 'sum(pg.points) as points');
  drop function public.meeting_summary(uuid);
  execute def;

  def := pg_get_functiondef('public.game_stats(uuid)'::regprocedure);
  execute private.migration_rewrite(def, 'sum(r.points)::int as points', 'sum(r.points) as points');

  def := pg_get_functiondef('public.player_stats(uuid, int)'::regprocedure);
  execute private.migration_rewrite(def,
    'coalesce((select sum(r.points) from results r), 0)::int',
    'coalesce((select sum(r.points) from results r), 0)');

  def := pg_get_functiondef('public.player_achievements(uuid)'::regprocedure);
  execute private.migration_rewrite(def,
    'coalesce((select sum(x.points) from mine x), 0)::int',
    'coalesce((select sum(x.points) from mine x), 0)');

  -- Ex aequo: wspólne 1. miejsce różnych stron (wygrana zespołu się nie liczy).
  def := pg_get_functiondef('private.computed_achievement_unlocks()'::regprocedure);
  def := private.migration_rewrite(def, 'select r.profile_id, r.place, r.points, r.is_win, r.ranking_value, pl.*,',
    'select r.profile_id, r.place, r.points, r.is_win, r.tied, r.ranking_value, pl.*,');
  execute private.migration_rewrite(def, 'where e.is_win and e.winners >= 2', 'where e.is_win and e.tied');
end;
$$;

comment on function public.leaderboard(text, int) is
  'Klasyfikacja punktów, wygranych albo rekordu serii dla całej historii albo roku w strefie klubu. Remisy 1, 1, 3 alfabetycznie; usunięci na końcu, bez podium.';
revoke execute on function public.leaderboard(text, int) from public, anon;
grant execute on function public.leaderboard(text, int) to authenticated;

comment on function public.meeting_summary(uuid) is
  'Podsumowanie leaderboardowe spotkania: punkty i wygrane graczy z rozbiciem na gry oraz seria zwycięstw przed i po spotkaniu.';
revoke execute on function public.meeting_summary(uuid) from public, anon;
grant execute on function public.meeting_summary(uuid) to authenticated;

drop function private.migration_rewrite(text, text, text);
