# Regresja MVP (#44)

## Uruchomienie

Wymagane są Node i pnpm z wersji repozytorium, Chromium Playwright oraz Docker dla
lokalnego Supabase. Testy uruchamia się kolejno, aby kompilacja, jsdom i programowy
WebGL nie konkurowały o CPU podczas pomiaru NFR-2.

```sh
pnpm install --frozen-lockfile
pnpm --filter @bg-club/web exec playwright install chromium
pnpm check
pnpm db:start
pnpm db:reset
pnpm test:sql
pnpm test:auth
pnpm test:e2e
```

SQL musi poprzedzać integrację Auth. Oba zestawy zaczynają od pustej instalacji,
a integracja zostawia administratora i dane. Kolejny przebieg wymaga `db:reset`.
Playwright uruchamia build z konfiguracją atrap API. Po ręcznym buildzie bez zmiennych
Supabase należy zatrzymać poprzedni `vite preview`, aby Playwright zbudował aplikację
ze swoją konfiguracją. Build i testy nie powinny jednocześnie nadpisywać `dist`.

## Dowody i granice testów

| Kryterium                                                                                              | Przeglądarka z atrapą API                                                                | Prawdziwy backend                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Pusta instalacja, klub, członek, gra, notes, spotkanie, głos, szkic, zapis, historia, ranking, gablota | `regression.spec.ts`, jeden stan od pustego klubu do zapisanej partii i jej przeglądania | `accounts/integration/auth.test.ts`: bootstrap, klub, członkowie, spotkania, zapis oraz projekcje historii/rankingu/gabloty |
| Admin, prowadzący, gracz, usunięte konto                                                               | `auth`, `deletion`, `members`, `meeting-run`, `play-drafts`, `achievements`              | SQL `050`, `060`, `070`, `130`, `150`, `160`, `170`, `240`; integracja Auth                                                 |
| Deep links i odświeżenie szkicu                                                                        | `hub`, `play-drafts`, `regression`                                                       | SQL `160`; UI sprawdza również kopię lokalną i konflikt wersji                                                              |
| Zmiana prowadzącego w trakcie spotkania                                                                | `meetings.spec.ts`, edycja trwającego spotkania                                          | SQL `130`, `150`; integracja usunięcia prowadzącego                                                                         |
| Remisy hierarchiczne i floor                                                                           | `play-save`, `scorepad-categories`                                                       | Wspólne fixture TS/SQL: scoring `cases`, SQL `110`, `171`                                                                   |
| Serie, rok, osiągnięcia, cofnięcie wyników                                                             | `leaderboard`, `player-stats`, `achievements`, `play-delete`                             | Scoring `achievements`; SQL `190`–`240`; integracja zapisu i usunięcia                                                      |
| Równoległe starty, zapisy i ponowienia                                                                 | `meeting-run`, `play-save`, `play-drafts` pokazują reakcje UI na odpowiedzi API          | Integracja API używa `Promise.all` dla prawdziwych równoległych żądań; SQL sprawdza ograniczenia                            |
| Błąd uploadu i ponowienie                                                                              | `club`, `games`, `sheet-history`, `play-save`, `play-delete`, `deletion`                 | SQL Storage `180`, testy jednostkowe obsługi błędów i integracja zdjęć                                                      |
| 360 px, desktop, oba motywy, polskie teksty                                                            | Cztery projekty Playwright, asercje szerokości, stany i axe                              | Nie dotyczy                                                                                                                 |

Scenariusz `regression.spec.ts` wykonuje operacje UI bez resetowania stanu atrapy.
Import notesu przechodzi przez kreator i RPC. Atrapa wspólna zapisuje żądanie RPC,
ale nie tworzy wersji notesu, dlatego test materializuje wersję z tego żądania.
Ranking i gablota dostają odpowiedzi projekcji po zapisanej partii. Ten test sprawdza
przepływ UI, a nie obliczenia lub RLS. Wprowadzanie punktów przez API web componentu
uzupełniają osobne testy klawiatury i pól notesu.

Test integracyjny sprawdza projekcje przez uwierzytelniony klient Supabase po prawdziwym
równoległym zapisie. Usunięcie partii musi usunąć ją z historii, odjąć punkty rankingu,
wyzerować statystyki nowej gry i cofnąć odblokowanie z gabloty.

NFR-2 jest mierzony osobno w `mobile-light` z CPU ×4 i siecią 4G. Headless Chromium
używa SwiftShader do 3D; wynik nie zastępuje pomiaru na fizycznym telefonie.
Warunkowe pominięcia w pozostałych projektach dotyczą tego samego pomiaru oraz
funkcji aparatu właściwych dla danego urządzenia. Zakres PRD §1.2 pozostaje bez zmian.
