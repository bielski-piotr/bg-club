-- Dodatki do gier, kadrowanie okładki i przenoszenie notesów.
--
-- 1. Dodatki (`games.base_game_id`). Dodatek to wiersz `games` wskazujący grę podstawową: ma
--    własny tytuł, okładkę, liczbę graczy, skomplikowanie, punktację miejsc i notesy. Zasady:
--    - gra podstawowa nie jest dodatkiem (bez zagnieżdżania), jest aktywna przy dodaniu dodatku,
--      a `base_game_id` jest niezmienne; usunięcie gry podstawowej usuwa (miękko) jej dodatki;
--    - dodatków nie ma w kolekcji, wyszukiwaniu, filtrach ani w głosowaniu: `search_games`
--      zwraca tylko gry podstawowe, a głosy, opublikowane gry i partie (`game_votes`,
--      `meeting_games`, `plays.game_id`) przyjmują tylko gry podstawowe;
--    - partia zawsze należy do gry podstawowej (`plays.game_id`); dodatki użyte w partii są
--      w `plays.expansion_ids` (niezmienne, jak gra partii). Wyniki, rankingi, statystyki
--      i rekordy liczą się dla gry podstawowej; dodatek ma tylko liczbę rozegranych partii
--      (`game_collection.play_count`), a rekord z partii z dodatkami ma ich listę
--      (`game_stats` → `record.holders[].expansions`, `player_records.expansions`);
--    - `start_play(…, expansion_ids)`: prowadzący zaznacza dodatki partii. Notes może należeć do
--      gry podstawowej albo do jednego z zaznaczonych dodatków. Liczba graczy partii:
--      max(2, najmniejsze min) … największe max spośród gry i dodatków;
--    - punktacja partii (`private.play_scoring_game`): spośród gry podstawowej i zaznaczonych
--      dodatków tytuł o najwyższym skomplikowaniu, który mieści wszystkich graczy partii
--      (max graczy ≥ liczba graczy). Remis skomplikowania wygrywa gra podstawowa. Gdy więc
--      dodatek rozszerza liczbę graczy, a partia ma ich więcej, niż mieści podstawka, liczy się
--      punktacja tytułu o najwyższym skomplikowaniu spośród tych, które mieszczą wszystkich.
--
-- 2. Kadrowanie okładki: `games.cover_source_path` to oryginał (przeskalowany) w buckecie
--    `covers`, z którego aplikacja wycina okładkę, a `games.cover_crop` to kadr
--    (`{"zoom", "x", "y"}`; x, y jako ułamek boku kadru). Ponowne kadrowanie zapisanej okładki
--    wczytuje oryginał. Okładki sprzed tej migracji nie mają oryginału: kadruje się samą okładkę.
--
-- 3. Przenoszenie notesu między grami i dodatkami: administrator zmienia `scorepads.game_id`
--    na inną aktywną grę albo dodatek. Wersje i rozegrane partie zostają bez zmian (partia
--    wskazuje swoją grę i wersję notesu), więc historia, statystyki i leaderboardy się nie
--    zmieniają. Usunięcie notesu było już miękkie i też ich nie zmienia.

