-- [003] Wyzwalacze spójności danych.
--
-- Tu są reguły, których nie da się zapisać jako CHECK albo klucz obcy, bo dotyczą innych
-- wierszy: niezmienność, snapshoty w bazie (GAME-9), miękko usunięte encje (MEM-6, GAME-8),
-- liczba graczy partii (PAD-3). Uprawnienia (kto może pisać) są w zadaniu [004].
--
-- Komunikaty błędów są techniczne (po angielsku) i mają kody SQLSTATE; aplikacja mapuje je
-- na polskie teksty ze słownika.

-- ---------------------------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------------------------
create trigger club_set_updated_at before update on public.club
  for each row execute function public.set_updated_at();
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();
create trigger scorepads_set_updated_at before update on public.scorepads
  for each row execute function public.set_updated_at();
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- club: strefa czasowa IANA (CLUB-2, NFR-10)
-- ---------------------------------------------------------------------------------------------
create function public.club_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'club.timezone: unknown time zone "%"', new.timezone
      using errcode = '23514', constraint = 'club_timezone_check';
  end if;
  return new;
end;
$$;

create trigger club_validate before insert or update of timezone on public.club
  for each row execute function public.club_validate();

-- ---------------------------------------------------------------------------------------------
-- profiles: niezmienny id i hook (USR-1, Q5)
-- ---------------------------------------------------------------------------------------------
create function public.profiles_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable' using errcode = '23514', constraint = 'profiles_id_immutable';
  end if;
  if new.hook is distinct from old.hook then
    raise exception 'profiles.hook is immutable' using errcode = '23514', constraint = 'profiles_hook_immutable';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.profiles_guard_update();

-- Usunięcie konta Auth nie usuwa profilu, tylko oznacza go jako usunięty (MEM-4). Profil
-- administratora łamie wtedy CHECK profiles_admin_not_deleted, więc konta admina nie da się
-- usunąć także bezpośrednio w Auth.
create function public.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set deleted_at = coalesce(deleted_at, now())
   where id = old.id;
  return old;
end;
$$;

revoke execute on function public.handle_auth_user_deleted() from public, anon, authenticated;

create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_auth_user_deleted();

-- ---------------------------------------------------------------------------------------------
-- scorepads i scorepad_versions (GAME-7, GAME-9)
-- ---------------------------------------------------------------------------------------------
create function public.scorepads_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Wersje i partie notesu wskazują grę; przeniesienie notesu do innej gry rozspójniłoby historię.
  if new.game_id is distinct from old.game_id then
    raise exception 'scorepads.game_id is immutable' using errcode = '23514', constraint = 'scorepads_game_immutable';
  end if;
  return new;
end;
$$;

create trigger scorepads_guard_update before update on public.scorepads
  for each row execute function public.scorepads_guard_update();

-- Numer wersji nadaje baza: kolejny w obrębie notesu. Blokada wiersza notesu szereguje
-- równoległe zapisy wersji tego samego notesu.
create function public.scorepad_versions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.scorepads where id = new.scorepad_id for update;
  select coalesce(max(v.version), 0) + 1
    into new.version
    from public.scorepad_versions v
   where v.scorepad_id = new.scorepad_id;
  new.created_at := now();
  return new;
end;
$$;

create trigger scorepad_versions_before_insert before insert on public.scorepad_versions
  for each row execute function public.scorepad_versions_before_insert();

-- Wersje są niezmienne (GAME-9). Edycja notesu = nowa wersja + zmiana current_version_id.
-- Usunąć można tylko wersję, której nie wskazuje żadna partia ani notes (klucze obce).
create function public.scorepad_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'scorepad_versions rows are immutable' using errcode = '23514', constraint = 'scorepad_versions_immutable';
end;
$$;

create trigger scorepad_versions_immutable before update on public.scorepad_versions
  for each row execute function public.scorepad_versions_immutable();

