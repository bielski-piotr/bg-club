-- [023] Planowanie spotkań i reguły statusów (PRD PLAN-1…PLAN-5, MTG-2, RUN-1, RUN-4, §2.1,
-- §6, NFR-10).
--
-- Zasady:
-- - Zapis spotkania to jedna transakcja `save_meeting(...)`: spotkanie, pełna lista uczestników
--   i prowadzący naraz. Klient nie zostawi spotkania bez uczestników ani z prowadzącym spoza
--   listy. To jedyna droga zapisu spotkania i uczestników z API: `authenticated` traci
--   bezpośredni INSERT/UPDATE na `meetings` i INSERT/DELETE na `meeting_participants`.
-- - Termin przychodzi jako data i godzina w strefie klubu (`club.timezone`) i baza zamienia je
--   na `timestamptz` (NFR-10). Godziny, której nie ma przez zmianę czasu (np. 02:30 w ostatnią
--   niedzielę marca w Europie), funkcja odrzuca zamiast po cichu przesuwać. Godzina podwójna
--   (jesienią) oznacza, jak zawsze w Postgresie, drugie wystąpienie, czyli już czas zimowy.
-- - Co wolno zmienić, zależy od statusu (PLAN-3, PLAN-4):
--   - zaplanowane: wszystko (tytuł, termin, uczestnicy, prowadzący), także po zamknięciu
--     głosowania; usunięcie uczestnika kasuje jego głosy (kaskada);
--   - w trakcie: tylko dopisanie uczestnika, zmiana prowadzącego i usunięcie uczestnika bez
--     partii (także bez szkicu); tytuł i termin są już historią;
--   - zakończone: nic.
--   Strażnik w wyzwalaczu `meetings_validate` pilnuje tytułu, terminu i prowadzącego także dla
--   service_role.
-- - Rozpoczęcie i zakończenie (`start_meeting`, `finish_meeting`) mogą wywołać admin i
--   prowadzący spotkania (§2.1). Rozpoczęcie zamyka głosowanie (RUN-1). Drugie spotkanie w
--   trakcie odrzuca unikalny indeks `meetings_single_in_progress` (MTG-2), także przy
--   równoczesnych startach: druga transakcja czeka na pierwszą i dostaje ten sam błąd.
--   Zakończenie przy szkicach partii odrzuca wyzwalacz `meetings_validate` (RUN-4).
-- - Usunięcie spotkania zostaje zwykłym DELETE z RLS (tylko admin) i kasuje głosy,
--   uczestników i opublikowane gry kaskadą (PLAN-3). Spotkania w trakcie nie da się usunąć,
--   a zakończonego z partiami blokuje klucz obcy `plays_meeting_id_fkey` (PLAN-5, Q4).
-- - Błędy reguł mają SQLSTATE 23514 (albo 23505 dla drugiego spotkania w trakcie) i nazwę
--   reguły w polu HINT, które PostgREST przekazuje klientowi; SPA zamienia ją na polski
--   komunikat (`apps/web/src/meetings/meetings.ts`).

