-- [027] Nowa partia: wybór gry, notesu, graczy i miejsc (PRD RUN-2, RUN-3, PAD-2, PAD-3, PAD-9).
--
-- Zasady:
-- - Partię rozpoczyna `start_play(play_id, meeting_id, scorepad_id, player_ids)`: szkic partii
--   (`plays.status = 'draft'`) i jego graczy w miejscach notesu w jednej transakcji. Wywołać
--   go mogą tylko admin i prowadzący spotkania (`private.require_meeting_runner`), tylko
--   w spotkaniu w trakcie (PAD-9). Partii w toku może być kilka naraz (RUN-3): funkcja nie
--   sprawdza innych szkiców.
-- - Gra wynika z notesu (bieżąca wersja aktywnego notesu aktywnej gry, GAME-9). Bez notesu
--   partii nie da się rozpocząć (RUN-2).
-- - `player_ids[i]` to gracz na miejscu i notesu (od 1); NULL = wolne miejsce. Tablica nie
--   może być dłuższa niż liczba miejsc notesu. Gracze to aktywni uczestnicy spotkania, każdy
--   najwyżej raz (PAD-2).
-- - Liczba graczy: max(2, min gry) ≤ n ≤ min(max gry, miejsca notesu) (PAD-3, Q2). Notes
--   z mniejszą liczbą miejsc niż max(2, min gry) jest niepasujący i odrzucany osobnym błędem.
-- - Identyfikator partii nadaje klient: ponowienie po błędzie sieci zwraca już utworzoną partię
--   zamiast tworzyć drugą (ten sam autor i spotkanie).
-- - Błędy reguł mają SQLSTATE 23514 (brak wiersza: P0002) i nazwę reguły w HINT, jak
--   w migracjach [023] i [024]. Wyzwalacze z [003] pilnują tych samych reguł także poza RPC.

create function public.start_play(play_id uuid, meeting_id uuid, scorepad_id uuid, player_ids uuid[])
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
  players uuid[];
  lower_bound int;
  upper_bound int;
  saved public.plays;
begin
  perform private.require_meeting_runner(start_play.meeting_id);

  if start_play.play_id is null or start_play.scorepad_id is null then
    raise exception 'play id and scorepad are required'
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
    if existing.meeting_id = start_play.meeting_id and existing.started_by = auth.uid() then
      return existing;
    end if;
    raise exception 'play % already exists', start_play.play_id
      using errcode = '23505', constraint = 'plays_pkey', hint = 'plays_already_exists';
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
  select v.player_slots into slots from public.scorepad_versions v where v.id = pad.current_version_id;

  lower_bound := greatest(2, game.min_players);
  upper_bound := least(game.max_players, slots);
  if slots < lower_bound then
    raise exception 'scorepad has % player slots, game needs at least %', slots, lower_bound
      using errcode = '23514', constraint = 'plays_scorepad_fits_game', hint = 'plays_scorepad_fits_game';
  end if;

  if coalesce(cardinality(start_play.player_ids), 0) > slots then
    raise exception 'seats exceed % player slots of the scorepad', slots
      using errcode = '23514', constraint = 'play_results_seat_within_slots', hint = 'play_results_seat_within_slots';
  end if;

  players := array(select p from unnest(start_play.player_ids) p where p is not null);
  if cardinality(players) <> (select count(distinct p) from unnest(players) p) then
    raise exception 'a player can take only one seat'
      using errcode = '23514', constraint = 'play_results_pkey', hint = 'plays_players_unique';
  end if;
  if cardinality(players) < lower_bound or cardinality(players) > upper_bound then
    raise exception 'play needs % to % players, got %', lower_bound, upper_bound, cardinality(players)
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

  insert into public.plays (id, meeting_id, game_id, scorepad_version_id, points_snapshot, started_by)
  values (start_play.play_id, start_play.meeting_id, game.id, pad.current_version_id, game.placement_points, auth.uid())
  returning * into saved;

  insert into public.play_results (play_id, meeting_id, profile_id, seat)
  select saved.id, saved.meeting_id, s.id, s.seat::int
    from unnest(start_play.player_ids) with ordinality as s(id, seat)
   where s.id is not null;

  return saved;
end;
$$;

comment on function public.start_play(uuid, uuid, uuid, uuid[]) is
  'Rozpoczyna partię (szkic) z bieżącą wersją notesu i graczami w miejscach notesu (RUN-2, PAD-2, PAD-3). Admin lub prowadzący, tylko spotkanie w trakcie.';

revoke execute on function public.start_play(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.start_play(uuid, uuid, uuid, uuid[]) to authenticated;
