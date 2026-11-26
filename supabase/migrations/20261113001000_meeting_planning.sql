-- Planowanie spotkań i reguły statusów.
--
-- Zasady:
-- - Zapis spotkania to jedna transakcja `save_meeting(...)`: spotkanie, pełna lista uczestników
--   i prowadzący naraz. Klient nie zostawi spotkania bez uczestników ani z prowadzącym spoza
--   listy. To jedyna droga zapisu spotkania i uczestników z API: `authenticated` traci
--   bezpośredni INSERT/UPDATE na `meetings` i INSERT/DELETE na `meeting_participants`.
-- - Termin przychodzi jako data i godzina w strefie klubu (`club.timezone`) i baza zamienia je
--   na `timestamptz`. Godziny, której nie ma przez zmianę czasu (np. 02:30 w ostatnią
--   niedzielę marca w Europie), funkcja odrzuca zamiast po cichu przesuwać. Godzina podwójna
--   (jesienią) oznacza, jak zawsze w Postgresie, drugie wystąpienie, czyli już czas zimowy.
-- - Co wolno zmienić, zależy od statusu:
--   - zaplanowane: wszystko (tytuł, termin, uczestnicy, prowadzący), także po zamknięciu
--     głosowania; usunięcie uczestnika kasuje jego głosy (kaskada);
--   - w trakcie: tylko dopisanie uczestnika, zmiana prowadzącego i usunięcie uczestnika bez
--     partii (także bez szkicu); tytuł i termin są już historią;
--   - zakończone: nic.
--   Strażnik w wyzwalaczu `meetings_validate` pilnuje tytułu, terminu i prowadzącego także dla
--   service_role.
-- - Rozpoczęcie i zakończenie (`start_meeting`, `finish_meeting`) mogą wywołać admin
--   prowadzący spotkania. Rozpoczęcie zamyka głosowanie. Drugie spotkanie
--   trakcie odrzuca unikalny indeks `meetings_single_in_progress`, także przy
--   równoczesnych startach: druga transakcja czeka na pierwszą i dostaje ten sam błąd.
--   Zakończenie przy szkicach partii odrzuca wyzwalacz `meetings_validate`.
-- - Usunięcie spotkania zostaje zwykłym DELETE z RLS (tylko admin) i kasuje głosy,
--   uczestników i opublikowane gry kaskadą. Spotkania w trakcie nie da się usunąć,
--   a zakończonego z partiami blokuje klucz obcy `plays_meeting_id_fkey`.
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
      -- Admin prowadzi domyślnie, więc jako prowadzący jest zapisywany jako NULL.
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

  -- Dozwolone przejścia: planned → in_progress → finished oraz finished → in_progress
  -- (dogranie zapomnianej partii). Powrotu do planned nie ma.
  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('planned', 'in_progress'), ('in_progress', 'finished'), ('finished', 'in_progress')
     ) then
    raise exception 'meeting status cannot change from % to %', old.status, new.status
      using errcode = '23514', constraint = 'meetings_status_transition', hint = 'meetings_status_transition';
  end if;

  -- Tytuł i termin zmienia się tylko w zaplanowanym spotkaniu.
  if old.status <> 'planned'
     and (new.title is distinct from old.title or new.starts_at is distinct from old.starts_at) then
    raise exception 'meeting % has started; title and date are locked', old.id
      using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
  end if;

  -- Zakończone spotkanie zachowuje prowadzącego w historii.
  if old.status = 'finished' and new.status = 'finished' and new.host_id is distinct from old.host_id then
    raise exception 'meeting % is finished', old.id
      using errcode = '23514', constraint = 'meetings_finished_locked', hint = 'meetings_finished_locked';
  end if;

  -- Partie w toku trzeba dokończyć albo porzucić przed zakończeniem spotkania.
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
-- meetings_guard_delete: spotkania w trakcie nie usuwamy
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
-- meeting_local_start: data i godzina w strefie klubu → timestamptz
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
  'Termin spotkania z daty i godziny w strefie klubu; odrzuca godziny z luki zmiany czasu.';

