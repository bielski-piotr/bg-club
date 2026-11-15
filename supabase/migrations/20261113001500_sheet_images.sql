-- [030] Obrazy karteczek i historia partii (PRD PAD-6, GAME-10, VIEW-3, NFR-7, §6).
--
-- Zasady:
-- - Przy oderwaniu notes robi obraz kartki z pismem (WebP, PNG bez kodera WebP, ok. 150 KB).
--   Aplikacja wgrywa go do bucketu `sheets` pod nową nazwą `<meeting_id>/<play_id>-<sufiks>.<webp|png>`
--   (polityka `bg_club_sheets_insert_runner`, bez nadpisywania), a po zapisie partii
--   (`save_play`, [029]) dołącza go RPC `attach_play_sheet_image(play_id, image_path)`.
-- - Obraz jest tylko podglądem: pełne wpisy kartki (`plays.sheet`) i niezmienna wersja szablonu
--   (`plays.scorepad_version_id`) wystarczą do ponownego renderu, także w 3D. Partia bez obrazu
--   (upload przerwany przed zapisem albo po nim) jest pełną historią; brak obrazu nie blokuje
--   zapisu wyników.
-- - Dołączenie: tylko zapisana partia, tylko plik tej partii, który jest już w Storage.
--   Pierwszy dołączony obraz zostaje (wyzwalacz `plays_before_update` nie pozwala go zmienić);
--   ponowienie z tą samą ścieżką albo z inną (np. po ponownym wgraniu) zwraca partię bez zmian,
--   a aplikacja usuwa wtedy swój zbędny plik.
-- - Sprzątanie: plik, którego nie wskazuje żadna partia, jest osierocony (anulowane
--   podsumowanie, przerwany zapis, ponowne wgranie). Admin i prowadzący mogą usuwać takie pliki
--   swojego spotkania (polityka `bg_club_sheets_delete_unused`), a `orphan_sheet_images(meeting_id)`
--   podaje te, które na pewno nie czekają już na zapis: starsze niż 15 minut i nie należą do
--   partii w toku. Pliku wskazanego przez partię nie usunie nikt poza adminem, więc sprzątanie
--   nie uszkadza historii. Bezpośrednie `delete from storage.objects` blokuje Storage
--   (`storage.protect_delete`), dlatego pliki usuwa klient przez API Storage.
-- - Błędy reguł mają SQLSTATE 23514 (brak pliku: 23503, brak partii: P0002) i nazwę reguły
--   w HINT, jak w migracjach [027]–[029].

-- Czy `path` to ścieżka obrazu karteczki partii `play_id` ze spotkania `meeting_id`.
create function private.is_sheet_image_path(path text, meeting_id uuid, play_id uuid)
returns boolean
language sql
immutable
set search_path = ''
return coalesce(
  path ~ ('^' || meeting_id::text || '/' || play_id::text || '-[A-Za-z0-9_-]{8,64}\.(webp|png)$'),
  false
);

revoke execute on function private.is_sheet_image_path(text, uuid, uuid) from public, anon, authenticated;

create function public.attach_play_sheet_image(play_id uuid, image_path text)
returns public.plays
language plpgsql
security definer
set search_path = ''
as $$
declare
  play_meeting_id uuid;
  play public.plays;
  saved public.plays;
begin
  play_meeting_id := private.play_meeting(attach_play_sheet_image.play_id);
  perform private.require_meeting_runner(play_meeting_id);

  -- Blokada wiersza szereguje równoległe dołączenia (np. ponowienie z drugiej karty).
  select p.* into play from public.plays p where p.id = attach_play_sheet_image.play_id for update;

  if play.status <> 'saved' then
    raise exception 'play % is not saved', play.id
      using errcode = '23514', constraint = 'plays_sheet_image_saved', hint = 'plays_sheet_image_not_saved';
  end if;

  if not private.is_sheet_image_path(attach_play_sheet_image.image_path, play.meeting_id, play.id) then
    raise exception 'invalid sheet image path %', attach_play_sheet_image.image_path
      using errcode = '23514', constraint = 'plays_sheet_image_path', hint = 'plays_sheet_image_invalid';
  end if;

  -- Obraz już jest (ponowienie albo wcześniejsza próba): zostaje pierwszy.
  if play.sheet_image_path is not null then
    return play;
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'sheets' and o.name = attach_play_sheet_image.image_path
  ) then
    raise exception 'sheet image % is not in storage', attach_play_sheet_image.image_path
      using errcode = '23503', constraint = 'plays_sheet_image_uploaded', hint = 'plays_sheet_image_missing';
  end if;

  update public.plays p
     set sheet_image_path = attach_play_sheet_image.image_path
   where p.id = play.id
  returning p.* into saved;
  return saved;
end;
$$;

comment on function public.attach_play_sheet_image(uuid, text) is
  'Dołącza obraz oderwanej karteczki (bucket sheets) do zapisanej partii (PAD-6). Admin lub prowadzący; pierwszy obraz zostaje, ponowienie zwraca partię bez zmian.';

revoke execute on function public.attach_play_sheet_image(uuid, text) from public, anon;
grant execute on function public.attach_play_sheet_image(uuid, text) to authenticated;

-- Pliki obrazów spotkania, których nie wskazuje żadna partia i które nie czekają na zapis.
create function public.orphan_sheet_images(meeting_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_meeting_runner(orphan_sheet_images.meeting_id);
  return query
    select o.name collate "default"
      from storage.objects o
     where o.bucket_id = 'sheets'
       and (storage.foldername(o.name))[1] = orphan_sheet_images.meeting_id::text
       and o.created_at < now() - interval '15 minutes'
       and not exists (select 1 from public.plays p where p.sheet_image_path = o.name)
       -- Partia w toku może jeszcze dołączyć obraz wgrany przy oderwaniu (podsumowanie otwarte).
       and not exists (
         select 1 from public.plays p
          where p.meeting_id = orphan_sheet_images.meeting_id
            and p.status = 'draft'
            and o.name like p.meeting_id::text || '/' || p.id::text || '-%'
       )
     order by o.name;
end;
$$;

comment on function public.orphan_sheet_images(uuid) is
  'Osierocone obrazy karteczek spotkania do usunięcia przez API Storage (PAD-6): bez partii, starsze niż 15 minut, nie z partii w toku. Admin lub prowadzący.';

revoke execute on function public.orphan_sheet_images(uuid) from public, anon;
grant execute on function public.orphan_sheet_images(uuid) to authenticated;

-- Indeks wyszukania partii po obrazie (sprzątanie, polityka usuwania).
create index plays_sheet_image_path_idx on public.plays (sheet_image_path) where sheet_image_path is not null;

-- Admin i prowadzący usuwają nieużywane pliki swojego spotkania (anulowane podsumowanie,
-- zbędne ponowne wgranie, sprzątanie). Plik wskazany przez partię zostaje.
create policy bg_club_sheets_delete_unused on storage.objects for delete to authenticated
  using (
    bucket_id = 'sheets'
    and private.is_meeting_runner(private.try_uuid((storage.foldername(name))[1]))
    and not exists (select 1 from public.plays p where p.sheet_image_path = objects.name)
  );
