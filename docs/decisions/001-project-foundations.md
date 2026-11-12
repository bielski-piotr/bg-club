# Decyzje startowe projektu

Data: 2026-11-12. Zadanie: [#4](https://github.com/bielski-piotr/bg-club/issues/4).
Status: decyzje implementacyjne do przeglądu w PR. Po scaleniu obowiązują przy realizacji kolejnych zadań. Nie oznaczają wcześniejszej akceptacji właściciela produktu.

## Technologia i źródła

Wybieramy React, TypeScript, Vite i TanStack Query. React obsługuje hub, stos popupów i formularze. Notes oraz edytor pozostają web componentami w vanilla TypeScript i Three.js. Pozwala to wykorzystać istniejące POC bez przepisywania fizyki i renderowania do Reacta.

Kod przenosimy do `packages/score-pad/` w zadaniu [#16](https://github.com/bielski-piotr/bg-club/issues/16). Osobne punkty wejścia notesu i edytora będą ładowane dynamicznie dopiero przy otwarciu odpowiedniego popupu. Adapter React przekazuje szablon, graczy, szkic i motyw przez API elementu, podpina zdarzenia DOM i usuwa listenery oraz renderer przy zamknięciu. Nie zapisuje danych klubu przez mechanizmy lokalnej historii POC. Szkic ma osobny adapter bazy i kopii lokalnej zgodnie z PAD-4. Kontrakt danych wyników określają PAD-7 i EDT-7. Wspólna logika rankingu trafia do `packages/scoring/`.

| Źródło | Zweryfikowana rewizja i lokalizacja | Sposób wykorzystania |
|---|---|---|
| [digital-scorepad-poc](https://github.com/bielski-piotr/digital-scorepad-poc/tree/e6b7dd29c05ca63c0b0dae5f3eceb1db8037cf10) | `e6b7dd29c05ca63c0b0dae5f3eceb1db8037cf10`, `example/score-pad/score-pad/src/core/` oraz `src/editor/` | Źródła TS obu komponentów, skrypt budowania i opis API w README tego katalogu. To baza importu. |
| [digital-scorepad-editor-poc](https://github.com/bielski-piotr/digital-scorepad-editor-poc/tree/7e6d3792686b6a6228fc168b7d4f201ff632bd56) | `7e6d3792686b6a6228fc168b7d4f201ff632bd56`, `score-pad-editor.js`, `edytor-notesu.html` | Samodzielny bundle edytora i demonstracja. Przy imporcie porównać zachowanie z edytorem TS, przenieść ewentualne różnice, opisać je w PR #16. Nie uruchamiać dwóch rejestracji `<score-pad-editor>`. |
| Projekty UI | Paper `bg-club`, file id `01M75APESFSP8980YWVTY0EAXT`; opis i identyfikatory stron w DS §1 | Źródło wizualne opisane w DS. Stan eksportów i docelowe ścieżki: [design/README.md](../../design/README.md). |

Nie kopiujemy wygenerowanych bundli jako drugiej implementacji. Po imporcie zależności runtime, w tym Three.js, mają pochodzić z zależności projektu zamiast CDN. W tym zadaniu nie przenosimy kodu POC ani nie deklarujemy zgodności dwóch edytorów bez porównania w #16.

Produkcja Cloudflare Pages buduje gałąź `master`, która jest obecną gałęzią domyślną repozytorium. PR-y otrzymują preview. Nie tworzymy `main` tylko na potrzeby wdrożenia.

## Uprawnienia i usuwanie prowadzącego

PRD §2.1 i PLAN-4 rozstrzygają uprawnienia. Tylko admin dodaje uczestników i zmienia prowadzącego, również w trakcie spotkania. Prowadzący rozpoczyna i kończy swoje spotkanie oraz prowadzi partie. Menu DS §15 nie nadaje uprawnień. Kontrola jest wymagana również w RPC i RLS, niezależnie od widoczności akcji UI.

Usunięcie konta prowadzącego przez admina lub przez niego samego jest atomowe z odebraniem uprawnienia we wszystkich niezakończonych spotkaniach. `host_id` przechodzi na `null`, czyli prowadzenie przejmuje admin. Nie wybieramy automatycznie innego gracza. Profil historyczny pozostaje. Z zaplanowanych spotkań usuwamy uczestnictwo i głosy tego konta. W spotkaniu w trakcie zachowujemy uczestnictwo, zapisane partie i szkice, aby admin mógł je dokończyć albo porzucić. Usunięty gracz nie trafia do nowej partii, ale istniejący szkic z nim może zostać zapisany. Zakończone spotkania zachowują historycznego prowadzącego.

Od momentu zatwierdzenia usunięcia żądania tego konta są odrzucane nawet przy ważnym tokenie Auth. Usunięcie konta i zapis partii muszą serializować sprawdzenie aktywności i uprawnienia, aby nie powstał zapis po odebraniu dostępu. Admina nadal nie można usunąć.

## Statystyki, kolejność i snapshot

Najlepsza gra gracza to gra z najwyższym udziałem wygranych wśród gier, w których rozegrał co najmniej 3 zapisane partie. Porównujemy dokładne ułamki, bez zaokrąglania procentów. Remis rozstrzygają kolejno większa liczba wygranych, większa liczba partii i rosnące ID gry. Brak kwalifikującej się gry daje pusty stan, bez wyboru na podstawie 1–2 partii. Remis na pierwszym miejscu jest wygraną. Filtr roku ogranicza zarówno mianownik, jak i licznik. Ulubiona gra to największa liczba partii, przy remisie większa liczba wygranych, potem rosnące ID. Gry usunięte pozostają w historycznych statystykach z oznaczeniem usunięcia.

Porządek zdarzeń ma być identyczny w SQL i TypeScript:

- Spotkania: rosnąco `(starts_at, id)`. `starts_at` jest czasem UTC, a ID rozstrzyga identyczne terminy.
- Zapisane partie w spotkaniu: rosnąco `(saved_at, id)`. To moment potwierdzonego zapisu karteczki, a nie utworzenia szkicu. Historia od najnowszej odwraca oba klucze.
- Osiągnięcia odtwarzamy najpierw według spotkań, potem partii. Datą odblokowania jest `starts_at` spotkania źródłowego; prezentacja daty i granice roku używają strefy klubu. Spotkania bez partii danego gracza nie przerywają jego serii.

Snapshot powstaje **przy utworzeniu szkicu partii**, w transakcji po stronie bazy. Zawiera pełną punktację miejsc i identyfikator niezmiennej wersji szablonu, w tym ranking, kategorie i obraz. Wszystkie podglądy, wznowienia i końcowy zapis korzystają z tego samego snapshotu. Edycja gry lub szablonu podczas rozgrywki wpływa dopiero na nowe szkice. Przy zapisie RPC używa zapisanego snapshotu, a nie aktualnej punktacji ani danych punktowych klienta. Porzucenie szkicu i rozpoczęcie nowej partii pobiera nowy snapshot. Wersji szablonu i jej obrazu nie wolno usuwać, gdy odwołuje się do nich szkic lub zapisana partia.

Partia wymaga `max(2, min_players)` graczy, najwyżej `min(max_players, player_slots)`. Gra może mieć `min_players = 1`, ale solo pozostaje poza MVP zgodnie z Q2.

Kolekcja zachowuje Q11. Gry z zapisanymi partiami sortujemy według najnowszego `saved_at` malejąco, potem gry bez partii według `created_at` malejąco. Przy remisie używamy `created_at` malejąco i ID rosnąco. Szkic nie oznacza rozegrania gry, usunięcie ostatniej partii przywraca grę do grupy bez partii. Widżet pokazuje pierwszych 5 aktywnych gier.

## Katalog osiągnięć

Przyjmujemy wszystkie **29 identyfikatorów i polskich nazw** z PRD §5.10 jako katalog MVP. ACH-4 pozostaje dodatkiem C. Warunki progowe oznaczają „co najmniej”, także gdy w tabeli widnieje sama liczba. Gablota i postęp są liczone z całej historii, niezależnie od filtra roku profilu. Szczegółowe warunki:

| Grupa identyfikatorów | Reguła |
|---|---|
| `meet-1`, `meet-10`, `meet-25`, `meet-50` | Liczba różnych spotkań, na których gracz ma ≥ 1 zapisaną partię. Sama obecność nie wystarcza. |
| `play-10`, `play-50`, `play-100`, `marathon` | Liczba zapisanych partii gracza, dla `marathon` ≥ 5 na jednym spotkaniu. |
| `win-1`, `win-10`, `win-50`, `hattrick` | Wygrane za miejsce 1, także wspólne. `hattrick` wymaga ≥ 3 na jednym spotkaniu. |
| `flawless` | Gracz rozegrał ≥ 3 partie na spotkaniu i wygrał każdą ze swoich partii. Potwierdzamy dopiero po zakończeniu spotkania. |
| `streak-3`, `streak-5`, `streak-10` | Rekord serii według PRD §5.6.4, nie tylko bieżąca seria. |
| `explorer-10`, `explorer-25`, `versatile-5`, `specialist` | Różne ID gier, także usuniętych. Odpowiednio ≥ 10/25 zagranych gier, ≥ 5 gier z wygraną, ≥ 10 wygranych w jednej grze. |
| `beginners-luck` | Wygrana w pierwszej zapisanej partii danej gry według porządku zdarzeń. |
| `record` | Reguła rekordów opisana poniżej. |
| `big-table`, `tie-top` | Zapisana partia z ≥ 6 graczami; wspólne miejsce 1 co najmniej dwóch graczy. |
| `comeback` | Wygrana na następnym spotkaniu z partią gracza po spotkaniu bez wygranej, które przerwało jego serię ≥ 3. Pomijamy spotkania bez partii gracza. |
| `lantern-10` | ≥ 10 partii na ostatnim miejscu, także wspólnym. Ostatnie miejsce oznacza, że nikt nie jest niżej w rankingu, a nie `place = liczba_graczy`. |
| `pts-100`, `pts-500` | Suma zapisanych punktów leaderboardu, po uśrednianiu remisów z `floor`. |
| `voter-10` | ≥ 10 różnych spotkań, na których gracz ma obecnie ≥ 1 głos. Wiele gier i ponowne otwarcie głosowania w jednym spotkaniu nie zwiększają licznika. |

### Rekordy i trwałość `record`

Rekord gry oznacza największą liczbową wartość kategorii decydującej ze snapshotu partii, zgodnie z określeniem „najwyższy wynik” w GAME-11. Nie jest to liczba punktów leaderboardu. Przy kierunku „mniej = lepiej” nadal mierzy najwyższy wynik liczbowy, a zwycięzcę wyznaczamy osobno. Zmiana kategorii w przyszłych wersjach nie resetuje historii rekordów gry w MVP.

Pierwsza zapisana partia ustanawia rekord. W kolejnych partiach wymagane jest ścisłe przekroczenie poprzedniego maksimum. Samo wyrównanie rekordu nie odblokowuje `record`. Jeśli kilku graczy w jednej partii osiągnie to samo nowe maksimum, wszyscy ustanawiają rekord, niezależnie od reguł miejsc i tie-breakerów. GAME-11 pokazuje wszystkich współrekordzistów aktualnego maksimum, również gdy pochodzi ono z różnych partii, oraz daty ich wyników.

„Zostaje na zawsze” oznacza, że późniejsze pobicie rekordu nie odbiera osiągnięcia. Usunięcie partii źródłowej jest korektą historii: rekordy i `record` odtwarzamy od nowa z pozostałych partii. Osiągnięcie może zniknąć albo uzyskać inną datę i źródło. Nie przechowujemy wieczystego odblokowania opartego na usuniętym wyniku. Ta reguła zachowuje PRD §5.6.5.

### Momenty przeliczania

Po zapisaniu lub usunięciu partii przeliczamy osiągnięcia na podstawie aktualnej historii. Korekta może wpłynąć także na późniejszych graczy, zwłaszcza rekordzistów, a nie tylko uczestników usuniętej partii. Zakończenie spotkania przelicza jego uczestników i potwierdza `flawless`. Jeśli dodatek RUN-5 zostanie wdrożony, ponowne otwarcie usuwa potwierdzenie `flawless` do kolejnego zakończenia. Usunięcie gry lub konta nie kasuje zachowanych wyników ani osiągnięć historycznych.

`voter-10` przeliczamy **w tej samej transakcji co dodanie lub cofnięcie głosu**, bez czekania na zapis partii lub zakończenie spotkania. Usunięcie spotkania, uczestnika z planowanego spotkania lub gry, jeśli kasuje głosy, również uruchamia przeliczenie dotkniętych graczy. Po cofnięciu ostatniego głosu w dziesiątym spotkaniu osiągnięcie znika. Data odblokowania pochodzi z dziesiątego kwalifikującego się spotkania w porządku `(starts_at, id)`, nawet gdy jest to termin przyszły. Nie jest datą kliknięcia. Zmiana terminu spotkania ponownie wyznacza kolejność i daty osiągnięć.

## Pierwszeństwo źródeł UI i zakres

PRD określa zachowanie, zakres i uprawnienia. DS określa wygląd. W DS późniejsza szczegółowa sekcja ma pierwszeństwo nad wcześniejszym ogólnym stwierdzeniem: §17 definiuje ilustrację pierwszego uruchomienia mimo §14, a §18 definiuje switch mimo §10. Nie rozszerza to uprawnień prowadzącego. Brak ciemnych artboardów nie usuwa wymagania dwóch motywów, które realizuje #9.

MVP obejmuje M i S przy wdrażaniu danej funkcji. Dodatki C pozostają w E8. Wyłączenia z PRD §1.2 pozostają w mocy, w tym brak solo, wielu klubów, samodzielnej rejestracji, synchronizacji notesu na żywo i edycji zapisanych karteczek.

## Weryfikacja zadania #4

| Kryterium | Wynik i miejsce decyzji |
|---|---|
| React/Preact, dwa POC, brakujące źródła designu | React; przypięte rewizje i podział integracji powyżej; stan i ścieżki eksportów w `design/README.md`. |
| Uprawnienia menu prowadzącego | Admin dodaje uczestników i zmienia prowadzącego; DS §15 skorygowany. |
| Najlepsza gra, rekordy, porządek, snapshot, usunięcie prowadzącego | Jednoznaczne reguły i rozstrzyganie remisów w tym dokumencie, odwołania z PRD. |
| Katalog, usunięcie źródła `record`, `voter-10` | 29 osiągnięć; odtwarzanie po korekcie historii; głosy przeliczane transakcyjnie. |
| Pierwszeństwo DS, gałąź, Q2, Q11 | DS §17/18; `master`; minimum 2 graczy; ostatnio grane przed ostatnio dodanymi. |

Weryfikacja dokumentacyjna obejmuje zgodność z PRD §1–4, §5.10, §8, §11–12 i DS §0, §9–10, §14–18, kompletność 29 identyfikatorów oraz istnienie lokalnych odsyłaczy. Nie zmieniamy kodu, SQL ani UI, więc testy wykonawcze i odbiór widoków od 360 px nie dotyczą tego PR. Przyszłe testy według NFR-11 muszą objąć: remisy najlepszej gry; równoczesne zapisy i rekordy; usunięcie źródła rekordu; edycję punktacji po utworzeniu szkicu; odebranie dostępu prowadzącemu; dziesiąty głos i cofnięcie ostatniego głosu; wspólne ostatnie miejsce; minimum dwóch graczy i kolejność Q11.