-- ---------------------------------------------------------------------------------------------
-- meetings: prowadzący i zakończenie
-- ---------------------------------------------------------------------------------------------
create function public.meetings_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  host public.profiles;
begin
  if new.host_id is not null
     and (tg_op = 'INSERT' or new.host_id is distinct from old.host_id) then
    select * into host from public.profiles where id = new.host_id;
    -- Brak profilu zgłosi klucz obcy do uczestników; tu sprawdzamy rolę i usunięcie.
    if found and host.role = 'admin' then
      -- Admin prowadzi domyślnie, więc jako prowadzący jest zapisywany jako NULL (PLAN-1).
      raise exception 'meetings.host_id must not be the admin (use NULL)'
        using errcode = '23514', constraint = 'meetings_host_not_admin';
    end if;
    if found and host.deleted_at is not null then
      raise exception 'meetings.host_id must not be a deleted profile'
        using errcode = '23514', constraint = 'meetings_host_not_deleted';
    end if;
  end if;

  -- Partie w toku trzeba dokończyć albo porzucić przed zakończeniem spotkania (RUN-4).
  if tg_op = 'UPDATE' and new.status = 'finished' and old.status is distinct from 'finished'
     and exists (select 1 from public.plays p where p.meeting_id = new.id and p.status = 'draft') then
    raise exception 'meeting has draft plays; save or discard them before finishing'
      using errcode = '23514', constraint = 'meetings_no_drafts_when_finished';
  end if;

  return new;
end;
$$;

create trigger meetings_validate before insert or update on public.meetings
  for each row execute function public.meetings_validate();

-- Usuniętego członka nie można dodać do spotkania (MEM-6).
create function public.meeting_participants_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where id = new.profile_id and deleted_at is not null) then
    raise exception 'deleted profile cannot join a meeting'
      using errcode = '23514', constraint = 'meeting_participants_profile_active';
  end if;
  return new;
end;
$$;

create trigger meeting_participants_validate
  before insert or update of profile_id on public.meeting_participants
  for each row execute function public.meeting_participants_validate();

-- Gra usunięta z kolekcji znika z głosowań i publikacji (GAME-8).
create function public.require_active_game()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.games where id = new.game_id and deleted_at is not null) then
    raise exception 'game % is deleted', new.game_id
      using errcode = '23514', constraint = tg_table_name || '_game_active';
  end if;
  return new;
end;
$$;

create trigger game_votes_require_active_game
  before insert or update of game_id on public.game_votes
  for each row execute function public.require_active_game();
create trigger meeting_games_require_active_game
  before insert or update of game_id on public.meeting_games
  for each row execute function public.require_active_game();

-- ---------------------------------------------------------------------------------------------
-- plays: snapshot w bazie przy rozpoczęciu partii (GAME-9, Q23)
-- ---------------------------------------------------------------------------------------------
create function public.plays_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  meeting_status text;
  game public.games;
  pad public.scorepads;
begin
  -- Szkic powstaje zawsze jako szkic; zapis karteczki to osobny krok (save_play, [029]).
  if new.status <> 'draft' or new.saved_at is not null then
    raise exception 'play must be created as a draft'
      using errcode = '23514', constraint = 'plays_created_as_draft';
  end if;

  -- Blokada współdzielona: spotkanie nie zmieni statusu w trakcie tworzenia szkicu.
  select status into meeting_status from public.meetings where id = new.meeting_id for share;
  if found and meeting_status <> 'in_progress' then
    raise exception 'plays can be started only in an in-progress meeting'
      using errcode = '23514', constraint = 'plays_meeting_in_progress';
  end if;

  select * into game from public.games where id = new.game_id;
  if found and game.deleted_at is not null then
    raise exception 'game % is deleted', new.game_id
      using errcode = '23514', constraint = 'plays_game_active';
  end if;

  select s.* into pad
    from public.scorepad_versions v
    join public.scorepads s on s.id = v.scorepad_id
   where v.id = new.scorepad_version_id;
  if found then
    if pad.game_id <> new.game_id then
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
  end if;

  -- Snapshot punktacji zawsze z bazy, niezależnie od tego, co przysłał klient.
  if game.id is not null then
    new.points_snapshot := game.placement_points;
  end if;
  new.started_at := now();
  return new;
end;
$$;

create trigger plays_before_insert before insert on public.plays
  for each row execute function public.plays_before_insert();

-- Po rozpoczęciu partii jej gra, notes, snapshot i spotkanie są stałe. Zapisana karteczka
-- jest niezmienna (PRD §1.2: bez edycji wpisów); można tylko dopisać ścieżkę obrazu (PAD-6)
-- albo usunąć partię (§5.6.5).
create function public.plays_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.meeting_id is distinct from old.meeting_id
     or new.game_id is distinct from old.game_id
     or new.scorepad_version_id is distinct from old.scorepad_version_id
     or new.points_snapshot is distinct from old.points_snapshot
     or new.started_by is distinct from old.started_by
     or new.started_at is distinct from old.started_at then
    raise exception 'play meeting, game, scorepad version, snapshot and start are immutable'
      using errcode = '23514', constraint = 'plays_snapshot_immutable';
  end if;

  if old.status = 'saved' then
    if new.status <> 'saved'
       or new.saved_at is distinct from old.saved_at
       or new.sheet is distinct from old.sheet
       or (old.sheet_image_path is not null and new.sheet_image_path is distinct from old.sheet_image_path) then
      raise exception 'saved play is immutable'
        using errcode = '23514', constraint = 'plays_saved_immutable';
    end if;
  elsif new.status = 'saved' then
    if not exists (select 1 from public.meetings where id = new.meeting_id and status = 'in_progress') then
      raise exception 'plays can be saved only in an in-progress meeting'
        using errcode = '23514', constraint = 'plays_meeting_in_progress';
    end if;
  end if;

  return new;
