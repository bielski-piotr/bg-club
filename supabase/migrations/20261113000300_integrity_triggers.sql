-- Wyzwalacze spójności danych.
--
-- Tu są reguły, których nie da się zapisać jako CHECK albo klucz obcy, bo dotyczą innych
-- wierszy: niezmienność, snapshoty w bazie, miękko usunięte encje,
-- przejścia statusów spotkania, liczba graczy partii. Uprawnienia (kto może pisać)
-- są w zadaniu.
--
-- Strażnicy, którzy czytają inne tabele, są SECURITY DEFINER (właściciel tabel omija RLS):
-- polityki RLS nie mogą ukryć im wierszy, przez co reguła cicho by nie zadziałała,
-- a klient nie potrzebuje praw do funkcji pomocniczych. Wszystkie mają pusty search_path.
-- Prawo EXECUTE do tych funkcji jest odebrane rolom klienta (wyzwalacz go nie potrzebuje).
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
-- club: strefa czasowa IANA
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
-- profiles: niezmienny id i hook
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

-- Skutki usunięcia członka, niezależnie od tego, czy usunął go admin, czy sam
-- usunął konto: znika z zaplanowanych spotkań (razem z głosami, kaskada), a prowadzenie
-- wszystkich niezakończonych spotkań, które prowadził, wraca do admina. W spotkaniu w trakcie
-- jego uczestnictwo i szkice zostają. Zakończone spotkania zachowują prowadzącego.
create function public.profiles_after_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetings
     set host_id = null
   where host_id = new.id
     and status <> 'finished';

  delete from public.meeting_participants mp
   using public.meetings m
   where m.id = mp.meeting_id
     and m.status = 'planned'
     and mp.profile_id = new.id;

  return null;
end;
$$;

create trigger profiles_after_soft_delete
  after update of deleted_at on public.profiles
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.profiles_after_soft_delete();

-- Usunięcie konta Auth nie usuwa profilu, tylko oznacza go jako usunięty.
-- Profil administratora łamie wtedy CHECK profiles_admin_not_deleted, więc konta admina nie da
-- się usunąć także bezpośrednio w Auth.
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

create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_auth_user_deleted();

-- ---------------------------------------------------------------------------------------------
-- scorepads i scorepad_versions
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
-- równoległe zapisy wersji tego samego notesu. Wersji nie da się usunąć, więc numer nigdy
-- nie zostanie użyty ponownie.
create function public.scorepad_versions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.scorepads where id = new.scorepad_id for update;
  if not found then
    raise exception 'scorepad % does not exist', new.scorepad_id
      using errcode = '23503', constraint = 'scorepad_versions_scorepad_id_fkey';
  end if;
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

-- Wersje są niezmienne i trwałe: bez zmian i bez usuwania. Edycja notesu = nowa
-- wersja + zmiana current_version_id; notes usuwa się miękko (scorepads.deleted_at).
create function public.scorepad_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'scorepad_versions rows are immutable' using errcode = '23514', constraint = 'scorepad_versions_immutable';
end;
$$;

create trigger scorepad_versions_immutable before update or delete on public.scorepad_versions
  for each row execute function public.scorepad_versions_immutable();

-- ---------------------------------------------------------------------------------------------
-- Wspólny strażnik: gra usunięta z kolekcji znika z głosowań, publikacji i nowych partii
-- ---------------------------------------------------------------------------------------------
create function public.require_active_game()
returns trigger
language plpgsql
security definer
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
create trigger plays_require_active_game
  before insert on public.plays
  for each row execute function public.require_active_game();

