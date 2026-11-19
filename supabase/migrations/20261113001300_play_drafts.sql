-- Trwałe szkice i wznawianie partii.
--
-- Zasady:
-- - Szkic partii to wiersz `plays` w statusie `draft` (`start_play`). Wpisy kartki
--   (`plays.sheet`, format `sheet` pliku notesu v2) zapisuje `save_play_draft(play_id, sheet,
--   base_version)`: notes wysyła je z opóźnieniem 1–2 s, a aplikacja trzyma kopię także
--   w `localStorage` (odświeżenie, awaria, utrata sieci).
-- - Numer wersji szkicu (`plays.draft_version`) rośnie o 1 przy każdym zapisie. Zapis podaje
--   wersję, od której zaczął (`base_version`); inna wersja w bazie oznacza starszy albo
--   konkurencyjny zapis (drugie urządzenie, druga karta). Funkcja odrzuca go wtedy błędem
--   `plays_draft_conflict` (SQLSTATE PT409: PostgREST odpowiada 409; nie 40001, który
--   sterowniki ponawiają same), a aplikacja pokazuje konflikt zamiast cicho
--   nadpisać wpisy. Świadome nadpisanie to zapis z bieżącą wersją z bazy.
-- - Szkic może dokończyć admin albo prowadzący na innym urządzeniu: wczytuje wpisy
--   z bazy, bez synchronizacji na żywo. Uprawnienia jak przy rozpoczęciu partii
--   (`private.require_meeting_runner`), zapis tylko w spotkaniu w trakcie.
-- - `discard_play(play_id)` porzuca partię w toku: usuwa szkic razem z graczami.
--   Szkice nie liczą się do statystyk, więc nie ma czego przeliczać. Zapisanej partii ta
--   funkcja nie usunie.
-- - Błędy reguł mają SQLSTATE 23514 (brak partii: P0002, konflikt: PT409) i nazwę reguły
--   w HINT, jak we wcześniejszych migracjach.

alter table public.plays
  add column draft_version int not null default 0
    constraint plays_draft_version_check check (draft_version >= 0),
  add column draft_saved_at timestamptz,
  add column draft_saved_by uuid references public.profiles (id);

create index plays_draft_saved_by_idx on public.plays (draft_saved_by);

comment on column public.plays.draft_version is
  'Wersja szkicu kartki: 0 po rozpoczęciu partii, +1 przy każdym zapisie save_play_draft.';
comment on column public.plays.draft_saved_at is 'Czas ostatniego zapisu szkicu kartki.';
comment on column public.plays.draft_saved_by is 'Kto ostatnio zapisał szkic kartki.';

-- Największy szkic kartki (tekst JSON). Kartka z dziesiątkami graczy i kategorii ma kilka KB;
-- limit chroni bazę przed przypadkowo ogromnym żądaniem.
create function private.play_draft_max_bytes()
returns int
language sql
immutable
set search_path = ''
return 262144;

revoke execute on function private.play_draft_max_bytes() from public, anon, authenticated;

-- Strażnik zmian partii z polami szkicu: w zapisanej partii są niezmienne (jak kartka),
-- a wersja szkicu nie maleje. Jedna funkcja pilnuje niezmienności całej partii.
create or replace function public.plays_before_update()
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

  if new.draft_version < old.draft_version then
    raise exception 'draft version cannot decrease'
      using errcode = '23514', constraint = 'plays_draft_version_monotonic';
  end if;

  if old.status = 'saved' then
    if new.status <> 'saved'
       or new.saved_at is distinct from old.saved_at
       or new.sheet is distinct from old.sheet
       or new.draft_version is distinct from old.draft_version
       or new.draft_saved_at is distinct from old.draft_saved_at
       or new.draft_saved_by is distinct from old.draft_saved_by
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