-- ---------------------------------------------------------------------------------------------
-- meetings_validate: termin i tytuł tylko w zaplanowanym, zakończone niezmienne
-- ---------------------------------------------------------------------------------------------
create or replace function public.meetings_validate()
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
      -- Admin prowadzi domyślnie, więc jako prowadzący jest zapisywany jako NULL (PLAN-1).
      raise exception 'meetings.host_id must not be the admin (use NULL)'
        using errcode = '23514', constraint = 'meetings_host_not_admin', hint = 'meetings_host_not_admin';
    end if;
    if found and host.deleted_at is not null then
      raise exception 'meetings.host_id must not be a deleted profile'
        using errcode = '23514', constraint = 'meetings_host_not_deleted', hint = 'meetings_host_not_deleted';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'planned' then
      raise exception 'meeting must be created as planned'
        using errcode = '23514', constraint = 'meetings_created_as_planned';
    end if;
    return new;
  end if;

  -- Dozwolone przejścia (§5.8): planned → in_progress → finished oraz finished → in_progress
  -- (RUN-5, dogranie zapomnianej partii). Powrotu do planned nie ma.
  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('planned', 'in_progress'), ('in_progress', 'finished'), ('finished', 'in_progress')
     ) then
    raise exception 'meeting status cannot change from % to %', old.status, new.status
      using errcode = '23514', constraint = 'meetings_status_transition', hint = 'meetings_status_transition';
  end if;

  -- Tytuł i termin zmienia się tylko w zaplanowanym spotkaniu (PLAN-3, PLAN-4).
  if old.status <> 'planned'
     and (new.title is distinct from old.title or new.starts_at is distinct from old.starts_at) then
    raise exception 'meeting % has started; title and date are locked', old.id
      using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
  end if;

  -- Zakończone spotkanie zachowuje prowadzącego w historii (MEM-6).
  if old.status = 'finished' and new.status = 'finished' and new.host_id is distinct from old.host_id then
    raise exception 'meeting % is finished', old.id
      using errcode = '23514', constraint = 'meetings_finished_locked', hint = 'meetings_finished_locked';
  end if;

  -- Partie w toku trzeba dokończyć albo porzucić przed zakończeniem spotkania (RUN-4).
  if new.status = 'finished' and old.status <> 'finished'
     and exists (select 1 from public.plays p where p.meeting_id = new.id and p.status = 'draft') then
    raise exception 'meeting has draft plays; save or discard them before finishing'
      using errcode = '23514', constraint = 'meetings_no_drafts_when_finished',
            hint = 'meetings_no_drafts_when_finished';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- meetings_guard_delete: spotkania w trakcie nie usuwamy (PLAN-3, PLAN-5)
-- ---------------------------------------------------------------------------------------------
create function public.meetings_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'in_progress' then
    raise exception 'meeting % is in progress; finish it before deleting', old.id
      using errcode = '23514', constraint = 'meetings_delete_in_progress', hint = 'meetings_delete_in_progress';
  end if;
  return old;
end;
$$;

create trigger meetings_guard_delete before delete on public.meetings
  for each row execute function public.meetings_guard_delete();

