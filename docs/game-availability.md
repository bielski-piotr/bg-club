# Dostępność gry

Migracja: `supabase/migrations/20261127000000_game_availability.sql`,
testy SQL: `supabase/tests/database/310_game_availability.test.sql`.

Gra i dodatek mają pole `games.available` (domyślnie `true`). Administrator zmienia je
przełącznikiem **Dostępna** w formularzu gry (dodawanie i edycja). Widok gry (podgląd) nie
pokazuje tego ustawienia.

- **Kolekcja**: niedostępna gra zostaje w kolekcji, wyszukiwaniu i widżecie kolekcji, ale jest
  wyszarzona (`game-cover--unavailable`, `game-tile--unavailable`). Jej podgląd nadal się
  otwiera.
- **Filtry** (leaderboard, statystyki, rekordy): niedostępne gry są do wyboru jak dotąd.
- **Głosowanie**: niedostępna gra jest na końcu listy z oznaczeniem „Niedostępna”; nie można
  na nią zagłosować (wyzwalacz `require_active_game`, HINT `games_unavailable`). Oddany
  wcześniej głos zostaje i można go cofnąć.
- **Publikacja „Gramy w”**: niedostępnej gry nie da się zaznaczyć ani opublikować; przy
  ponownej publikacji odpada z obecnej listy.
- **Nowa partia**: niedostępnej gry nie da się wybrać, a niedostępnego dodatku zaznaczyć
  (`start_play` i `plays_before_insert`). Krok „Dodatki” pojawia się tylko, gdy gra ma
  dostępne dodatki. Rozpoczęte i zapisane partie się nie zmieniają.
- **Dodatki**: wyłączenie gry podstawowej wyłącza wszystkie jej dodatki
  (`games_after_unavailable`), a nowy dodatek niedostępnej gry jest niedostępny. Ponowne
  włączenie gry **nie** włącza dodatków: każdy włącza się osobno.