create function private.migration_replace(def text, old text, new text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if position(old in def) = 0 then
    raise exception 'migration: fragment not found: %', old;
  end if;
  return replace(def, old, new);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 1. Dodatki: kolumny i strażnicy
-- ---------------------------------------------------------------------------------------------
alter table public.games
  add column base_game_id uuid references public.games (id),
  add column cover_source_path text,
  add column cover_crop jsonb,
  add constraint games_expansion_not_self check (base_game_id is distinct from id),
  add constraint games_cover_crop_object check (cover_crop is null or jsonb_typeof(cover_crop) = 'object');

create index games_base_game_id_idx on public.games (base_game_id);

comment on column public.games.base_game_id is
  'Gra podstawowa dodatku; NULL = gra podstawowa. Dodatki nie są w kolekcji ani w głosowaniu.';
comment on column public.games.cover_source_path is
  'Oryginał okładki w buckecie covers (podstawa ponownego kadrowania); NULL = kadruje się okładkę.';
comment on column public.games.cover_crop is
  'Kadr okładki z oryginału: {"zoom", "x", "y"}, przesunięcie jako ułamek boku kadru.';

grant insert (base_game_id, cover_source_path, cover_crop) on public.games to authenticated;
grant update (cover_source_path, cover_crop) on public.games to authenticated;

create function public.games_guard_expansion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base public.games;
begin
  if tg_op = 'UPDATE' then
    if new.base_game_id is distinct from old.base_game_id then
      raise exception 'games.base_game_id is immutable'
        using errcode = '23514', constraint = 'games_base_game_immutable';
    end if;
    return new;
  end if;

  if new.base_game_id is not null then
    -- Blokada gry podstawowej: równoległe usunięcie czeka albo dodatek widzi `deleted_at`.
    select g.* into base from public.games g where g.id = new.base_game_id for share;
    if not found then
      raise exception 'base game % does not exist', new.base_game_id
        using errcode = '23503', constraint = 'games_base_game_id_fkey';
    end if;
    if base.base_game_id is not null then
      raise exception 'expansion % cannot have expansions', base.id
        using errcode = '23514', constraint = 'games_expansion_of_base', hint = 'games_expansion_of_base';
    end if;
    if base.deleted_at is not null then
      raise exception 'game % is deleted', base.id
        using errcode = '23514', constraint = 'games_base_game_active', hint = 'games_base_game_active';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.games_guard_expansion() from public, anon, authenticated;

create trigger games_guard_expansion before insert or update on public.games
  for each row execute function public.games_guard_expansion();

-- Usunięcie gry podstawowej usuwa jej dodatki (jak gra, zostają w historii).
create or replace function public.games_after_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.game_votes v
   using public.meetings m
   where m.id = v.meeting_id
     and m.status = 'planned'
     and v.game_id = new.id;

  delete from public.meeting_games mg
   using public.meetings m
   where m.id = mg.meeting_id
     and m.status = 'planned'
     and mg.game_id = new.id;

  update public.games g
     set deleted_at = now()
   where g.base_game_id = new.id
     and g.deleted_at is null;

  return null;
end;
$$;

-- Głosy, opublikowane gry i partie: tylko aktywne gry podstawowe.
create or replace function public.require_active_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_at timestamptz;
  base uuid;
begin
  select g.deleted_at, g.base_game_id into removed_at, base
    from public.games g where g.id = new.game_id for share;
  -- Nieistniejącą grę odrzuca klucz obcy.
  if removed_at is not null then
    raise exception 'game % is deleted', new.game_id
      using errcode = '23514', constraint = tg_table_name || '_game_active';
  end if;
  if base is not null then
    raise exception 'game % is an expansion', new.game_id
      using errcode = '23514', constraint = tg_table_name || '_base_game', hint = 'games_expansion_not_allowed';
  end if;
  return new;
end;
$$;

alter table public.plays
  add column expansion_ids uuid[] not null default '{}'
    constraint plays_expansion_ids_shape check (
      array_position(expansion_ids, null) is null
      and (cardinality(expansion_ids) = 0 or array_ndims(expansion_ids) = 1)
    );

create index plays_expansion_ids_idx on public.plays using gin (expansion_ids)
  where cardinality(expansion_ids) > 0;

comment on column public.plays.expansion_ids is
  'Dodatki gry użyte w partii (games.id z base_game_id = game_id); niezmienne. Wyniki liczą się dla gry podstawowej.';

-- ---------------------------------------------------------------------------------------------
-- Kolekcja: dodatki osobno, liczba partii dodatku
-- ---------------------------------------------------------------------------------------------
create or replace view public.game_collection
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
    where p.status = 'saved'
      and (p.game_id = g.id or g.id = any (p.expansion_ids))) as last_played_at,
  g.complexity,
  g.base_game_id,
  g.cover_source_path,
  g.cover_crop,
  case when g.base_game_id is not null then
    (select count(*) from public.plays p
      where p.status = 'saved' and p.game_id = g.base_game_id and g.id = any (p.expansion_ids))::int
  end as play_count
