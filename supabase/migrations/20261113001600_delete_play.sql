-- Usuwanie partii i spójne odświeżanie danych.
--
-- Zasady:
-- - Tylko admin (`private.require_admin`) trwale usuwa zapisaną partię po potwierdzeniu
--   w aplikacji: `delete_play(play_id)`. Jedna transakcja usuwa partię z danymi kartki
--   (`plays.sheet`), wyniki graczy (`play_results`, kaskada) i odblokowania osiągnięć
--   wskazujące tę partię (`achievement_unlocks.play_id`, kaskada), a potem uruchamia
--   przeliczenie zależnych danych (`private.recalculate_after_plays_change`).
-- - Partia w toku (szkic) nie jest wynikiem: porzuca ją `discard_play`, więc
--   `delete_play` na szkicu to błąd `plays_not_saved`.
-- - Rankingi, statystyki i serie liczą się z `play_results` przy odczycie, więc usunięte
--   wyniki znikają z nich od razu. Osiągnięcia i ewentualne zapisane agregaty
--   podmieniają ciało `private.recalculate_after_plays_change` (create or replace); każda
--   zmiana zapisanych partii wywołuje ją w tej samej transakcji.
-- - Obraz karteczki (bucket `sheets`) usuwa aplikacja przez API Storage po zatwierdzeniu
--   transakcji: funkcja zwraca jego ścieżkę (albo NULL). Bezpośrednie `delete from
--   storage.objects` blokuje Storage (`storage.protect_delete`). Błąd Storage nie przywraca
--   partii: plik bez partii jest osierocony, więc usunie go ponowienie w aplikacji albo
--   sprzątanie `orphan_sheet_images` przy otwarciu spotkania przez admina.
-- - Spotkanie: partię usuwa się w spotkaniu w trakcie i zakończonym. Zakończone spotkanie bez
--   partii można potem usunąć; z partiami blokuje to klucz obcy `plays.meeting_id`
--   (RESTRICT). Blokada wiersza spotkania szereguje usunięcie partii z zakończeniem
--   i usunięciem spotkania.
-- - Błędy reguł mają SQLSTATE 23514 (brak partii: P0002) i nazwę reguły w HINT, jak
--   we wcześniejszych migracjach.

-- Przeliczenie po zmianie zapisanych partii spotkania. Na razie nie ma zapisanych
-- agregatów: rankingi, statystyki, serie i rekordy liczą się z `play_results` przy odczycie,
-- a odblokowania usuniętej partii znikają kaskadą. Przeliczanie osiągnięć (i ewentualne
-- agregaty) podmienia ciało tej funkcji, zachowując sygnaturę.
create function private.recalculate_after_plays_change(meeting_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Wywołuje ją RPC security definer, więc działa z prawami właściciela. Celowo puste: patrz
  -- komentarz nad funkcją.
  perform recalculate_after_plays_change.meeting_id;
end;
$$;

comment on function private.recalculate_after_plays_change(uuid) is
  'Przeliczenie rankingów, serii, rekordów i osiągnięć po zmianie zapisanych partii spotkania.';

revoke execute on function private.recalculate_after_plays_change(uuid) from public, anon, authenticated;

create function public.delete_play(play_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  play_meeting_id uuid;
  play public.plays;
begin
  -- Strażnik przed odczytem partii: bez uprawnień odpowiedź nie zdradza, czy partia istnieje.
  perform private.require_admin();
  play_meeting_id := private.play_meeting(delete_play.play_id);

  -- Kolejność blokad jak przy zapisie: najpierw spotkanie, potem partia.
  perform 1 from public.meetings m where m.id = play_meeting_id for update;

  select p.* into play from public.plays p where p.id = delete_play.play_id for update;
  if not found then
    -- Równoległe usunięcie (np. druga karta) zdążyło przed nami.
    raise exception 'play % does not exist', delete_play.play_id
      using errcode = 'P0002', hint = 'plays_not_found';
  end if;
  if play.status <> 'saved' then
    raise exception 'play % is not saved; discard the draft instead', play.id
      using errcode = '23514', constraint = 'plays_delete_saved', hint = 'plays_not_saved';
  end if;

  -- Wyniki graczy i odblokowania tej partii znikają kaskadowo.
  delete from public.plays p where p.id = play.id;

  perform private.recalculate_after_plays_change(play.meeting_id);
  return play.sheet_image_path;
end;
$$;

comment on function public.delete_play(uuid) is
  'Trwale usuwa zapisaną partię z wynikami i kartką, potem przelicza zależne dane. Tylko admin. Zwraca ścieżkę obrazu karteczki do usunięcia przez API Storage.';

revoke execute on function public.delete_play(uuid) from public, anon;
grant execute on function public.delete_play(uuid) to authenticated;