revoke all on function private.meeting_local_start(date, time, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- save_meeting: spotkanie, uczestnicy i prowadzący w jednej transakcji
-- ---------------------------------------------------------------------------------------------
-- Rdzeń zapisu: spotkanie, uczestnicy i prowadzący. Woła go tylko `public.save_meeting`
-- (security definer), więc sam nie potrzebuje praw właściciela.
-- Nazwa jak w RPC: `save_meeting.<parametr>` w ciele odwołuje się do nazwy funkcji.
create function private.save_meeting(
  meeting_id uuid,
  title text,
  local_date date,
  local_time time,
  participant_ids uuid[],
  host_id uuid,
  is_new boolean default true
)
returns public.meetings
language plpgsql
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
  -- Edycja bez zmiany terminu wysyła NULL-e: termin zostaje, a formularz nie musi znać
  -- aktualnej strefy klubu (mogła się zmienić, a zapisanej chwili to nie przesuwa).
  if save_meeting.is_new or save_meeting.local_date is not null or save_meeting.local_time is not null then
    starts := private.meeting_local_start(save_meeting.local_date, save_meeting.local_time, club_timezone);
  end if;

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

  if not found and not save_meeting.is_new then
    -- Edycja spotkania, które w międzyczasie usunięto: nie wskrzeszamy go.
    raise exception 'meeting % does not exist', save_meeting.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;

  if not found then
    -- Nowe spotkanie: zaplanowane z otwartym głosowaniem (domyślne wartości kolumn).
    -- Ponowienie po błędzie sieci (is_new, a wiersz już jest) idzie ścieżką edycji niżej.
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
    -- W trakcie tytuł i termin są historią. Termin porównujemy z dokładnością
    -- minuty (formularz zna tylko godzinę i minutę), o ile w ogóle przyszedł.
    if btrim(save_meeting.title) is distinct from btrim(current_meeting.title)
       or (starts is not null
           and date_trunc('minute', starts) is distinct from date_trunc('minute', current_meeting.starts_at)) then
      raise exception 'meeting % has started; title and date are locked', current_meeting.id
        using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
    end if;
    -- Uczestnika z partią (także szkicem) nie usuwamy. Zapisane partie blokuje też
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
  -- zostać uczestnik, który w międzyczasie usunął konto.
  insert into public.meeting_participants (meeting_id, profile_id)
  select current_meeting.id, p from unnest(participants) p
   where not exists (
     select 1 from public.meeting_participants mp
      where mp.meeting_id = current_meeting.id and mp.profile_id = p
   );

  -- Tytuł i termin zmieniają się tylko w zaplanowanym (w trakcie są równe, sprawdzone wyżej).
  update public.meetings m
     set title = case when current_meeting.status = 'planned' then btrim(save_meeting.title) else m.title end,
         starts_at = case when current_meeting.status = 'planned' then coalesce(starts, m.starts_at) else m.starts_at end,
         host_id = save_meeting.host_id
   where m.id = current_meeting.id;

  delete from public.meeting_participants mp
   where mp.meeting_id = current_meeting.id and mp.profile_id = any (removed);

  select m.* into saved from public.meetings m where m.id = current_meeting.id;
  return saved;
end;
$$;

comment on function private.save_meeting(uuid, text, date, time, uuid[], uuid, boolean) is
  'Planuje spotkanie (is_new) albo zapisuje zmiany: tytuł, termin w strefie klubu (NULL = bez zmiany), uczestnicy i prowadzący. Tylko admin.';

revoke all on function private.save_meeting(uuid, text, date, time, uuid[], uuid, boolean)
  from public, anon, authenticated;

-- RPC: rdzeń zapisu i głosowanie na termin w tej samej transakcji.
create function public.save_meeting(
  meeting_id uuid,
  title text,
  local_date date,
  local_time time,
  participant_ids uuid[],
  host_id uuid,
  is_new boolean default true,
  date_options jsonb default null,
  date_voting boolean default null
)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.meetings;
  club_timezone text := private.club_timezone();
  wanted timestamptz[];
  current_options timestamptz[];
begin
  perform private.require_admin();

  saved := private.save_meeting(
    save_meeting.meeting_id, save_meeting.title, save_meeting.local_date, save_meeting.local_time,
    save_meeting.participant_ids, save_meeting.host_id, save_meeting.is_new);

  if save_meeting.date_options is not null then
    if jsonb_typeof(save_meeting.date_options) <> 'array' then
      raise exception 'date_options must be an array'
        using errcode = '22023', hint = 'meeting_date_options_invalid';
    end if;
    select coalesce(array_agg(distinct private.meeting_local_start(
             (o ->> 'date')::date, (o ->> 'time')::time, club_timezone)), '{}')
      into wanted
      from jsonb_array_elements(save_meeting.date_options) o;
    select coalesce(array_agg(o.starts_at), '{}') into current_options
      from public.meeting_date_options o where o.meeting_id = saved.id;
    -- Ta sama lista (np. edycja innych pól) niczego nie zmienia.
    if not (wanted @> current_options and current_options @> wanted) then
      if saved.status <> 'planned' then
        raise exception 'meeting % has started; date options are locked', saved.id
          using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
      end if;
      delete from public.meeting_date_options o
       where o.meeting_id = saved.id and not (o.starts_at = any (wanted));
      insert into public.meeting_date_options (meeting_id, starts_at, created_by)
      select saved.id, w, auth.uid() from unnest(wanted) w
      on conflict on constraint meeting_date_options_unique do nothing;
    end if;
  end if;

  if save_meeting.date_voting is not null and save_meeting.date_voting is distinct from saved.date_voting_open then
    if saved.status <> 'planned' then
      raise exception 'meeting % has started; date voting is locked', saved.id
        using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
    end if;
    update public.meetings m
       set date_voting_open = save_meeting.date_voting
     where m.id = saved.id
    returning * into saved;
  end if;
  return saved;
end;
$$;

comment on function public.save_meeting(uuid, text, date, time, uuid[], uuid, boolean, jsonb, boolean) is
  'Planuje spotkanie (is_new) albo zapisuje zmiany: tytuł, termin w strefie klubu (NULL = bez zmiany), uczestnicy, prowadzący, proponowane terminy (NULL = bez zmiany) i głosowanie na termin (NULL = bez zmiany). Tylko admin.';

-- ---------------------------------------------------------------------------------------------
-- start_meeting / finish_meeting: admin albo prowadzący
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
    -- Inne spotkanie trwa: także gdy równoległa transakcja właśnie je rozpoczęła.
    raise exception 'another meeting is in progress'
      using errcode = '23505', constraint = 'meetings_single_in_progress', hint = 'meetings_single_in_progress';
  end;
  return saved;
end;
$$;

comment on function public.start_meeting(uuid) is
  'Rozpoczyna zaplanowane spotkanie i zamyka głosowanie; jedno spotkanie w trakcie. Admin lub prowadzący.';

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

  -- Szkice blokuje wyzwalacz meetings_validate.
  update public.meetings m
     set status = 'finished', finished_at = greatest(now(), m.started_at)
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.finish_meeting(uuid) is
  'Kończy spotkanie w trakcie; szkice partii trzeba wcześniej zapisać albo porzucić. Admin lub prowadzący.';

revoke execute on function
  public.save_meeting(uuid, text, date, time, uuid[], uuid, boolean, jsonb, boolean),
  public.start_meeting(uuid),
  public.finish_meeting(uuid)
from public, anon;
grant execute on function
  public.save_meeting(uuid, text, date, time, uuid[], uuid, boolean, jsonb, boolean),
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

-- ---------------------------------------------------------------------------------------------
-- reopen_meeting: cofnięcie zakończenia
-- ---------------------------------------------------------------------------------------------
-- Tylko admin cofa zakończenie, bez zmiany historii spotkania i partii. Indeks
-- meetings_single_in_progress szereguje także równoległe starty i otwarcia. Podsumowania i serie
-- są liczone z zapisanych partii przy odczycie.
create function public.reopen_meeting(meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  saved public.meetings;
begin
  perform private.require_admin();

  select m.* into current_meeting from public.meetings m
   where m.id = reopen_meeting.meeting_id for update;
  if not found then
    raise exception 'meeting does not exist'
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'finished' then
    raise exception 'meeting is not finished'
      using errcode = '23514', hint = 'meetings_reopen_finished';
  end if;

  begin
    update public.meetings m
       set status = 'in_progress', finished_at = null
     where m.id = current_meeting.id
    returning * into saved;
  exception when unique_violation then
    raise exception 'another meeting is in progress'
      using errcode = '23505', constraint = 'meetings_single_in_progress',
            hint = 'meetings_single_in_progress';
  end;
  return saved;
end;
$$;

comment on function public.reopen_meeting(uuid) is
  'Cofa zakończenie spotkania. Tylko admin; bez usuwania partii, wyników i snapshotów. Jedno spotkanie w trakcie.';

revoke execute on function public.reopen_meeting(uuid) from public, anon;
grant execute on function public.reopen_meeting(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Głosowanie na termin
-- ---------------------------------------------------------------------------------------------
-- Administrator włącza je w formularzu spotkania (`save_meeting`, parametr `date_voting`),
-- a uczestnicy proponują terminy (`propose_meeting_date`, data i godzina w strefie klubu,
-- bez limitu) i głosują na dowolnie wiele z nich (`meeting_date_votes`, jawne jak głosy
-- na gry). Głosowanie jest tylko opinią: termin ustala administrator, wybierając propozycję
-- (`decide_meeting_date`) albo wpisując dowolny termin w formularzu. Zasady:
-- - ten sam termin raz na spotkanie. Uczestnik dodaje propozycję przy otwartym głosowaniu
--   termin (nie w przeszłości) i od razu na nią głosuje. Administrator może też zapisać listę
--   propozycji w formularzu (`date_options`: tablica `{"date", "time"}`, NULL = bez zmiany);
--   propozycja, która zostaje, zachowuje głosy, usunięta kasuje swoje;
-- - głosowanie na termin (`meetings.date_voting_open`) jest niezależne od głosowania na gry
--   i możliwe tylko w zaplanowanym spotkaniu; rozpoczęcie spotkania je zamyka;
-- - `decide_meeting_date` ustawia termin z propozycji i zamyka głosowanie,
--   `reopen_date_voting` otwiera je ponownie. Obie tylko dla administratora, tylko
--   w zaplanowanym spotkaniu;
-- - głos dodaje i usuwa sam uczestnik (RLS), tylko przy otwartym głosowaniu na termin;
--   usunięcie uczestnika kasuje jego głosy i jego propozycje.
revoke all on public.meeting_date_options, public.meeting_date_votes from anon, authenticated;
grant select on public.meeting_date_options, public.meeting_date_votes to authenticated;
grant insert (option_id, meeting_id, profile_id) on public.meeting_date_votes to authenticated;
grant delete on public.meeting_date_votes to authenticated;

create function private.is_date_voting_open(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
return exists (
  select 1 from public.meetings m where m.id = target_meeting_id and m.date_voting_open
);

comment on function private.is_date_voting_open(uuid) is
  'Czy spotkanie ma otwarte głosowanie na termin (polityki meeting_date_votes).';
revoke all on function private.is_date_voting_open(uuid) from public, anon;
grant execute on function private.is_date_voting_open(uuid) to authenticated;

create policy meeting_date_options_select on public.meeting_date_options for select to authenticated
  using ((select private.is_active_member()));

create policy meeting_date_votes_select on public.meeting_date_votes for select to authenticated
  using ((select private.is_active_member()));
create policy meeting_date_votes_insert_own on public.meeting_date_votes for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select private.is_active_member())
    and private.is_date_voting_open(meeting_id)
  );
create policy meeting_date_votes_delete_own on public.meeting_date_votes for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and (select private.is_active_member())
    and private.is_date_voting_open(meeting_id)
  );

-- Jak głosy na gry: blokada współdzielona spotkania czeka na równoległe zamknięcie głosowania.
create function public.meeting_date_votes_require_open_voting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(
    (select m.date_voting_open from public.meetings m where m.id = new.meeting_id for share), false
  ) then
    raise exception 'date voting is closed in meeting %', new.meeting_id
      using errcode = '23514', constraint = 'meeting_date_votes_voting_open',
            hint = 'meeting_date_voting_closed';
  end if;
  return new;
end;
$$;

create trigger meeting_date_votes_require_open_voting
  before insert or update on public.meeting_date_votes
  for each row execute function public.meeting_date_votes_require_open_voting();

revoke execute on function public.meeting_date_votes_require_open_voting() from public, anon, authenticated;

-- Rozpoczęcie spotkania zamyka głosowanie na termin (jak głosowanie na gry).
create function public.meetings_close_date_voting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'planned' then
    new.date_voting_open := false;
  end if;
  return new;
end;
$$;

create trigger meetings_close_date_voting
  before update of status on public.meetings
  for each row execute function public.meetings_close_date_voting();

revoke execute on function public.meetings_close_date_voting() from public, anon, authenticated;

-- Usunięcie uczestnika kasuje jego propozycje (jak jego głosy). Propozycje administratora,
-- który nie jest uczestnikiem, zostają.
create function public.meeting_participants_drop_date_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.meeting_date_options o
   where o.meeting_id = old.meeting_id and o.created_by = old.profile_id;
  return old;
end;
$$;

create trigger meeting_participants_drop_date_options
  after delete on public.meeting_participants
  for each row execute function public.meeting_participants_drop_date_options();

revoke execute on function public.meeting_participants_drop_date_options() from public, anon, authenticated;

-- Propozycja terminu od uczestnika (albo administratora) z głosem proponującego.
create function public.propose_meeting_date(meeting_id uuid, local_date date, local_time time)
returns public.meeting_date_options
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  participant boolean;
  starts timestamptz;
  option public.meeting_date_options;
begin
  perform private.require_active_member();

  select m.* into current_meeting from public.meetings m
   where m.id = propose_meeting_date.meeting_id for share;
  if not found then
    raise exception 'meeting % does not exist', propose_meeting_date.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  participant := exists (
    select 1 from public.meeting_participants mp
     where mp.meeting_id = current_meeting.id and mp.profile_id = auth.uid()
  );
  if not participant and not private.is_admin() then
    raise exception 'only participants propose dates'
      using errcode = '42501', hint = 'meeting_date_not_participant';
  end if;
  if not current_meeting.date_voting_open then
    raise exception 'date voting is closed in meeting %', current_meeting.id
      using errcode = '23514', constraint = 'meeting_date_votes_voting_open',
            hint = 'meeting_date_voting_closed';
  end if;
  starts := private.meeting_local_start(
    propose_meeting_date.local_date, propose_meeting_date.local_time, private.club_timezone());
  if starts < now() then
    raise exception 'proposed date % is in the past', starts
      using errcode = '23514', constraint = 'meeting_date_options_future', hint = 'meeting_date_option_past';
  end if;

  insert into public.meeting_date_options (meeting_id, starts_at, created_by)
  values (current_meeting.id, starts, auth.uid())
  on conflict on constraint meeting_date_options_unique do nothing;
  select o.* into option from public.meeting_date_options o
   where o.meeting_id = current_meeting.id and o.starts_at = starts;

  -- Proponujący głosuje na swój termin (administrator spoza uczestników nie głosuje).
  if participant then
    insert into public.meeting_date_votes (option_id, meeting_id, profile_id)
    values (option.id, current_meeting.id, auth.uid())
    on conflict do nothing;
  end if;
  return option;
end;
$$;

comment on function public.propose_meeting_date(uuid, date, time) is
  'Dodaje proponowany termin spotkania (data i godzina w strefie klubu; uczestnik albo admin, przy otwartym głosowaniu na termin, nie w przeszłości) z głosem proponującego; ten sam termin się nie powtarza.';

create function public.decide_meeting_date(meeting_id uuid, option_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  option_start timestamptz;
  saved public.meetings;
begin
  perform private.require_admin();

  select m.* into current_meeting from public.meetings m
   where m.id = decide_meeting_date.meeting_id for update;
  if not found then
    raise exception 'meeting % does not exist', decide_meeting_date.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'planned' then
    raise exception 'meeting % has started; title and date are locked', current_meeting.id
      using errcode = '23514', constraint = 'meetings_schedule_locked', hint = 'meetings_schedule_locked';
  end if;

  select o.starts_at into option_start from public.meeting_date_options o
   where o.id = decide_meeting_date.option_id and o.meeting_id = current_meeting.id;
  if not found then
    raise exception 'date option % does not belong to meeting %', decide_meeting_date.option_id, current_meeting.id
      using errcode = 'P0002', hint = 'meeting_date_option_not_found';
  end if;

  update public.meetings m
     set starts_at = option_start, date_voting_open = false
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.decide_meeting_date(uuid, uuid) is
  'Ustala termin zaplanowanego spotkania z propozycji i zamyka głosowanie na termin. Głosy są tylko opinią. Tylko admin.';

create function public.reopen_date_voting(meeting_id uuid)
returns public.meetings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_meeting public.meetings;
  saved public.meetings;
begin
  perform private.require_admin();

  select m.* into current_meeting from public.meetings m
   where m.id = reopen_date_voting.meeting_id for update;
  if not found then
    raise exception 'meeting % does not exist', reopen_date_voting.meeting_id
      using errcode = 'P0002', hint = 'meetings_not_found';
  end if;
  if current_meeting.status <> 'planned' then
    raise exception 'meeting % has started; date voting cannot be reopened', current_meeting.id
      using errcode = '23514', constraint = 'meetings_reopen_planned', hint = 'meetings_reopen_planned';
  end if;

  update public.meetings m
     set date_voting_open = true
   where m.id = current_meeting.id
  returning * into saved;
  return saved;
end;
$$;

comment on function public.reopen_date_voting(uuid) is
  'Otwiera ponownie głosowanie na termin w zaplanowanym spotkaniu. Tylko admin.';

revoke execute on function
  public.propose_meeting_date(uuid, date, time),
  public.decide_meeting_date(uuid, uuid),
  public.reopen_date_voting(uuid)
from public, anon;
grant execute on function
  public.propose_meeting_date(uuid, date, time),
  public.decide_meeting_date(uuid, uuid),
  public.reopen_date_voting(uuid)
to authenticated;