from public.games g
where g.deleted_at is null;

comment on view public.game_collection is
  'Aktywne gry i dodatki (base_game_id) z datą ostatniej zapisanej partii (GAME-1, Q11); kolekcja to wiersze bez base_game_id.';
comment on column public.game_collection.last_played_at is
  'saved_at ostatniej zapisanej partii gry (dodatku: partii z tym dodatkiem); NULL = jeszcze nie grana.';
comment on column public.game_collection.play_count is
  'Dodatek: liczba zapisanych partii z tym dodatkiem; gra podstawowa: NULL (statystyki w game_stats).';

create or replace function public.search_games(query text default null)
returns setof public.game_collection
language sql
stable
security invoker
set search_path = ''
as $$
  select c.*
    from public.game_collection c
   where c.base_game_id is null
     and (coalesce(btrim(query), '') = ''
      or c.title_search like '%' || replace(replace(replace(
           public.search_text(btrim(query)), '\', '\\'), '%', '\%'), '_', '\_') || '%')
   order by c.title_search, c.id;
$$;

comment on function public.search_games(text) is
  'Aktywne gry podstawowe (bez dodatków), których tytuł zawiera zapytanie (bez wielkości liter i polskich znaków, GAME-2).';

-- ---------------------------------------------------------------------------------------------
-- Partie z dodatkami
-- ---------------------------------------------------------------------------------------------

do $$
declare
  def text := pg_get_functiondef('public.plays_before_update()'::regprocedure);
begin
  execute private.migration_replace(def,
    'or new.game_id is distinct from old.game_id',
    'or new.game_id is distinct from old.game_id
     or new.expansion_ids is distinct from old.expansion_ids');
end;
$$;

-- Tytuł, którego punktację stosuje partia: najwyższe skomplikowanie spośród gry podstawowej
-- i dodatków, które mieszczą wszystkich graczy (brak skomplikowania = najniższe); remis wygrywa
-- gra podstawowa, potem tytuł. Gdy żaden nie mieści graczy (start_play to odrzuca), tytuł
-- z największą liczbą graczy.
create function private.play_scoring_game(base_game_id uuid, expansion_ids uuid[], players int)
returns uuid
language sql
stable
set search_path = ''
as $$
  select g.id
    from public.games g
   where g.id = play_scoring_game.base_game_id
      or g.id = any (coalesce(play_scoring_game.expansion_ids, '{}'))
   order by (g.max_players >= play_scoring_game.players) desc,
            case when g.max_players >= play_scoring_game.players then coalesce(g.complexity, 0)
                 else g.max_players end desc,
            (g.id = play_scoring_game.base_game_id) desc,
            g.title_search, g.id
   limit 1;
$$;

comment on function private.play_scoring_game(uuid, uuid[], int) is
  'Gra albo dodatek, którego punktację stosuje partia z dodatkami (najwyższe skomplikowanie mieszczące wszystkich graczy).';

revoke execute on function private.play_scoring_game(uuid, uuid[], int) from public, anon, authenticated;

-- Notes partii: gry podstawowej albo jej dodatku użytego w partii. Snapshot punktacji: gry
-- podstawowej albo, gdy RPC przysłało punktację dodatku z `expansion_ids`, tego dodatku.
create or replace function public.plays_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_status text;
  points numeric[];
  pad public.scorepads;
begin
  -- Szkic powstaje zawsze jako szkic; zapis karteczki to osobny krok (save_play, [029]).
  if new.status <> 'draft' or new.saved_at is not null then
    raise exception 'play must be created as a draft'
      using errcode = '23514', constraint = 'plays_created_as_draft';
  end if;

  -- Blokada współdzielona: spotkanie nie zmieni statusu w trakcie tworzenia szkicu.
  -- Brak wiersza (nieistniejące spotkanie) też odrzucamy.
  select status into meeting_status from public.meetings where id = new.meeting_id for share;
  if meeting_status is distinct from 'in_progress' then
    raise exception 'plays can be started only in an in-progress meeting'
      using errcode = '23514', constraint = 'plays_meeting_in_progress';
  end if;

  new.expansion_ids := array(select distinct e from unnest(new.expansion_ids) e order by e);
  if exists (
    select 1 from unnest(new.expansion_ids) e(id)
     where not exists (
       select 1 from public.games g
        where g.id = e.id and g.base_game_id = new.game_id and g.deleted_at is null
     )
  ) then
    raise exception 'play expansions must be active expansions of game %', new.game_id
      using errcode = '23514', constraint = 'plays_expansions_of_game', hint = 'plays_expansion_unavailable';
  end if;

  select s.* into pad
    from public.scorepad_versions v
    join public.scorepads s on s.id = v.scorepad_id
   where v.id = new.scorepad_version_id;
  if not found then
    raise exception 'scorepad version % does not exist', new.scorepad_version_id
      using errcode = '23503', constraint = 'plays_scorepad_version_id_fkey';
  end if;
  if pad.game_id is distinct from new.game_id and not (pad.game_id = any (new.expansion_ids)) then
    raise exception 'scorepad version does not belong to game %', new.game_id
      using errcode = '23514', constraint = 'plays_scorepad_matches_game';
  end if;
  if pad.deleted_at is not null then
    raise exception 'scorepad % is deleted', pad.id
      using errcode = '23514', constraint = 'plays_scorepad_active';
  end if;
  -- Partia startuje z bieżącą wersją notesu; starsze wersje są tylko dla historii.
  if pad.current_version_id is distinct from new.scorepad_version_id then
    raise exception 'scorepad version is not the current version of scorepad %', pad.id
      using errcode = '23514', constraint = 'plays_scorepad_version_current';
  end if;

  -- Snapshot punktacji zawsze z bazy, niezależnie od tego, co przysłał klient.
  -- (Usuniętą grę odrzuca wcześniej wyzwalacz plays_require_active_game.)
  select g.placement_points into points from public.games g where g.id = new.game_id;
  if not found then
    raise exception 'game % does not exist', new.game_id
      using errcode = '23503', constraint = 'plays_game_id_fkey';
  end if;
  if new.points_snapshot is distinct from points and exists (
    select 1 from public.games g
     where g.id = any (new.expansion_ids) and g.placement_points = new.points_snapshot
  ) then
    points := new.points_snapshot;
  end if;
  new.points_snapshot := points;
  new.started_at := now();
  return new;
end;
$$;

-- Ponowienie start_play: istniejąca partia, gdy to ta sama (autor, spotkanie, notes, dodatki,
-- gracze na miejscach); inaczej błąd `plays_already_exists`.
drop function public.start_play(uuid, uuid, uuid, uuid[], int[]);
drop function private.same_started_play(public.plays, uuid, uuid, uuid[], int[]);

create function private.same_started_play(existing public.plays, meeting_id uuid, scorepad_id uuid,
  player_ids uuid[], seat_numbers int[], expansion_ids uuid[])
returns public.plays
language plpgsql
stable
set search_path = ''
as $$
begin
  if existing.started_by = auth.uid()
     and existing.meeting_id = same_started_play.meeting_id
     and existing.expansion_ids = array(
       select distinct e from unnest(coalesce(same_started_play.expansion_ids, '{}')) e order by e
     )
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

revoke execute on function private.same_started_play(public.plays, uuid, uuid, uuid[], int[], uuid[]) from public, anon, authenticated;

create function public.start_play(play_id uuid, meeting_id uuid, scorepad_id uuid, player_ids uuid[],
  seat_numbers int[] default null, expansion_ids uuid[] default null)
returns public.plays
language plpgsql
security definer
set search_path = ''
as $$
declare
  meeting_status text;
  existing public.plays;
  pad public.scorepads;
  pad_game public.games;
  game public.games;
  expansions uuid[];
  min_players int;
  max_players int;
  slots int;
  teams boolean;
  seated record;
  players uuid[];
  sides int;
  lower_bound int;
  upper_bound int;
  points numeric[];
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
  -- i widzi nowy szkic (RUN-4), a partia nie powstanie w spotkaniu, które się właśnie kończy.
  select m.status into meeting_status from public.meetings m where m.id = start_play.meeting_id for share;
  if meeting_status is distinct from 'in_progress' then
    raise exception 'plays can be started only in an in-progress meeting'
      using errcode = '23514', constraint = 'plays_meeting_in_progress', hint = 'plays_meeting_in_progress';
  end if;

  -- Ponowienie po błędzie sieci: partia już jest.
  select p.* into existing from public.plays p where p.id = start_play.play_id;
  if found then
    return private.same_started_play(existing, start_play.meeting_id, start_play.scorepad_id,
      start_play.player_ids, start_play.seat_numbers, start_play.expansion_ids);
  end if;

  -- Blokady: równoległe usunięcie notesu albo gry czeka na rozpoczęcie partii albo partia
  -- widzi już `deleted_at`.
  select s.* into pad from public.scorepads s where s.id = start_play.scorepad_id for share;
  if not found or pad.deleted_at is not null or pad.current_version_id is null then
    raise exception 'scorepad % is not available', start_play.scorepad_id
      using errcode = 'P0002', hint = 'plays_scorepad_unavailable';
  end if;
  select g.* into pad_game from public.games g where g.id = pad.game_id for share;
  if not found or pad_game.deleted_at is not null then
    raise exception 'game of scorepad % is not available', pad.id
      using errcode = '23514', constraint = 'plays_game_active', hint = 'plays_game_active';
  end if;
  -- Notes dodatku: partia jest partią gry podstawowej z tym dodatkiem.
  if pad_game.base_game_id is null then
    game := pad_game;
  else
    select g.* into game from public.games g where g.id = pad_game.base_game_id for share;
    if not found or game.deleted_at is not null then
      raise exception 'game of scorepad % is not available', pad.id
        using errcode = '23514', constraint = 'plays_game_active', hint = 'plays_game_active';
    end if;
  end if;

  expansions := array(select distinct e from unnest(coalesce(start_play.expansion_ids, '{}')) e where e is not null order by e);
  perform 1 from public.games g where g.id = any (expansions) for share;
  if exists (
    select 1 from unnest(expansions) e(id)
     where not exists (
       select 1 from public.games g
        where g.id = e.id and g.base_game_id = game.id and g.deleted_at is null
     )
  ) then
    raise exception 'play expansions must be active expansions of game %', game.id
      using errcode = '23514', constraint = 'plays_expansions_of_game', hint = 'plays_expansion_unavailable';
  end if;
  if pad_game.id <> game.id and not (pad_game.id = any (expansions)) then
    raise exception 'scorepad % belongs to an expansion not used in the play', pad.id
      using errcode = '23514', constraint = 'plays_scorepad_matches_game', hint = 'plays_expansion_unavailable';
  end if;

  select min(g.min_players), max(g.max_players) into min_players, max_players
    from public.games g
   where g.id = game.id or g.id = any (expansions);

  select v.player_slots, v.teams into slots, teams from public.scorepad_versions v where v.id = pad.current_version_id;
  if slots is null then
    raise exception 'scorepad % has no current version', pad.id
      using errcode = 'P0002', hint = 'plays_scorepad_unavailable';
  end if;

  lower_bound := greatest(2, min_players);
  -- W notesie z zespołami miejsc kartki może być mniej niż graczy.
  upper_bound := case when teams then max_players else least(max_players, slots) end;
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

  -- Uczestnik usunięty z klubu zostaje w historii spotkania (MEM-5), ale nie zagra.
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

  select g.placement_points into points
    from public.games g
   where g.id = private.play_scoring_game(game.id, expansions, cardinality(players));

  -- Równoległe ponowienie z tym samym id czeka na pierwsze wywołanie i dostaje jego partię.
  insert into public.plays (id, meeting_id, game_id, expansion_ids, scorepad_version_id, points_snapshot, started_by)
  values (start_play.play_id, start_play.meeting_id, game.id, expansions, pad.current_version_id, points, auth.uid())
  on conflict (id) do nothing
  returning * into saved;
  created := found;
  if not created then
    select p.* into existing from public.plays p where p.id = start_play.play_id;
    return private.same_started_play(existing, start_play.meeting_id, start_play.scorepad_id,
      start_play.player_ids, start_play.seat_numbers, start_play.expansion_ids);
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

comment on function public.start_play(uuid, uuid, uuid, uuid[], int[], uuid[]) is
  'Rozpoczyna partię (szkic) z bieżącą wersją notesu, graczami w miejscach notesu (RUN-2, PAD-2, PAD-3) i dodatkami gry (expansion_ids); punktacja z tytułu o najwyższym skomplikowaniu, który mieści wszystkich graczy. Admin lub prowadzący, tylko spotkanie w trakcie.';

revoke execute on function public.start_play(uuid, uuid, uuid, uuid[], int[], uuid[]) from public, anon;
grant execute on function public.start_play(uuid, uuid, uuid, uuid[], int[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rekordy z partii z dodatkami: lista dodatków przy rekordzie
-- ---------------------------------------------------------------------------------------------
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

do $$
declare
  def text := pg_get_functiondef('public.game_stats(uuid)'::regprocedure);
begin
  def := private.migration_replace(def,
    'select p.id, p.meeting_id, p.saved_at, m.starts_at, r.dir',
    'select p.id, p.meeting_id, p.saved_at, m.starts_at, r.dir, p.expansion_ids');
  def := private.migration_replace(def,
    'pl.starts_at, pl.saved_at,
           coalesce(pl.dir',
    'pl.starts_at, pl.saved_at, pl.expansion_ids,
           coalesce(pl.dir');
  def := private.migration_replace(def,
    'r.profile_id, r.play_id, r.meeting_id, r.starts_at, r.saved_at
      from results r',
    'r.profile_id, r.play_id, r.meeting_id, r.starts_at, r.saved_at, r.expansion_ids
      from results r');
  def := private.migration_replace(def,
    '''meeting_id'', h.meeting_id, ''starts_at'', h.starts_at)',
    '''meeting_id'', h.meeting_id, ''starts_at'', h.starts_at,
                          ''expansions'', private.play_expansions_json(h.expansion_ids))');
  execute def;
end;
$$;

-- Rekordy gracza: tylko gry podstawowe (dodatki nie mają rekordów), z dodatkami partii rekordu.
drop function public.player_records(uuid, date, date, uuid[]);

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
  -- Kierunek wersji notesu ostatniej zapisanej partii gry (jak `game_stats`, §5.6.6).
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
-- 3. Przenoszenie notesu między grami i dodatkami
-- ---------------------------------------------------------------------------------------------
create or replace function public.scorepads_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_deleted timestamptz;
begin
  if old.deleted_at is not null then
    raise exception 'scorepad % is deleted', old.id
      using errcode = '23514', constraint = 'scorepads_deleted_immutable';
  end if;
  -- Przeniesienie do innej gry albo dodatku: partie wskazują swoją grę i wersję notesu, więc
  -- historia się nie zmienia. Cel musi być aktywny (blokada szereguje z jego usunięciem).
  if new.game_id is distinct from old.game_id then
    select g.deleted_at into target_deleted from public.games g where g.id = new.game_id for share;
    if not found then
      raise exception 'game % does not exist', new.game_id
        using errcode = '23503', constraint = 'scorepads_game_id_fkey';
    end if;
    if target_deleted is not null then
      raise exception 'game % is deleted', new.game_id
        using errcode = '23514', constraint = 'scorepads_game_active', hint = 'scorepads_game_active';
    end if;
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.scorepads_guard_update() from public, anon, authenticated;

grant update (game_id) on public.scorepads to authenticated;

drop function private.migration_replace(text, text, text);