-- ---------------------------------------------------------------------------------------------
-- meetings: przejścia statusów, prowadzący, zakończenie
-- ---------------------------------------------------------------------------------------------
create function public.meetings_validate()
returns trigger
language plpgsql
security definer
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
      -- Admin prowadzi domyślnie, więc jako prowadzący jest zapisywany jako NULL.
      raise exception 'meetings.host_id must not be the admin (use NULL)'
        using errcode = '23514', constraint = 'meetings_host_not_admin';
    end if;
    if found and host.deleted_at is not null then
      raise exception 'meetings.host_id must not be a deleted profile'
        using errcode = '23514', constraint = 'meetings_host_not_deleted';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'planned' then
      raise exception 'meeting must be created as planned'
        using errcode = '23514', constraint = 'meetings_created_as_planned';
    end if;
    return new;
  end if;

  -- Dozwolone przejścia: planned → in_progress → finished oraz finished → in_progress
  -- (dogranie zapomnianej partii). Powrotu do planned nie ma.
  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('planned', 'in_progress'), ('in_progress', 'finished'), ('finished', 'in_progress')
     ) then
    raise exception 'meeting status cannot change from % to %', old.status, new.status
      using errcode = '23514', constraint = 'meetings_status_transition';
  end if;

  -- Partie w toku trzeba dokończyć albo porzucić przed zakończeniem spotkania.
  if new.status = 'finished' and old.status <> 'finished'
     and exists (select 1 from public.plays p where p.meeting_id = new.id and p.status = 'draft') then
    raise exception 'meeting has draft plays; save or discard them before finishing'
      using errcode = '23514', constraint = 'meetings_no_drafts_when_finished';
  end if;

  return new;
end;
$$;

create trigger meetings_validate before insert or update on public.meetings
  for each row execute function public.meetings_validate();

-- Usuniętego członka nie można dodać do spotkania.
create function public.meeting_participants_validate()
returns trigger
language plpgsql
security definer
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

-- ---------------------------------------------------------------------------------------------
-- plays: snapshot w bazie przy rozpoczęciu partii
-- ---------------------------------------------------------------------------------------------
create function public.plays_before_insert()
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
  -- Szkic powstaje zawsze jako szkic; zapis karteczki to osobny krok (save_play).
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
        where g.id = e.id and g.base_game_id = new.game_id and g.deleted_at is null and g.available
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

create trigger plays_before_insert before insert on public.plays
  for each row execute function public.plays_before_insert();

-- Po rozpoczęciu partii jej gra, notes, snapshot i spotkanie są stałe. Zapisana karteczka
-- jest niezmienna (bez edycji wpisów); można tylko dopisać ścieżkę obrazu
-- albo usunąć partię. Czas zapisu (klucz kolejności partii) nadaje baza.
create function public.plays_before_update()
returns trigger
language plpgsql
security definer
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
    new.saved_at := now();
  else
    new.saved_at := null;
  end if;

  return new;
end;
$$;

create trigger plays_before_update before update on public.plays
  for each row execute function public.plays_before_update();

-- ---------------------------------------------------------------------------------------------
-- play_results: miejsca w notesie i liczba graczy
-- ---------------------------------------------------------------------------------------------
create function public.play_results_before_write()
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

create trigger play_results_before_write before insert or update or delete on public.play_results
  for each row execute function public.play_results_before_write();

-- Sprawdzane na końcu transakcji, bo graczy dodaje się wierszami.
-- - Szkic: najwyżej tylu graczy, ilu mieści snapshot punktacji gry i notes;
--   skład szkicu można zmieniać w osobnych żądaniach, także przez stan z 0 lub 1 graczem.
-- - Zapisana partia: dodatkowo co najmniej 2 graczy i uzupełnione wyniki wszystkich.
-- Min. liczbę graczy gry sprawdza wybór graczy przy rozpoczęciu partii ; baza nie
-- porównuje z bieżącym games.min_players, bo edycja gry nie może zmieniać rozpoczętej partii,
-- a snapshotem jest tylko punktacja (jej długość = max graczy).
create function public.check_play_players(target_play_id uuid)
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

create function public.play_results_check_players()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_play_players(coalesce(new.play_id, old.play_id));
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
security definer
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

-- ---------------------------------------------------------------------------------------------
-- Funkcje z tej migracji nie są API. Supabase domyślnie nadaje EXECUTE rolom anon
-- authenticated, więc odbieramy je jawnie (wyzwalacze działają bez tego uprawnienia).
-- ---------------------------------------------------------------------------------------------
revoke execute on function
  public.club_validate(),
  public.profiles_guard_update(),
  public.profiles_after_soft_delete(),
  public.handle_auth_user_deleted(),
  public.scorepads_guard_update(),
  public.scorepad_versions_before_insert(),
  public.scorepad_versions_immutable(),
  public.require_active_game(),
  public.meetings_validate(),
  public.meeting_participants_validate(),
  public.plays_before_insert(),
  public.plays_before_update(),
  public.play_results_before_write(),
  public.check_play_players(uuid),
  public.play_results_check_players(),
  public.plays_check_players()
from public, anon, authenticated;
