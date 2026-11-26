-- [027] Nowa partia: wybór gry, notesu, graczy i miejsc (PRD RUN-2, RUN-3, PAD-2, PAD-3, PAD-9).
--
-- Zasady:
-- - Partię rozpoczyna `start_play(play_id, meeting_id, scorepad_id, player_ids, seat_numbers,
--   expansion_ids)`: szkic partii
--   (`plays.status = 'draft'`) i jego graczy w miejscach notesu w jednej transakcji. Wywołać
--   go mogą tylko admin i prowadzący spotkania (`private.require_meeting_runner`), tylko
--   w spotkaniu w trakcie (PAD-9). Partii w toku może być kilka naraz (RUN-3): funkcja nie
--   sprawdza innych szkiców.
-- - Gra wynika z notesu (bieżąca wersja aktywnego notesu aktywnej gry, GAME-9). Bez notesu
--   partii nie da się rozpocząć (RUN-2).
-- - Bez `seat_numbers`: `player_ids[i]` to gracz na miejscu i notesu (od 1); NULL = wolne
--   miejsce. Z `seat_numbers`: płaska lista graczy i ich miejsc na kartce (kilku na jednym
--   miejscu tylko w notesie z zespołami, `scorepad_versions.teams`). Gracze to aktywni
--   uczestnicy spotkania, każdy najwyżej raz (PAD-2).
-- - Zespoły: strona (miejsce na kartce) zajmuje jedno miejsce w partii; każdy członek zespołu
--   dostaje pełne punkty tego miejsca i wygraną przy 1. miejscu. Partia ma co najmniej 2 strony.
-- - Dodatki (`expansion_ids`): prowadzący zaznacza aktywne, dostępne dodatki gry. Notes może
--   należeć do gry podstawowej albo do jednego z zaznaczonych dodatków. Liczba graczy partii:
--   max(2, najmniejsze min) … największe max spośród gry i dodatków (i nie więcej niż miejsc
--   notesu, PAD-3, Q2). Punktacja partii (`private.play_scoring_game`): tytuł o najwyższym
--   skomplikowaniu, który mieści wszystkich graczy; remis wygrywa gra podstawowa.
-- - Identyfikator partii nadaje klient: ponowienie po błędzie sieci (także równoległe) zwraca
--   już utworzoną partię zamiast tworzyć drugą, ale tylko gdy to ta sama partia (autor,
--   spotkanie, notes i gracze na miejscach). Inna treść pod tym samym id to błąd.
-- - Błędy reguł mają SQLSTATE 23514 (brak wiersza: P0002) i nazwę reguły w HINT, jak
--   w migracjach [023] i [024]. Wyzwalacze z [003] pilnują tych samych reguł także poza RPC.

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

-- Ponowienie start_play: istniejąca partia, gdy to ta sama (autor, spotkanie, notes, dodatki,
-- gracze na miejscach); inaczej błąd `plays_already_exists`, zamiast zwracać inną partię jako sukces.
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

  if not game.available then
    raise exception 'game % is unavailable', game.id
      using errcode = '23514', constraint = 'plays_game_available', hint = 'games_unavailable';
  end if;

  expansions := array(select distinct e from unnest(coalesce(start_play.expansion_ids, '{}')) e where e is not null order by e);
  perform 1 from public.games g where g.id = any (expansions) for share;
  if exists (
    select 1 from unnest(expansions) e(id)
     where not exists (
       select 1 from public.games g
        where g.id = e.id and g.base_game_id = game.id and g.deleted_at is null and g.available
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
