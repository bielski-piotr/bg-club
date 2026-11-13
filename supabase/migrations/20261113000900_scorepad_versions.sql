-- [015] Wersjonowanie notesów, import i eksport (PRD GAME-7, GAME-9, EDT-1, EDT-6…EDT-8, NFR-7).
--
-- Zasady:
-- - Zapis notesu to jedna transakcja `save_scorepad(...)`: dodaje notes (gdy go nie ma),
--   tworzy kolejną niezmienną wersję i przestawia na nią `current_version_id`. Jeśli cokolwiek
--   się nie uda, nie zostaje ani wersja, ani zmieniony wskaźnik (GAME-9).
-- - Zdjęcie kartki jest w Storage (bucket `scorepads`), nie w JSON-ie (EDT-1, NFR-7). Klient
--   wysyła plik przed zapisem wersji; funkcja przyjmuje tylko ścieżkę pliku, który już jest
--   w buckecie, więc nieudany upload nie opublikuje wersji z brakującym obrazem. Szablon
--   z polem `image` (np. data URL z pliku `.json`) jest odrzucany także przy bezpośrednim
--   INSERT-cie.
-- - Pliki wersji są trwałe jak same wersje: obrazu wskazanego przez którąkolwiek wersję nie da
--   się usunąć ani nadpisać, więc stare partie i wersje zostają czytelne po edycji i usunięciu
--   notesu. Usunąć można tylko plik osierocony (np. po nieudanym zapisie wersji).
-- - Usunięcie notesu jest miękkie i nieodwracalne (jak gry, GAME-8): `deleted_at` nadaje baza,
--   a usuniętego notesu nie da się już zmieniać. Nowe partie go nie widzą (strażnik partii
--   z migracji [003]), historia wskazuje dalej jego wersje.
-- - Funkcja działa z uprawnieniami wołającego (`security invoker`): zapis tylko admin (RLS).

-- ---------------------------------------------------------------------------------------------
-- scorepad_versions: szablon bez obrazu w JSON-ie (EDT-1, NFR-7)
-- ---------------------------------------------------------------------------------------------
alter table public.scorepad_versions
  add constraint scorepad_versions_template_no_image check (not (template ? 'image'));

-- Strażnik Storage (niżej) szuka wersji po ścieżce obrazu.
create index scorepad_versions_image_path_idx on public.scorepad_versions (image_path)
  where image_path is not null;

comment on column public.scorepad_versions.image_path is
  'Zdjęcie kartki w buckecie scorepads (EDT-1). Plik jest trwały: Storage nie pozwala go usunąć ani nadpisać.';

-- ---------------------------------------------------------------------------------------------
-- scorepads: usunięty notes jest niezmienny, znacznik usunięcia nadaje baza
-- ---------------------------------------------------------------------------------------------
create or replace function public.scorepads_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Wersje i partie notesu wskazują grę; przeniesienie notesu do innej gry rozspójniłoby historię.
  if new.game_id is distinct from old.game_id then
    raise exception 'scorepads.game_id is immutable' using errcode = '23514', constraint = 'scorepads_game_immutable';
  end if;
  if old.deleted_at is not null then
    raise exception 'scorepad % is deleted', old.id
      using errcode = '23514', constraint = 'scorepads_deleted_immutable';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- save_scorepad: nowa wersja notesu w jednej transakcji (GAME-7, GAME-9, EDT-1)
-- ---------------------------------------------------------------------------------------------
create function public.save_scorepad(
  game_id uuid,
  scorepad_id uuid,
  name text,
  template jsonb,
  image_path text,
  player_slots int
)
returns public.scorepad_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pad public.scorepads;
  game_deleted timestamptz;
  saved public.scorepad_versions;
begin
  if not private.is_admin() then
    raise exception 'only the admin can save scorepads' using errcode = '42501';
  end if;

  -- Szablon w formacie v2 (EDT-7); kategorie i regułę miejsc sprawdza klient (`validateScoring`).
  if jsonb_typeof(template) is distinct from 'object'
     or template ->> 'v' is distinct from '2'
     or jsonb_typeof(template -> 'lines') is distinct from 'array' then
    raise exception 'scorepad template must be a score-pad v2 template'
      using errcode = '22023', constraint = 'save_scorepad_template_v2';
  end if;

  if image_path is not null and not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'scorepads' and o.name = save_scorepad.image_path
  ) then
    raise exception 'scorepad image % is not in storage', image_path
      using errcode = '23503', constraint = 'save_scorepad_image_uploaded';
  end if;

  -- Blokada gry szereguje zapis z miękkim usunięciem gry (jak strażnik aktywnej gry, [012]).
  select g.deleted_at into game_deleted from public.games g where g.id = save_scorepad.game_id for share;
  if not found then
    raise exception 'game % does not exist', game_id
      using errcode = '23503', constraint = 'scorepads_game_id_fkey';
  end if;
  if game_deleted is not null then
    raise exception 'game % is deleted', game_id
      using errcode = '23514', constraint = 'scorepads_game_active';
  end if;

  select s.* into pad from public.scorepads s where s.id = save_scorepad.scorepad_id for update;
  if not found then
    insert into public.scorepads (id, game_id, name)
    values (save_scorepad.scorepad_id, save_scorepad.game_id, btrim(save_scorepad.name))
    returning * into pad;
  elsif pad.game_id is distinct from save_scorepad.game_id then
    raise exception 'scorepad % belongs to another game', pad.id
      using errcode = '23514', constraint = 'scorepads_game_immutable';
  elsif pad.deleted_at is not null then
    raise exception 'scorepad % is deleted', pad.id
      using errcode = '23514', constraint = 'scorepads_deleted_immutable';
  end if;

  insert into public.scorepad_versions (scorepad_id, template, image_path, player_slots)
  values (pad.id, save_scorepad.template, save_scorepad.image_path, save_scorepad.player_slots)
  returning * into saved;

  update public.scorepads s
     set name = btrim(save_scorepad.name),
         current_version_id = saved.id
   where s.id = pad.id;

  return saved;
end;
$$;

comment on function public.save_scorepad(uuid, uuid, text, jsonb, text, int) is
  'Dodaje notes gry (gdy go nie ma) i zapisuje jego nową, niezmienną wersję jako aktualną (GAME-7, GAME-9). Tylko admin.';

revoke execute on function public.save_scorepad(uuid, uuid, text, jsonb, text, int) from public, anon;
grant execute on function public.save_scorepad(uuid, uuid, text, jsonb, text, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage: obrazy wersji są trwałe (GAME-9)
-- ---------------------------------------------------------------------------------------------
-- Okładki (covers) zmienia i usuwa admin jak dotąd. W buckecie scorepads admin usuwa albo
-- nadpisuje tylko plik, którego nie wskazuje żadna wersja notesu.
drop policy bg_club_admin_assets_update on storage.objects;
drop policy bg_club_admin_assets_delete on storage.objects;

create policy bg_club_admin_assets_update on storage.objects for update to authenticated
  using (
    bucket_id in ('covers', 'scorepads')
    and (select private.is_admin())
    and (
      bucket_id <> 'scorepads'
      or not exists (select 1 from public.scorepad_versions v where v.image_path = objects.name)
    )
  )
  with check (bucket_id in ('covers', 'scorepads') and (select private.is_admin()));
create policy bg_club_admin_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('covers', 'scorepads')
    and (select private.is_admin())
    and (
      bucket_id <> 'scorepads'
      or not exists (select 1 from public.scorepad_versions v where v.image_path = objects.name)
    )
  );