end;
$$;

create trigger plays_before_update before update on public.plays
  for each row execute function public.plays_before_update();

-- ---------------------------------------------------------------------------------------------
-- play_results: miejsca w notesie i liczba graczy (PAD-3, EDT-8)
-- ---------------------------------------------------------------------------------------------
create function public.play_results_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  play public.plays;
  slots int;
begin
  -- Przy kaskadowym usunięciu partii jej wiersz jest już niewidoczny: wyniki znikają razem z nią.
  select * into play from public.plays where id = coalesce(new.play_id, old.play_id);
  if not found then
    return coalesce(new, old);
  end if;

  if play.status = 'saved' then
    raise exception 'results of a saved play are immutable'
      using errcode = '23514', constraint = 'play_results_saved_immutable';
  end if;

  if tg_op = 'UPDATE' and (new.play_id is distinct from old.play_id) then
    raise exception 'play_results.play_id is immutable'
      using errcode = '23514', constraint = 'play_results_play_immutable';
  end if;

  if tg_op <> 'DELETE' then
    select v.player_slots into slots from public.scorepad_versions v where v.id = play.scorepad_version_id;
    if new.seat > slots then
      raise exception 'seat % exceeds % player slots of the scorepad', new.seat, slots
        using errcode = '23514', constraint = 'play_results_seat_within_slots';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger play_results_before_write before insert or update or delete on public.play_results
  for each row execute function public.play_results_before_write();

-- Sprawdzane na końcu transakcji, bo graczy dodaje się wierszami. Partia z wynikami ma
-- co najmniej 2 graczy (Q2) i najwyżej tylu, ilu mieści punktacja gry i notes (PAD-3).
-- Zapisana partia ma uzupełnione miejsca, punkty i wygrane wszystkich graczy.
create function public.check_play_players(target_play_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  play public.plays;
  min_players int;
  slots int;
  players int;
  incomplete int;
begin
  select * into play from public.plays where id = target_play_id;
  if not found then
    return;
  end if;

  select count(*), count(*) filter (where r.place is null)
    into players, incomplete
    from public.play_results r
   where r.play_id = target_play_id;

  if players = 0 and play.status = 'draft' then
    -- Szkic tuż po utworzeniu, zanim prowadzący przypisze graczy.
    return;
  end if;

  select g.min_players into min_players from public.games g where g.id = play.game_id;
  select v.player_slots into slots from public.scorepad_versions v where v.id = play.scorepad_version_id;

  if players < greatest(2, min_players) then
    raise exception 'play % has % players, at least % required', target_play_id, players, greatest(2, min_players)
      using errcode = '23514', constraint = 'plays_min_players';
  end if;
  if players > least(cardinality(play.points_snapshot), slots) then
    raise exception 'play % has % players, at most % allowed', target_play_id, players,
      least(cardinality(play.points_snapshot), slots)
      using errcode = '23514', constraint = 'plays_max_players';
  end if;
  if play.status = 'saved' and incomplete > 0 then
    raise exception 'saved play % has results without place', target_play_id
      using errcode = '23514', constraint = 'plays_saved_results_complete';
  end if;
end;
$$;

create function public.play_results_check_players()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.check_play_players(old.play_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.play_id is distinct from old.play_id) then
    perform public.check_play_players(new.play_id);
  end if;
  return null;
end;
$$;

create constraint trigger play_results_check_players
  after insert or update or delete on public.play_results
  deferrable initially deferred
  for each row execute function public.play_results_check_players();

create function public.plays_check_players()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.check_play_players(new.id);
  return null;
end;
$$;

create constraint trigger plays_check_players
  after update of status on public.plays
  deferrable initially deferred
  for each row execute function public.plays_check_players();

-- Funkcje wyzwalaczy i pomocnicze nie są API: odbieramy prawo wykonania rolom klienta.
-- (Wyzwalacze działają niezależnie od uprawnienia EXECUTE.)
revoke execute on function public.check_play_players(uuid) from public, anon, authenticated;
