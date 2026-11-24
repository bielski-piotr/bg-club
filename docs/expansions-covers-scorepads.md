# Dodatki do gier, kadrowanie okładki i przenoszenie notesów

Migracja: `supabase/migrations/20261126000000_expansions_cover_crop_scorepad_move.sql`,
testy SQL: `supabase/tests/database/300_expansions.test.sql`.

## Dodatki

Dodatek to wiersz `games` z `base_game_id` wskazującym grę podstawową. Ma własny tytuł,
okładkę, liczbę graczy, skomplikowanie, punktację miejsc i własne notesy punktacji.

- Administrator dodaje dodatek z widoku gry (menu ⋯ w nagłówku albo „Dodaj dodatek” w sekcji
  **Dodatki**) i z menu gry w kolekcji. Adres formularza: `game/<uuid>/expansions/new`.
- Dodatków **nie ma** w kolekcji, wyszukiwaniu, filtrach (leaderboard, statystyki i rekordy
  gracza) ani w głosowaniu. Baza tego pilnuje: `search_games` zwraca tylko gry podstawowe,
  a głosy (`game_votes`), opublikowane gry (`meeting_games`) i partie (`plays.game_id`)
  przyjmują tylko gry podstawowe.
- Dodatek widać tylko w widoku gry podstawowej (lista z liczbą partii). Jego widok pokazuje
  okładkę, grę podstawową, liczbę graczy, skomplikowanie i liczbę rozegranych partii.
- Dodatek nie może mieć dodatków, a `base_game_id` jest niezmienne. Usunięcie gry podstawowej
  usuwa (miękko) jej dodatki; historia zostaje.

### Partia z dodatkami

Prowadzący rozpoczyna partię gry podstawowej i w kroku **Dodatki** (pokazywanym tylko dla gry,
która ma dodatki) zaznacza dodatki użyte w partii. Notes może pochodzić z gry podstawowej albo
z zaznaczonego dodatku. Partia zapisuje dodatki w `plays.expansion_ids` (niezmienne).

- Liczba graczy partii: max(2, najmniejsze min) … największe max spośród gry i zaznaczonych
  dodatków (oraz miejsc notesu, jak dotąd).
- **Punktacja** (`private.play_scoring_game`, w aplikacji `scoringTitle`): spośród gry
  podstawowej i zaznaczonych dodatków tytuł o **najwyższym skomplikowaniu, który mieści
  wszystkich graczy** partii (max graczy ≥ liczba graczy). Remis skomplikowania wygrywa gra
  podstawowa. Przykład: gra 2–4 (skomplikowanie 2) z dodatkiem 2–6 (1,5): przy 4 graczach
  punktacja gry, przy 5 graczach punktacja dodatku, bo tylko on mieści wszystkich.
- Wyniki, rankingi, statystyki i rekordy liczą się dla gry podstawowej. Dodatek zbiera tylko
  liczbę rozegranych partii (`game_collection.play_count`) i nie ma własnych rankingów.
- Rekord z partii z dodatkami trafia do gry podstawowej z ich listą (`game_stats` →
  `record.holders[].expansions`, `player_records.expansions`): widok gry i profil pokazują
  „z dodatkami: …”.
- Widok spotkania (partie w toku i karteczki) oraz powiększona karteczka pokazują, z którymi
  dodatkami rozegrano partię.

## Okładka z kadrem

Po wyborze pliku albo wklejeniu obrazu (Ctrl+V / ⌘V w formularzu albo „Wklej ze schowka”, gdy
przeglądarka udostępnia Clipboard API) otwiera się kadrowanie z maską w kształcie okładki
z widoku gry (zaokrąglony kwadrat). Do Storage trafiają:

- okładka: kwadrat do 800 px (WebP ok. 100 KB), `games.cover_path`,
- oryginał zmniejszony do 1600 px, `games.cover_source_path`,
- kadr `games.cover_crop` = `{"zoom", "x", "y"}` (przesunięcie jako ułamek boku kadru).

„Zmień kadr” przy zapisanej okładce wczytuje oryginał i zapisany kadr; zapis tworzy nową
okładkę, a oryginał zostaje. Okładki sprzed tej zmiany nie mają oryginału: kadruje się sama
okładka (staje się wtedy oryginałem). Po zapisie usuwane są tylko pliki, których nowa okładka
nie używa.

## Notesy: przenoszenie i usuwanie

- „Przenieś do innej gry” (menu notesu, adres `scorepad/<uuid>/move`) zmienia
  `scorepads.game_id` na inną aktywną grę albo dodatek. Rozegrane partie wskazują swoją grę
  i wersję notesu, więc historia, statystyki i leaderboardy się nie zmieniają.
- Usunięcie notesu jest miękkie (jak dotąd): notes znika z list i z wyboru przy nowej partii,
  a partie, karteczki, statystyki i leaderboardy zostają bez zmian.
