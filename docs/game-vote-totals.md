# Łączna liczba głosów na grę

GAME-12 pokazuje w szczegółach gry „Łącznie głosów: N”, również gdy gra nie ma partii
lub głosów. `game_vote_total(game_id)` liczy istniejące wiersze `public.game_votes`
we wszystkich spotkaniach przy każdym odczycie. Jeden uczestnik daje jeden głos na
grę w spotkaniu. Głos tej samej osoby w kolejnym spotkaniu liczy się osobno.
Głosy na inne gry i wybór listy „Gramy w:” nie wpływają na wynik tej gry.

| Zmiana                                                                | Wpływ na sumę                                                                                                                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oddanie / cofnięcie głosu przy otwartym głosowaniu                    | +1 / −1. Ponowienie nie tworzy duplikatu dzięki kluczowi głównemu.                                                                                                      |
| Publikacja, ponowna publikacja, rozpoczęcie lub zakończenie spotkania | Bez zmiany. Model zachowuje głosy po zamknięciu.                                                                                                                        |
| Ponowne otwarcie głosowania                                           | Bez zmiany. Późniejsze cofnięcie głosu zmniejsza sumę.                                                                                                                  |
| Usunięcie planowanego spotkania, także po publikacji                  | Kaskada usuwa wszystkie jego głosy, więc przestają się liczyć.                                                                                                          |
| Usunięcie uczestnika z planu lub konta członka                        | Głosy z planowanych spotkań znikają kaskadą. Historia spotkań w trakcie i zakończonych zostaje.                                                                         |
| Miękkie usunięcie gry                                                 | Znikają głosy z planowanych spotkań. Głosy historyczne ze spotkań w trakcie i zakończonych zostają, tak jak partie. Szczegóły usuniętej gry nie są dostępne z kolekcji. |

Prywatna tabela `private.meeting_voters` zapisuje osoby, które miały przynajmniej
jeden głos przy zamknięciu głosowania. Służy osiągnięciu `voter-10` i nie zawiera
`game_id`. Jej wpis może pozostać po cofnięciu głosu albo usunięciu uczestnika lub
gry. Nie jest drugim głosem i nie można przypisać go do konkretnej gry. GAME-12
nie odczytuje, nie ujawnia ani nie zmienia tej migawki. Usunięcie spotkania usuwa
również jego migawkę zgodnie z dotychczasowym modelem osiągnięć.

RPC zwraca tylko liczbę, bez identyfikatorów osób i spotkań. Działa jako
`security invoker` z pustym `search_path`. Istniejący RLS daje odczyt aktywnym
członkom, także spoza danego spotkania. Administrator i prowadzący mają ten sam
odczyt co gracz. Anon nie ma prawa wykonania. Usunięte konto lub konto bez profilu
otrzymuje `NULL`, tak jak dla nieistniejącej gry. Prawa do głosów i prywatnych
migawek pozostają bez zmian.

Interfejs unieważnia cache sumy po oddaniu i cofnięciu głosu, zmianie planu,
publikacji, ponownym otwarciu, usunięciu spotkania i usunięciu członka. Ponowne
otwarcie szczegółów gry oraz przeładowanie strony pobierają aktualny wynik,
również po zmianie w innej sesji. Błąd odczytu ma polski komunikat i ponowienie,
nie zastępuje wyniku zerem. Nie dodano synchronizacji w czasie rzeczywistym.

Testy `260_game_vote_totals.test.sql` sprawdzają wynik na prawdziwej bazie oraz
role i zachowanie migawek. Test API `game-vote-totals.test.ts` sprawdza Auth,
PostgREST i zmiany głosowania. Docelowe E2E `game-vote-totals.spec.ts` sprawdzają
widok, odświeżanie, błąd i dostępność w czterech projektach.

Test API uruchamia się na pustym lokalnym stosie. Zapisz wynik
`supabase status --workdir <własny-stos> -o json` jako plik UTF-8 poza repozytorium,
ustaw `BG_CLUB_TEST_STACK_FILE` na jego ścieżkę i uruchom
`pnpm --filter @bg-club/web exec node --experimental-strip-types --test integration/game-vote-totals.test.ts`.
Plik statusu zawiera klucze lokalnego stosu, nie dodawaj go do Git ani do logów.
Test odmawia pracy na niepustej instalacji. Nie resetuje stosu i pozostawia fikcyjne
dane, które usuwa się razem z własnym środowiskiem testowym.

Nie są potrzebne dane klubowe ani konfiguracja produkcji. Migracja działa na
istniejących danych bez backfillu i bez nowej tabeli lub przebudowy statystyk.
