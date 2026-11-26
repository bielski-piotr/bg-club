-- [031] Usuwanie partii i spójne odświeżanie danych (PRD VIEW-6, PLAN-5, §5.6.5, Q4, Q17).
--
-- Zasady:
-- - Tylko admin (`private.require_admin`) trwale usuwa zapisaną partię po potwierdzeniu
--   w aplikacji: `delete_play(play_id)`. Jedna transakcja usuwa partię z danymi kartki
--   (`plays.sheet`) i wyniki graczy (`play_results`, kaskada), a potem uruchamia przeliczenie
--   zależnych danych (`private.recalculate_after_plays_change`).
-- - Partia w toku (szkic) nie jest wynikiem: porzuca ją `discard_play` ([028]), więc
--   `delete_play` na szkicu to błąd `plays_not_saved`.
-- - Rankingi, statystyki i serie liczą się z `play_results` przy odczycie (E5), więc usunięte
--   wyniki znikają z nich od razu. Ewentualne zapisane agregaty podmienią ciało
--   `private.recalculate_after_plays_change`; każda zmiana zapisanych partii wywołuje ją
--   w tej samej transakcji (§5.6.5, Q17).
-- - Obraz karteczki (bucket `sheets`) usuwa aplikacja przez API Storage po zatwierdzeniu
--   transakcji: funkcja zwraca jego ścieżkę (albo NULL). Bezpośrednie `delete from
--   storage.objects` blokuje Storage (`storage.protect_delete`). Błąd Storage nie przywraca
--   partii: plik bez partii jest osierocony, więc usunie go ponowienie w aplikacji albo
--   sprzątanie `orphan_sheet_images` ([030]) przy otwarciu spotkania przez admina.
-- - Spotkanie: partię usuwa się w spotkaniu w trakcie i zakończonym. Zakończone spotkanie bez
--   partii można potem usunąć (PLAN-5, Q4); z partiami blokuje to klucz obcy `plays.meeting_id`
--   (RESTRICT, [002]). Blokada wiersza spotkania szereguje usunięcie partii z zakończeniem
--   i usunięciem spotkania.
-- - Błędy reguł mają SQLSTATE 23514 (brak partii: P0002) i nazwę reguły w HINT, jak
--   w migracjach [027]–[030].

-- Przeliczenie po zmianie zapisanych partii spotkania (§5.6.5).
create function private.recalculate_after_plays_change(meeting_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Nie ma zapisanych agregatów: rankingi, statystyki, serie i rekordy liczą się
  -- z `play_results` przy odczycie. Punkt zostaje dla przyszłych agregatów (sygnatura bez zmian).
  perform recalculate_after_plays_change.meeting_id;
end;
$$;

comment on function private.recalculate_after_plays_change(uuid) is
  'Przeliczenie po zmianie zapisanych partii spotkania (§5.6.5). Obecnie nic nie robi: wszystko liczy się z play_results przy odczycie.';

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

  -- Wyniki graczy tej partii znikają kaskadowo.
  delete from public.plays p where p.id = play.id;

  perform private.recalculate_after_plays_change(play.meeting_id);
  return play.sheet_image_path;
end;
$$;

comment on function public.delete_play(uuid) is
  'Trwale usuwa zapisaną partię z wynikami i kartką, potem przelicza zależne dane (VIEW-6, §5.6.5). Tylko admin. Zwraca ścieżkę obrazu karteczki do usunięcia przez API Storage.';

revoke execute on function public.delete_play(uuid) from public, anon;
grant execute on function public.delete_play(uuid) to authenticated;