-- Spotkanie partii; brak partii to błąd P0002 (`plays_not_found`). Wywołują ją RPC
-- security definer przed strażnikiem roli, więc czyta `plays` z prawami właściciela (partie
-- i tak widzi każdy aktywny członek, RLS `plays_select`).
create function private.play_meeting(target_play_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  found_meeting uuid;
begin
  select p.meeting_id into found_meeting from public.plays p where p.id = target_play_id;
  if found_meeting is null then
    raise exception 'play % does not exist', target_play_id
      using errcode = 'P0002', hint = 'plays_not_found';
  end if;
  return found_meeting;
end;
$$;

revoke execute on function private.play_meeting(uuid) from public, anon, authenticated;

create function public.save_play_draft(play_id uuid, sheet jsonb, base_version int)
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
begin
  play_meeting_id := private.play_meeting(save_play_draft.play_id);
  perform private.require_meeting_runner(play_meeting_id);

  -- Blokada współdzielona: zakończenie spotkania czeka na zapis szkicu.
  select m.status into meeting_status from public.meetings m where m.id = play_meeting_id for share;
  if meeting_status is distinct from 'in_progress' then
    raise exception 'drafts can be saved only in an in-progress meeting'
      using errcode = '23514', constraint = 'plays_meeting_in_progress', hint = 'plays_meeting_in_progress';
  end if;

  -- Blokada wiersza szereguje zapisy z dwóch urządzeń: drugi widzi już nową wersję.
  select p.* into play from public.plays p where p.id = save_play_draft.play_id for update;
  if not found then
    raise exception 'play % does not exist', save_play_draft.play_id
      using errcode = 'P0002', hint = 'plays_not_found';
  end if;
  if play.status <> 'draft' then
    raise exception 'play % is not a draft', play.id
      using errcode = '23514', constraint = 'plays_saved_immutable', hint = 'plays_not_draft';
  end if;

  if save_play_draft.sheet is null or jsonb_typeof(save_play_draft.sheet) <> 'object' then
    raise exception 'draft sheet must be a JSON object'
      using errcode = '23514', constraint = 'plays_sheet_object', hint = 'plays_draft_invalid';
  end if;
  if octet_length(save_play_draft.sheet::text) > private.play_draft_max_bytes() then
    raise exception 'draft sheet exceeds % bytes', private.play_draft_max_bytes()
      using errcode = '23514', constraint = 'plays_draft_size', hint = 'plays_draft_too_large';
  end if;

  if save_play_draft.base_version is distinct from play.draft_version then
    raise exception 'draft of play % changed: version % in database, % in request',
        play.id, play.draft_version, save_play_draft.base_version
      using errcode = 'PT409', hint = 'plays_draft_conflict';
  end if;

  update public.plays p
     set sheet = save_play_draft.sheet,
         draft_version = p.draft_version + 1,
         draft_saved_at = now(),
         draft_saved_by = auth.uid()
   where p.id = play.id
  returning p.* into saved;

  return saved;
end;
$$;

comment on function public.save_play_draft(uuid, jsonb, int) is
  'Zapisuje szkic kartki partii w toku z kontrolą wersji. Admin lub prowadzący, tylko spotkanie w trakcie.';

revoke execute on function public.save_play_draft(uuid, jsonb, int) from public, anon;
grant execute on function public.save_play_draft(uuid, jsonb, int) to authenticated;

create function public.discard_play(play_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  play_meeting_id uuid;
  play public.plays;
begin
  play_meeting_id := private.play_meeting(discard_play.play_id);
  perform private.require_meeting_runner(play_meeting_id);

  select p.* into play from public.plays p where p.id = discard_play.play_id for update;
  if not found then
    raise exception 'play % does not exist', discard_play.play_id
      using errcode = 'P0002', hint = 'plays_not_found';
  end if;
  if play.status <> 'draft' then
    raise exception 'play % is not a draft', play.id
      using errcode = '23514', constraint = 'plays_saved_immutable', hint = 'plays_not_draft';
  end if;

  -- Gracze szkicu znikają kaskadowo (play_results → plays ON DELETE CASCADE).
  delete from public.plays p where p.id = play.id;
end;
$$;

comment on function public.discard_play(uuid) is
  'Porzuca partię w toku: usuwa szkic i jego graczy, bez wpływu na statystyki. Admin lub prowadzący.';

revoke execute on function public.discard_play(uuid) from public, anon;
grant execute on function public.discard_play(uuid) to authenticated;