revoke execute on function public.meetings_guard_delete() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- meeting_local_start: data i godzina w strefie klubu → timestamptz (NFR-10)
-- ---------------------------------------------------------------------------------------------
create function private.meeting_local_start(local_date date, local_time time, timezone text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  result timestamptz;
begin
  if local_date is null or local_time is null then
    raise exception 'meeting date and time are required'
      using errcode = '23502', constraint = 'meetings_starts_at_required', hint = 'meetings_starts_at_required';
  end if;
  result := (local_date + local_time) at time zone timezone;
  -- Godzina z luki zmiany czasu wraca jako inna godzina lokalna (np. 02:30 → 03:30).
  if (result at time zone timezone) is distinct from (local_date + local_time) then
    raise exception 'local time % % does not exist in time zone %', local_date, local_time, timezone
      using errcode = '23514', constraint = 'meetings_local_time_exists', hint = 'meetings_local_time_exists';
  end if;
  return result;
end;
$$;

comment on function private.meeting_local_start(date, time, text) is
  'Termin spotkania z daty i godziny w strefie klubu; odrzuca godziny z luki zmiany czasu (NFR-10).';

revoke all on function private.meeting_local_start(date, time, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- save_meeting: spotkanie, uczestnicy i prowadzący w jednej transakcji (PLAN-1…PLAN-4)
-- ---------------------------------------------------------------------------------------------
create function public.save_meeting(
  meeting_id uuid,
  title text,
  local_date date,
  local_time time,
  participant_ids uuid[],
  host_id uuid
)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  club_timezone text;
  starts timestamptz;
  current_meeting public.meetings;
  saved public.meetings;
  participants uuid[];
  removed uuid[];
begin
  perform private.require_admin();

  select c.timezone into club_timezone from public.club c where c.id = 1;
  if not found then
    raise exception 'club is not set up'
      using errcode = '23514', constraint = 'meetings_club_required', hint = 'meetings_club_required';
  end if;
  starts := private.meeting_local_start(save_meeting.local_date, save_meeting.local_time, club_timezone);

  -- Bez duplikatów i NULL-i; kolejność nie ma znaczenia.
  select coalesce(array_agg(distinct p) filter (where p is not null), '{}')
    into participants
    from unnest(coalesce(save_meeting.participant_ids, '{}')) p;
  if cardinality(participants) = 0 then
    raise exception 'meeting needs at least one participant'
      using errcode = '23514', constraint = 'meetings_participants_required', hint = 'meetings_participants_required';
  end if;
  if save_meeting.host_id is not null and not (save_meeting.host_id = any (participants)) then
    raise exception 'meeting host must be a participant'
      using errcode = '23514', constraint = 'meetings_host_participant', hint = 'meetings_host_participant';
  end if;

  select m.* into current_meeting from public.meetings m where m.id = save_meeting.meeting_id for update;

  if not found then
    -- Nowe spotkanie: zaplanowane z otwartym głosowaniem (PLAN-2, domyślne wartości kolumn).
    -- Prowadzący po uczestnikach, więc kolejność działa także przy SET CONSTRAINTS IMMEDIATE.
    insert into public.meetings (id, title, starts_at, created_by)
    values (save_meeting.meeting_id, btrim(save_meeting.title), starts, auth.uid())
    returning * into saved;
    insert into public.meeting_participants (meeting_id, profile_id)
    select saved.id, p from unnest(participants) p;
    if save_meeting.host_id is not null then
      update public.meetings m set host_id = save_meeting.host_id where m.id = saved.id
      returning * into saved;
    end if;
    return saved;
  end if;

  if current_meeting.status = 'finished' then
    raise exception 'meeting % is finished', current_meeting.id
      using errcode = '23514', constraint = 'meetings_finished_locked', hint = 'meetings_finished_locked';
  end if;

  select coalesce(array_agg(mp.profile_id), '{}') into removed
    from public.meeting_participants mp
   where mp.meeting_id = current_meeting.id
     and not (mp.profile_id = any (participants));

  if current_meeting.status = 'in_progress' then
    -- W trakcie tytuł i termin są historią (PLAN-4); porównanie z dokładnością do minuty,
    -- bo formularz zna tylko godzinę i minutę.
    if btrim(save_meeting.title) is distinct from current_meeting.title
       or date_trunc('minute', starts) is distinct from date_trunc('minute', current_meeting.starts_at) then
      raise exception 'meeting % has started; title and date are locked', current_meeting.id
        using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
    end if;
    -- Uczestnika z partią (także szkicem) nie usuwamy (PLAN-4). Zapisane partie blokuje też
    -- klucz obcy play_results → meeting_participants.
    if exists (
      select 1 from public.play_results r
       where r.meeting_id = current_meeting.id and r.profile_id = any (removed)
    ) then
      raise exception 'participant with a play cannot be removed'
        using errcode = '23514', constraint = 'meetings_participant_has_play', hint = 'meetings_participant_has_play';
    end if;
  end if;

  -- Kolejność: nowi uczestnicy, prowadzący, usunięcia. Prowadzący jest wtedy zawsze na liście
  -- (klucz obcy także bez odroczenia), a usunięcie starego prowadzącego nie wyzeruje nowego
  -- (on delete set null dotyczy tylko wiersza ze starym host_id).
  -- Tylko nowi: wyzwalacz uczestników działa przed ON CONFLICT, a w trwającym spotkaniu może
  -- zostać uczestnik, który w międzyczasie usunął konto (MEM-6).
  insert into public.meeting_participants (meeting_id, profile_id)
  select current_meeting.id, p from unnest(participants) p
   where not exists (
     select 1 from public.meeting_participants mp
      where mp.meeting_id = current_meeting.id and mp.profile_id = p
   );

  update public.meetings m
     set title = case when current_meeting.status = 'planned' then btrim(save_meeting.title) else m.title end,
         starts_at = case when current_meeting.status = 'planned' then starts else m.starts_at end,
         host_id = save_meeting.host_id
   where m.id = current_meeting.id;

  delete from public.meeting_participants mp
   where mp.meeting_id = current_meeting.id and mp.profile_id = any (removed);

  select m.* into saved from public.meetings m where m.id = current_meeting.id;
  return saved;
end;
$$;

comment on function public.save_meeting(uuid, text, date, time, uuid[], uuid) is
  'Planuje spotkanie albo zapisuje zmiany: tytuł, termin w strefie klubu, uczestnicy i prowadzący (PLAN-1…PLAN-4). Tylko admin.';

-- ---------------------------------------------------------------------------------------------
-- start_meeting / finish_meeting: admin albo prowadzący (RUN-1, RUN-4, MTG-2)
-- ---------------------------------------------------------------------------------------------
create function public.start_meeting(meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  saved public.meetings;
begin
  perform private.require_meeting_runner(start_meeting.meeting_id);

  select m.* into current_meeting from public.meetings m where m.id = start_meeting.meeting_id for update;
  if current_meeting.status <> 'planned' then
    raise exception 'meeting % is not planned', current_meeting.id
      using errcode = '23514', constraint = 'meetings_start_planned', hint = 'meetings_start_planned';
  end if;

  begin
    update public.meetings m
       set status = 'in_progress', voting_open = false, started_at = now()
     where m.id = current_meeting.id
    returning * into saved;
  exception when unique_violation then
    -- Inne spotkanie trwa (MTG-2): także gdy równoległa transakcja właśnie je rozpoczęła.
    raise exception 'another meeting is in progress'
      using errcode = '23505', constraint = 'meetings_single_in_progress', hint = 'meetings_single_in_progress';
  end;
  return saved;
end;
$$;

comment on function public.start_meeting(uuid) is
  'Rozpoczyna zaplanowane spotkanie i zamyka głosowanie (RUN-1); jedno spotkanie w trakcie (MTG-2). Admin lub prowadzący.';

create function public.finish_meeting(meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  saved public.meetings;
begin
  perform private.require_meeting_runner(finish_meeting.meeting_id);

  select m.* into current_meeting from public.meetings m where m.id = finish_meeting.meeting_id for update;
  if current_meeting.status <> 'in_progress' then
    raise exception 'meeting % is not in progress', current_meeting.id
      using errcode = '23514', constraint = 'meetings_finish_in_progress', hint = 'meetings_finish_in_progress';
  end if;

  -- Szkice blokuje wyzwalacz meetings_validate (RUN-4).
  update public.meetings m
     set status = 'finished', finished_at = greatest(now(), m.started_at)
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.finish_meeting(uuid) is
  'Kończy spotkanie w trakcie; szkice partii trzeba wcześniej zapisać albo porzucić (RUN-4). Admin lub prowadzący.';

revoke execute on function
  public.save_meeting(uuid, text, date, time, uuid[], uuid),
  public.start_meeting(uuid),
  public.finish_meeting(uuid)
from public, anon;
grant execute on function
  public.save_meeting(uuid, text, date, time, uuid[], uuid),
  public.start_meeting(uuid),
  public.finish_meeting(uuid)
to authenticated;

-- Spotkania i uczestników zapisuje tylko save_meeting (sprawdzenia wyżej), status zmieniają
-- start_meeting i finish_meeting. Usunięcie spotkania zostaje (RLS: admin).
revoke insert, update on public.meetings from authenticated;
revoke insert, delete on public.meeting_participants from authenticated;
drop policy meetings_insert_admin on public.meetings;
drop policy meetings_update_admin on public.meetings;
drop policy meeting_participants_insert_admin on public.meeting_participants;
drop policy meeting_participants_delete_admin on public.meeting_participants;
