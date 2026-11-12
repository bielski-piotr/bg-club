# PRD — BG Club

| | |
|---|---|
| **Produkt** | BG Club — aplikacja webowa dla klubu planszówkowego |
| **Wersja dokumentu** | 1.2 |
| **Data** | 2026-11-12 |
| **Status** | Do akceptacji |
| **Powiązane repozytoria** | `digital-scorepad-poc` (notes punktacji 3D `<score-pad>`), `digital-scorepad-editor-poc` (edytor notesu `<score-pad-editor>`) |

---

## 1. Cel i kontekst

BG Club pomaga jednemu klubowi miłośników gier planszowych:

1. **organizować spotkania**: planowanie, lista uczestników, głosowanie na gry,
2. **liczyć wyniki** partii na cyfrowym notesie punktacji 3D,
3. **prowadzić historię** spotkań i rozegranych partii (oderwane karteczki z notesu),
4. **dawać powód do rywalizacji**: leaderboardy (punkty, wygrane, najdłuższa seria zwycięstw),
5. **zachęcać do kolejnych spotkań** przez osiągnięcia.

### 1.1 Założenia produktowe

- Jedna instancja aplikacji obsługuje **jeden klub**. Wiele klubów nie jest planowane. Klub zakłada administrator przy pierwszym uruchomieniu aplikacji (CLUB-1…CLUB-4).
- Aplikacja jest na użytek własny i nie będzie oferowana jako produkt. Repozytorium może zostać upublicznione, więc w kodzie nie ma sekretów, a konfigurację podaje się przez zmienne środowiskowe.
- Infrastruktura: **Supabase** (Postgres, Auth, Storage, Edge Functions) i **Cloudflare Pages** (hosting statycznego frontendu).
- Interfejs **po polsku**. Wszystkie teksty są w jednym module, żeby dało się je później przetłumaczyć.
- Projektowanie **mobile-first**, aplikacja instalowalna jako **PWA**, działa też na desktopie.

### 1.2 Poza zakresem (MVP)

- Wiele klubów, rejestracja samodzielna, goście bez konta.
- Synchronizacja kartki notesu między urządzeniami w czasie rzeczywistym (partię prowadzi się na jednym urządzeniu).
- Zapisywanie partii bez notesu punktacji (np. ręczne wpisanie kolejności miejsc).
- Reset zapomnianego hasła (w razie potrzeby ręcznie w panelu Supabase).
- Sezony (jest tylko filtr roku).
- Edycja wpisów na oderwanej karteczce (można tylko usunąć partię).
- Powiadomienia e-mail i push.
- Import gier z BoardGameGeek.
- Nadawanie roli administratora innym graczom.

---

## 2. Role i uprawnienia

| Rola | Opis |
|---|---|
| **Gracz** | Członek klubu z kontem. Przegląda wszystko, głosuje na gry, edytuje wyłącznie własne konto. |
| **Administrator** | Dokładnie jeden, tworzony przy instalacji. Jest też graczem. Ma CRUD na grach, notesach, spotkaniach i członkach (z ograniczeniami opisanymi niżej). |
| **Prowadzący spotkania** | Uprawnienie przypisywane per spotkanie. Domyślnie ma je administrator. Gdy administratora nie będzie na spotkaniu, może wskazać jednego uczestnika jako prowadzącego. |

### 2.1 Macierz uprawnień

| Działanie | Gracz | Prowadzący (w swoim spotkaniu) | Admin |
|---|:-:|:-:|:-:|
| Przeglądanie klubu, leaderboardów, kolekcji, historii, profili | ✔ | ✔ | ✔ |
| Głosowanie na gry w spotkaniu, w którym jest uczestnikiem | ✔ | ✔ | ✔ |
| Edycja własnego profilu (imię, nazwisko, awatar, motyw, hasło) | ✔ | ✔ | ✔ |
| Usunięcie własnego konta | ✔ | ✔ | ✘ |
| Dodawanie, edycja i usuwanie gier oraz notesów | ✘ | ✘ | ✔ |
| Dodawanie i usuwanie członków | ✘ | ✘ | ✔ |
| Edycja cudzego konta | ✘ | ✘ | ✘ |
| Planowanie i edycja spotkania, zamykanie głosowania, publikacja gier | ✘ | ✘ | ✔ |
| Wskazanie prowadzącego | ✘ | ✘ | ✔ |
| Rozpoczęcie i zakończenie spotkania | ✘ | ✔ | ✔ |
| Prowadzenie partii (notes: wpisywanie, oderwanie karteczki) | ✘ | ✔ | ✔ |
| Usunięcie zapisanej partii | ✘ | ✘ | ✔ |

---

## 3. Słownik

| Pojęcie | Znaczenie |
|---|---|
| **Klub** | Jedyny klub obsługiwany przez instancję aplikacji: nazwa, opcjonalne logo i strefa czasowa. Zakładany przez administratora przy pierwszym uruchomieniu. |
| **Spotkanie** | Zaplanowane wydarzenie klubowe: data, godzina, tytuł, uczestnicy, głosowanie, partie. |
| **Partia** | Jedna rozgrywka jednej gry w ramach spotkania, zapisana z jednej karteczki notesu. |
| **Notes (szablon notesu)** | Plik `score-pad` (format v2) przypisany do gry: zdjęcie kartki, kategorie, pola, reguła miejsc i remisów. |
| **Karteczka** | Wypełniona i oderwana kartka notesu, czyli zapis partii. Przechowywana razem ze snapshotem szablonu. |
| **Punktacja miejsc** | Lista punktów leaderboardu za miejsca 1…max_graczy, definiowana per gra. |
| **Seria zwycięstw** | Liczba kolejnych spotkań (z udziałem gracza), na których gracz wygrał co najmniej jedną partię. |
| **Hook** | Unikalny identyfikator gracza, np. `jan-kowalski-3f9a`. Służy do logowania. |

---

## 4. Architektura informacji i nawigacja

- **Ekran logowania**: hook i hasło.
- **Widok Klubu**: główny hub i jedyny pełnoekranowy widok po zalogowaniu. Składa się z widżetów:
  1. Aktywne/najbliższe spotkanie
  2. Leaderboard
  3. Timeline spotkań
  4. Kolekcja gier
  5. Członkowie
  Kolejność i układ na desktopie (siatka) i mobile (kolumna) zostaną ustalone w projekcie UI.
  Dopóki klub nie został założony (pierwsze uruchomienie na pustej bazie), w miejscu widżetów jest pusty stan z ilustracją i przyciskiem **Dodaj klub** (CLUB-1). Po założeniu klubu widżety pojawiają się z własnymi pustymi stanami (CLUB-4).
- **Popupy** (modale, na telefonie pełnoekranowe arkusze) otwierane z widżetów przez „Zobacz więcej”, kliknięcie elementu albo awatara:
  - Leaderboard (pełny)
  - Kolekcja gier → szczegóły gry → (admin) dodanie/edycja gry → edytor notesu
  - Kalendarz spotkań → widok spotkania → partia (notes) → karteczka
  - Członkowie → (admin) dodanie członka
  - Profil gracza → ustawienia (tylko właściciel)
- Popupy można zagnieżdżać (stos). Każdy popup ma własny adres (np. `?p=game/{id}` albo `#/game/{id}`), więc działa przycisk „wstecz” w przeglądarce i na telefonie, a link do popupu można wysłać.
- **Kliknięcie awatara gracza w dowolnym miejscu** otwiera popup profilu tego gracza.

---

## 5. Wymagania funkcjonalne

Priorytety: **M** (must, MVP), **S** (should), **C** (could).

### 5.1 Uwierzytelnianie, konta i pierwsze uruchomienie

| ID | Wymaganie | P |
|---|---|:-:|
| AUTH-1 | Logowanie hookiem i hasłem. Technicznie konto Supabase Auth ma e-mail `<hook>@users.bgclub.invalid`, którego użytkownik nigdy nie widzi. | M |
| AUTH-2 | Rejestracja samodzielna jest wyłączona. Konta tworzy wyłącznie administrator (Edge Function z kluczem service role). | M |
| AUTH-3 | Pierwsze konto administratora powstaje przy instalacji (skrypt seed z danymi ze zmiennych środowiskowych). W systemie jest dokładnie jeden administrator. | M |
| AUTH-4 | Przy dodaniu członka system generuje losowe hasło (min. 12 znaków, generator kryptograficzny) i pokazuje je **jednorazowo** z przyciskiem „Kopiuj”. | M |
| AUTH-5 | Sesja trwa do wylogowania (odświeżanie tokenu Supabase). | M |
| AUTH-6 | Przy pierwszym logowaniu aplikacja proponuje zmianę wygenerowanego hasła (można pominąć). | S |
| AUTH-7 | Konto usunięte nie może się zalogować. | M |
| CLUB-1 | **Pierwsze uruchomienie na pustej bazie.** Po wdrożeniu baza zawiera tylko konto administratora (AUTH-3), bez klubu, członków, gier i spotkań. Aplikacja startuje normalnie od ekranu logowania. Po zalogowaniu się administratora widok Klubu nie pokazuje widżetów: w ich miejscu, wyśrodkowana, jest **ilustracja** (np. stół z planszówkami, w stylu aplikacji, w wersji jasnej i ciemnej), krótki tekst powitalny i pod nimi przycisk **Dodaj klub**. Nagłówek aplikacji zawiera tylko awatar administratora (profil, ustawienia, wylogowanie). | M |
| CLUB-2 | **Dodaj klub** otwiera popup z formularzem: **nazwa klubu** (wymagana), opcjonalnie **logo** (upload jak okładka gry, GAME-6; bez logo monogram nazwy) oraz **strefa czasowa** (wymagana, lista stref IANA, domyślnie strefa przeglądarki admina, a gdy jej brak `Europe/Warsaw`; NFR-10). Zapis tworzy jedyny rekord klubu. Drugi klub nie może powstać: przycisk znika, a baza odrzuca kolejny rekord. Nazwę, logo i strefę czasową admin może później zmienić z nagłówka widoku Klubu. Zmiana strefy zmienia tylko sposób wyświetlania dat i granice roku w filtrach, a nie zapisane terminy spotkań. | M |
| CLUB-3 | Gracz (nie-admin) zalogowany przed założeniem klubu widzi tę samą ilustrację z tekstem „Klub nie został jeszcze założony” bez przycisku. W praktyce się to nie zdarza, bo członków dodaje się dopiero z widżetu Członkowie. | M |
| CLUB-4 | Po zapisaniu klubu widok Klubu pokazuje nazwę i logo w nagłówku oraz wszystkie widżety, każdy z **pustym stanem** i akcją dla admina: Aktywne spotkanie: „Zaplanuj spotkanie” (MTG-1); Leaderboard: „Ranking pojawi się po pierwszej partii”; Timeline: „Brak spotkań”; Kolekcja: „Dodaj grę”; Członkowie: sam admin i „Dodaj członka”. | M |

### 5.2 Użytkownik i profil

**Model użytkownika:** awatar (domyślnie monogram), imię, nazwisko, hook, rola, motyw, data dołączenia, znacznik usunięcia.

| ID | Wymaganie | P |
|---|---|:-:|
| USR-1 | Hook powstaje przy tworzeniu konta z imienia i nazwiska (małe litery, transliteracja polskich znaków, myślniki) plus 4-znakowy hash, np. `Łukasz Żółw` → `lukasz-zolw-7c1e`. Jest unikalny i **niezmienny**, także po zmianie imienia lub nazwiska. | M |
| USR-2 | Domyślny awatar to monogram (inicjały) na kolorze wyliczonym deterministycznie z hooka. | M |
| USR-3 | Użytkownik może wgrać własny awatar (JPG/PNG/WebP). Obraz jest kadrowany do kwadratu i skalowany w przeglądarce (np. 256×256 WebP) przed wysłaniem do Supabase Storage. Może też wrócić do monogramu. | M |
| USR-4 | Popup profilu pokazuje: awatar, imię i nazwisko, hook, statystyki (§5.9) i gablotę osiągnięć (§5.10). | M |
| USR-5 | Właściciel konta widzi w profilu przycisk **Ustawienia**: edycja imienia, nazwiska i awatara; motyw (jasny / ciemny / systemowy); zmiana hasła (stare hasło + nowe ×2); wylogowanie; usunięcie konta. | M |
| USR-6 | Usunięcie własnego konta wymaga potwierdzenia hasłem. Administrator nie widzi tej opcji (nie może usunąć swojego konta). | M |
| USR-7 | Administrator nie może edytować kont innych użytkowników. | M |
| USR-8 | Motyw jest zapisywany w profilu (działa na każdym urządzeniu) i podręcznie w `localStorage`, żeby nie migał przy starcie. | M |

### 5.3 Członkowie

| ID | Wymaganie | P |
|---|---|:-:|
| MEM-1 | **Widżet:** rząd nachodzących na siebie awatarów, maksymalnie 5 pozycji. Przy więcej niż 5 członkach pokazuje 4 awatary, a piąta pozycja to licznik `+N` (N = pozostali członkowie). Przy 5 lub mniej członkach pokazuje wszystkie awatary. Kliknięcie widżetu otwiera popup członków. | M |
| MEM-2 | **Popup:** pełna lista aktywnych członków (awatar, imię i nazwisko, hook, oznaczenie admina) z wyszukiwaniem. Kliknięcie otwiera profil. | M |
| MEM-3 | Admin: **Dodaj członka** (imię, nazwisko, opcjonalnie awatar). Po zapisie pokazuje hook i wygenerowane hasło (AUTH-4). | M |
| MEM-4 | Admin: **Usuń członka** (z potwierdzeniem). Usunięcie jest miękkie: profil zostaje w historii, na karteczkach i w statystykach. Konto Auth jest blokowane lub usuwane. Administratora nie da się usunąć. | M |
| MEM-5 | Usunięci członkowie nie są pokazywani w widżecie i na liście członków. Ich awatary w historii są wyszarzone z dopiskiem „(usunięty)”, a profil otwiera się w trybie tylko do odczytu. | M |
| MEM-6 | Usuniętego członka nie można dodać do nowego spotkania. Z zaplanowanych, nierozpoczętych spotkań jest usuwany automatycznie. | M |

### 5.4 Kolekcja gier

**Model gry:** tytuł, okładka, min. liczba graczy, max. liczba graczy, punktacja za miejsca, notesy (0…n), znacznik usunięcia.

| ID | Wymaganie | P |
|---|---|:-:|
| GAME-1 | **Widżet:** kilka (domyślnie 5) tytułów z okładkami (ostatnio dodane albo ostatnio grane, do decyzji w UI) i link „Zobacz więcej”. | M |
| GAME-2 | **Popup kolekcji:** pełna lista gier (siatka okładek) z wyszukiwaniem po tytule, bez rozróżniania wielkości liter i polskich znaków (`unaccent`), filtrowanym na bieżąco. | M |
| GAME-3 | Admin widzi przycisk **Dodaj grę**, a przy każdej grze **Edytuj** i **Usuń**. Dodanie i edycja otwierają formularz w tym samym popupie (zmiana widoku, ze strzałką „wstecz”). | M |
| GAME-4 | Walidacja: tytuł wymagany; `1 ≤ min ≤ max`. Aplikacja **nie ma górnego limitu** liczby graczy: o tym, ilu graczy zmieści się w partii, decyduje liczba miejsc dla graczy zdefiniowana w notesie (PAD-3, EDT-8). | M |
| GAME-5 | **Punktacja za miejsca:** formularz wymaga podania punktów dla **każdego miejsca od 1 do max. liczby graczy**. Zmiana „max” dodaje lub usuwa pola. Wartości to liczby całkowite ≥ 0. Gdy punkty nie są nierosnące, formularz pokazuje ostrzeżenie (bez blokady). W partii z *n* graczami liczą się miejsca 1…*n* z tej listy. | M |
| GAME-6 | Okładka: upload do Supabase Storage, skalowanie w przeglądarce (np. dłuższy bok 800 px, WebP). Bez okładki gra ma placeholder z monogramem tytułu. | M |
| GAME-7 | **Notesy gry:** lista notesów przypisanych do gry (nazwa, miniatura). Admin może dodać notes (edytor, §5.5, albo import pliku `.json`), edytować go, zmienić nazwę i usunąć. Liczba notesów na grę jest dowolna. | M |
| GAME-8 | Usunięcie gry jest miękkie: znika z kolekcji, wyszukiwania i głosowań, ale jej partie, karteczki i punkty zostają w historii i statystykach. W historii pokazuje się z oznaczeniem „(usunięta z kolekcji)”. | M |
| GAME-9 | Edycja punktacji lub notesu **nie zmienia** rozegranych partii: każda partia przechowuje snapshot punktacji i szablonu notesu z chwili rozegrania (decyzja Q1, §12). | M |
| GAME-10 | **Szczegóły gry** (kolejny widok popupu): okładka, dane gry, statystyki gry i galeria wszystkich oderwanych karteczek tej gry (od najnowszej). Kliknięcie karteczki pokazuje ją w powiększeniu z wynikami i linkiem do spotkania. | M |
| GAME-11 | Statystyki gry: liczba partii, data ostatniej partii, najczęstszy zwycięzca, najwyższy wynik w historii (kto, kiedy), średni wynik zwycięzcy, ranking graczy w tej grze (wygrane, punkty). | M |
| GAME-12 | W szczegółach gry widać liczbę głosów oddanych na nią we wszystkich głosowaniach. | C |

### 5.5 Notes punktacji i edytor notesu: integracja

Bazą są istniejące POC: `<score-pad>` (notes 3D, Three.js) i `<score-pad-editor>` (edytor: zdjęcie → kształt → pola). Poniżej zmiany potrzebne w BG Club.

#### 5.5.1 Notes (`<score-pad>`) w trybie klubowym

| ID | Wymaganie | P |
|---|---|:-:|
| PAD-1 | Notes jest osadzany w popupie partii z szablonem wczytanym z bazy, a nie z `localStorage` ani IndexedDB. Lokalne szablony i historia notesu są w tym trybie wyłączone. | M |
| PAD-2 | **Wybór graczy zamiast wpisywania imion.** Przed rozpoczęciem partii prowadzący wybiera graczy spośród uczestników spotkania i przypisuje ich do miejsc (kolumn/wierszy) notesu. Kategoria typu `names` nie otwiera klawiatury, tylko selektor uczestnika. Na kartce pole gracza pokazuje **awatar + imię i nazwisko**. | M |
| PAD-3 | Liczba graczy partii musi mieścić się w zakresie min…max gry i nie może przekraczać liczby miejsc dla graczy w notesie. Niepasujące notesy są niedostępne do wyboru, z wyjaśnieniem dlaczego. | M |
| PAD-4 | Stan wypełnianej kartki jest zapisywany na bieżąco jako **szkic partii** w bazie (z opóźnieniem, np. 1–2 s) i w `localStorage`. Odświeżenie strony ani awaria przeglądarki nie gubią wpisów. Szkic może dokończyć admin lub prowadzący na innym urządzeniu, ale bez synchronizacji na żywo. | M |
| PAD-5 | **Oderwanie karteczki** kończy partię: notes wylicza wyniki kategorii i miejsca według reguł szablonu (§5.5.2) i pokazuje podsumowanie (miejsca, wyniki, punkty leaderboardu). Po potwierdzeniu partia trafia do bazy. Można też anulować i wrócić do kartki. | M |
| PAD-6 | Przy oderwaniu notes generuje **obraz karteczki** (PNG/WebP z tekstury kartki, z pismem), który trafia do Storage jako miniatura i podgląd w historii. Razem z nim zapisywane są pełne dane kartki (`SheetData`) i snapshot szablonu, więc karteczkę można później wyrenderować ponownie, także w 3D w trybie tylko do odczytu. | M |
| PAD-7 | Notes emituje zdarzenie z pełnym wynikiem, zamiast obecnego `scorepad:save` z samymi nazwami: `{ players: [{ profileId, seat, values: {kategoria: wartość}, totals, place, tiedWith }], sheet, snapshotImage }`. | M |
| PAD-8 | Partię w toku można porzucić. Szkic jest wtedy usuwany i nie liczy się do statystyk. | M |
| PAD-9 | Notes jest dostępny tylko w spotkaniu **w trakcie** i tylko dla admina lub prowadzącego. Pozostali widzą listę partii w toku jako „trwa partia: {gra}”. | M |
| PAD-10 | **Notes jako obiekt 3D z obrotem.** Notes (blok kartek z grzbietem i tekturą) jest bryłą w scenie, którą można swobodnie obracać: w każdej osi bez ograniczeń, także tak, żeby zobaczyć **tył notesu** (tekturowy spód bloku). Gdy wierzchnia kartka nie jest zwrócona do widza, wpisywanie i odrywanie są nieaktywne, a przycisk „Widok z góry” (PAD-12) wraca do kartki. **Telefon:** jeden palec pisze i odrywa kartkę jak dotąd, a obrót wykonuje się **dwoma palcami** (przesuwanie poziomo obraca, pionowo nachyla, skręt palców obraca wokół osi pionowej). **Mysz:** przeciąganie **prawym przyciskiem** albo lewym przyciskiem poza notesem. Wpisywanie i odrywanie działają przy każdym położeniu, w którym widać wierzchnią kartkę. | M |
| PAD-11 | **Dowolny zoom.** Szczypanie na telefonie, kółko myszy (bez Ctrl) i touchpad przybliżają i oddalają widok względem punktu pod palcami lub kursorem, od całego notesu do zbliżenia pojedynczego pola (co najmniej 6×). Zastępuje to obecny wąski zakres 0,55–1,35 z Ctrl+kółko. | M |
| PAD-12 | **Widok domyślny „z góry”.** Kamera patrzy na notes prostopadle z góry (nachylenie 0°, a nie 7° jak w POC) i jest oddalona tak, żeby cały notes mieścił się w kadrze z niewielkim marginesem. Tak notes otwiera się zawsze. Przycisk **Widok z góry** na pasku notesu płynnie przywraca to położenie po obrocie lub zoomie (także skrót klawiszowy, np. `0`). Automatyczne odsuwanie kamery przy podnoszeniu kartki (`autoZoom`) działa tylko w widoku domyślnym. | M |
| PAD-13 | **Wpisywanie na telefonie.** Dotknięcie pola kategorii punktowej zaznacza je na kartce i od razu otwiera **systemową klawiaturę numeryczną** (`inputmode="numeric"`, `enterkeyhint="next"`). Nie ma własnej klawiatury ekranowej ani okna wyboru wartości. Pole ma przycisk zmiany znaku (±) dla wartości ujemnych. | M |
| PAD-14 | **Wpisywanie na komputerze.** Kliknięcie pola tylko je zaznacza (podświetlenie na kartce), bez klawiatury ekranowej i bez okna dialogowego. Cyfry wpisywane z **klawiatury sprzętowej** pojawiają się od razu w tym polu na kartce (minus zmienia znak, Backspace kasuje, Esc anuluje zmianę, strzałki góra/dół zmieniają o krok). | M |
| PAD-15 | **Szybkie wpisywanie kolejnych kategorii.** Zatwierdzenie wyniku (Enter, „Dalej” na klawiaturze systemowej albo Tab) zapisuje wartość i przenosi fokus do **następnej kategorii punktowej tego samego gracza** (pomija pola imion, sumy i pola bez wpisu). Po ostatniej kategorii gracza fokus przechodzi do pierwszej kategorii następnego gracza. Shift+Tab cofa. Na telefonie klawiatura systemowa pozostaje otwarta między polami, a widok przewija się do zaznaczonego pola, jeśli wychodzi ono poza kadr. Wpis spoza zakresu kategorii (min/max, lista wartości) nie przechodzi dalej i pokazuje błąd przy polu. | M |
| PAD-16 | **Jakość tekstury kartki.** Tekstura jest tworzona z obrazu kartki w **pełnej rozdzielczości zapisanej przez edytor** (EDT-12), bez dodatkowego skalowania w dół przy uruchomieniu notesu. Ograniczeniem jest tylko `maxTextureSize` urządzenia (dłuższy bok do 4096 px na urządzeniach, które to obsługują). Tekstura ma mipmapy i maksymalną anizotropię, a pismo (atrament) jest rysowane w tej samej rozdzielczości. Renderer używa pełnego `devicePixelRatio` urządzenia (limit np. 3 zamiast obecnego 2). W POC obraz jest dziś skalowany kilka razy (§8.4). | M |

#### 5.5.2 Edytor notesu: kroki i rozszerzenia

Edytor jest kreatorem z **pięcioma krokami** widocznymi na pasku kroków (bieżący i wykonane są zaznaczone). Do przodu można przejść, gdy bieżący krok jest poprawny. Do wykonanych kroków można wracać bez utraty danych (wyjątek: zmiana trybu mapowania, EDT-11). Edycja istniejącego notesu otwiera kreator z wszystkimi krokami wykonanymi.

1. **Zdjęcie** (EDT-9): wczytanie pliku albo zrobienie zdjęcia.
2. **Obszar kartki** (EDT-10): całe zdjęcie, wykrywanie automatyczne albo ręczne zaznaczanie punktami.
3. **Mapowanie pól** (EDT-11): prostokąty rysowane ręcznie albo automatycznie wykryta tabela.
4. **Kategorie** (EDT-2…EDT-5, EDT-13): nazwy, typy, zakresy, sumy, kategoria decydująca i remisy.
5. **Test i zapis** (EDT-14, EDT-1): podgląd 3D z losowymi danymi, potem zapis.

| ID | Wymaganie | P |
|---|---|:-:|
| EDT-1 | Edytor jest osadzony w popupie gry (admin) w miejscu obecnego eksportu do pliku. **Zapisz** jest dostępne w ostatnim kroku (EDT-14) i zapisuje szablon w bazie, a zdjęcie kartki w Storage (zamiast data URL w JSON). Import i eksport pliku `.json` zostają jako opcje (import w kroku 1). | M |
| EDT-2 | **Kategoria decydująca o miejscu.** W kroku „Kategorie” admin wybiera kategorię, która ustala kolejność graczy. Może to być **dowolna kategoria punktowa** (`input`) albo suma (`total`), nie tylko suma końcowa. Domyślnie jest to suma, której nie sumuje żadna inna suma (obecne zachowanie notesu). | M |
| EDT-3 | **Kierunek** kategorii decydującej (krok „Kategorie”): „więcej = lepiej” (domyślnie) albo „mniej = lepiej” (np. gry, w których wygrywa najmniejszy wynik). | S |
| EDT-4 | **Reguły rozstrzygania remisów** (krok „Kategorie”): uporządkowana lista reguł stosowanych **hierarchicznie**. Reguła *k+1* dotyczy wyłącznie graczy nadal zremisowanych po regułach 1…*k*, czyli działa też na **remisy w remisach**: jeśli reguła 1 rozbije remis trzech graczy na 1 + remis dwóch, reguła 2 rozstrzyga już tylko ten drugi. Typy reguł: **kategoria** (wybrana kategoria + kierunek) i **wspólne miejsce** (remis zostaje). Za ostatnią regułą zawsze jest niejawne „wspólne miejsce”. | M |
| EDT-5 | Reguła typu **„rozstrzyga prowadzący”**: przy oderwaniu karteczki prowadzący ręcznie ustala kolejność graczy nadal zremisowanych (np. według zasady z instrukcji, której nie da się zapisać w notesie). | C |
| EDT-6 | Edytor ostrzega, gdy notes ma mniej miejsc dla graczy niż max. liczba graczy gry. Takiego notesu można używać tylko w mniejszych partiach. | M |
| EDT-7 | Format pliku notesu zostaje rozszerzony wstecznie zgodnie: `template.ranking = { line: string, dir: "desc"\|"asc", tiebreak: [{ type: "line", line, dir } \| { type: "manual" } \| { type: "shared" }] }`. Starsze pliki bez `ranking` działają jak dotąd (najwyższa suma końcowa). | M |
| EDT-8 | **Brak limitu graczy.** Edytor i notes nie ograniczają liczby graczy: notes ma tyle miejsc dla graczy, ile admin zdefiniuje w edytorze (kolumny/wiersze tabeli albo pola dowolne). Obecny limit `MAX_PLAYERS = 8` z POC jest usuwany z notesu, edytora i walidacji pliku notesu. Interfejs notesu (wybór graczy, wpisywanie, podsumowanie) musi działać przy dowolnej liczbie graczy, np. z przewijaniem list. | M |
| EDT-9 | **Krok 1: Zdjęcie.** Wczytanie pliku (przeciągnięcie, wybór z dysku, wklejenie ze schowka) albo **zrobienie zdjęcia**: na telefonie aparat systemowy (aparat tylny), na komputerze kamera internetowa z podglądem, jeśli jest dostępna. W tym kroku można też zaimportować plik notesu `.json`. | M |
| EDT-10 | **Krok 2: Obszar kartki.** Obszar jest wielokątem na zdjęciu. Trzy tryby wyboru: **Całe zdjęcie** (prostokąt na całym kadrze, np. dla skanu); **Wykryj automatycznie** (wykrywa także **nieregularne kształty** karteczek: zaokrąglone rogi, wycięcia, kartki nieprostokątne, a nie tylko cztery narożniki); **Ręcznie**: przeciąganie punktów obszaru (z lupą przy przeciąganiu), **dodawanie nowych punktów** (kliknięcie lub dotknięcie krawędzi wstawia punkt) i usuwanie punktów (dwuklik lub przytrzymanie). Wynik automatyczny można poprawiać ręcznie. Opcja **Wygładź krawędzie** (z siłą, np. 0–10) dodaje punkty pośrednie dla płynnych przejść między punktami. Prostowanie perspektywy opiera się na czterech narożnikach wyznaczonych z obszaru. W tym kroku zostają też narzędzia z POC: obrót zdjęcia o 90° w lewo i w prawo, rozmiar kartki w centymetrach, orientacja (gdzie jest grzbiet notesu: u góry albo z lewej) i cofnij (Ctrl+Z). Różdżka i lasso z POC są usuwane. Tu ustawia się też **nazwę notesu** i **kolor grzbietu**. | M |
| EDT-11 | **Krok 3: Mapowanie pól.** Pola dodaje się w jednym z dwóch **wykluczających się** trybów: **Prostokąty ręczne** (rysowanie prostokątów; po każdym prostokącie edytor przechodzi do następnej kategorii tego samego gracza, a gotowe pola można powielić dla kolejnego gracza) albo **Wykryj tabelę** (wiersze i kolumny wykryte ze zdjęcia, z możliwością poprawy linii i wyboru, czy gracze są w kolumnach czy w wierszach). Trybów nie można mieszać: przełączenie na drugi tryb, gdy są już pola, pokazuje **popup z ostrzeżeniem**, że dotychczasowe pola i kategorie zostaną usunięte, i dopiero po potwierdzeniu je kasuje. Kategorie są w tym kroku **proste**: mają tylko numer i automatyczną nazwę (np. „Kategoria 3”) oraz przypisane pola dla każdego miejsca gracza, bez typu i szczegółów. Edytor pokazuje liczbę miejsc dla graczy i kategorii. | M |
| EDT-12 | **Rozdzielczość zdjęcia kartki.** Edytor przechowuje i zapisuje wyprostowaną kartkę w rozdzielczości zdjęcia źródłowego, z limitem dłuższego boku 4096 px (zamiast obecnych 2400 px źródła i 1600 px kartki), w WebP lub JPEG o jakości ≥ 0,92. Mniejsze zdjęcie nie jest powiększane. Wymaganie jest podstawą jakości tekstury w notesie (PAD-16). | M |
| EDT-13 | **Krok 4: Kategorie.** Dla każdej kategorii z kroku 3 admin ustala: **nazwę**, **typ** (nazwa gracza, punktacja, suma, puste pole), opcjonalny opis (chmurka w notesie). Dla **punktacji**: zakres **dowolny** albo ograniczony (min, max, krok) albo lista dozwolonych wartości. Dla **sumy**: z których kategorii jest liczona (także z innych sum, bez cykli). W tym kroku wybiera się też **kategorię decydującą o wygranej** (EDT-2, EDT-3) i **reguły rozstrzygania remisów** (EDT-4, EDT-5). Walidacja: dokładnie jedna kategoria typu „nazwa gracza” i co najmniej jedna kategoria punktowa. | M |
| EDT-14 | **Krok 5: Test i zapis.** Widok notesu 3D taki jak w partii (PAD-10…PAD-16), z fikcyjnymi graczami „Gracz 1…n” zamiast członków klubu. Przycisk **Wypełnij losowo** wpisuje losowe wartości zgodne z zakresami kategorii (z możliwością wymuszenia remisu, żeby sprawdzić reguły remisów). Można też wpisywać ręcznie i oderwać karteczkę, żeby zobaczyć podsumowanie (miejsca, remisy), ale **oderwane karteczki nie są zapisywane** ani nie trafiają do historii. **Zapisz** zapisuje notes (EDT-1). Test nie jest wymagany: notes można zapisać od razu po wejściu w ten krok. | M |

### 5.6 Wyliczanie wyników

#### 5.6.1 Miejsca w partii

1. Gracze są sortowani po kategorii decydującej (EDT-2) w wybranym kierunku.
2. Remisy są rozstrzygane hierarchicznie regułami (EDT-4).
3. Gracze nadal zremisowani zajmują **wspólne miejsce**. Kolejny gracz zajmuje pierwsze miejsce po zremisowanych (numeracja „1, 1, 3”).

#### 5.6.2 Punkty leaderboardu

- Gracz na miejscu *k* (bez remisu) dostaje `punktacja[k]` ze snapshotu punktacji gry.
- **Remis:** gracze zremisowani na miejscach *k…k+m−1* dostają `floor( (punktacja[k] + … + punktacja[k+m−1]) / m )`. Kolejny gracz dostaje punkty za miejsce *k+m*.
- **Przykład** (punktacja 10/6/4/2/0, remis dwóch graczy o 1. miejsce): zremisowani dostają `floor((10+6)/2) = 8`, kolejny gracz (miejsce 3) dostaje 4, następni 2 i 0.
- Punkty są wyliczane i zapisywane po stronie bazy (funkcja RPC przy zapisie partii) na podstawie miejsc przysłanych przez notes i snapshotu punktacji. Klient nie przysyła punktów.

#### 5.6.3 Wygrane

- **Wygraną** dostaje każdy gracz na miejscu 1, także przy wspólnym 1. miejscu (każdy remisujący dostaje +1).

#### 5.6.4 Seria zwycięstw

- Spotkania są przetwarzane chronologicznie (data i godzina), osobno dla każdego gracza:
  - gracz rozegrał na spotkaniu ≥ 1 partię i **wygrał ≥ 1** → seria `+1` (najwyżej +1 na spotkanie, niezależnie od liczby wygranych),
  - gracz rozegrał ≥ 1 partię i **nie wygrał żadnej** → seria `= 0`,
  - gracz nie był na spotkaniu albo był, ale nie zagrał żadnej partii → seria **bez zmian** (nieobecność nie przerywa serii).
- **Leaderboard „Seria”** pokazuje **rekord**, czyli najdłuższą serię w historii (albo w wybranym roku). Profil pokazuje rekord i bieżącą serię.
- Usunięcie partii przelicza serie od nowa.

#### 5.6.5 Usunięcie partii (admin)

- Partia (i jej karteczka) jest trwale usuwana po potwierdzeniu. Leaderboardy, statystyki, serie i osiągnięcia przeliczają się, więc osiągnięcie może zostać cofnięte, jeśli przestało być spełnione.

### 5.7 Leaderboard

| ID | Wymaganie | P |
|---|---|:-:|
| LB-1 | Trzy klasyfikacje przełączane zakładkami: **Punkty** (suma punktów), **Wygrane** (liczba wygranych partii), **Seria** (rekord serii zwycięstw). | M |
| LB-2 | **Podium** dla miejsc 1, 2, 3 (awatar, imię, wynik). Pod podium lista miejsc od 4. (pozycja, awatar, imię i nazwisko, wynik). | M |
| LB-3 | **Widżet** pokazuje podium i ograniczoną listę (domyślnie miejsca 4–7). **Popup** („Zobacz więcej”) pokazuje ten sam układ z pełną listą. | M |
| LB-4 | **Filtr roku** w popupie: „Cała historia” (domyślnie) albo wybrany rok kalendarzowy. Dla roku liczą się tylko partie i spotkania z tego roku, a seria jest liczona tylko w obrębie tego roku. Widżet zawsze pokazuje całą historię. | M |
| LB-5 | Klasyfikowani są członkowie z ≥ 1 rozegraną partią (w wybranym zakresie). | M |
| LB-6 | Równe wyniki dają **wspólne miejsce** (numeracja 1, 1, 3). Kilka osób na tym samym stopniu podium jest pokazywanych razem. W obrębie remisu kolejność jest alfabetyczna. | M |
| LB-7 | **Usunięci członkowie** są zawsze na końcu klasyfikacji, bez względu na wynik (między sobą według wyniku), wyszarzeni. Nie stają na podium. | M |

### 5.8 Spotkania

**Model spotkania:** tytuł, data, godzina, uczestnicy, prowadzący (opcjonalnie), głosowanie (otwarte/zamknięte), wybrane gry, status, partie.

**Statusy:** `Zaplanowane` → `W trakcie` → `Zakończone`. Głosowanie jest osobną flagą (otwarte/zamknięte) w statusie `Zaplanowane`.

#### 5.8.1 Widżety

| ID | Wymaganie | P |
|---|---|:-:|
| MTG-1 | **Aktywne/najbliższe spotkanie:** pokazuje spotkanie *w trakcie*, a gdy takiego nie ma, najbliższe nadchodzące. Zawiera tytuł, datę i godzinę, awatary uczestników oraz stan (głosowanie otwarte / wybrane gry / w trakcie: liczba partii). Kliknięcie otwiera popup spotkania. Gdy nie ma żadnego spotkania, pokazuje pusty stan, a admin widzi przycisk „Zaplanuj spotkanie”. | M |
| MTG-2 | Jednocześnie może trwać tylko jedno spotkanie. | M |
| MTG-3 | **Timeline:** maksymalnie 2 najbliższe nadchodzące spotkania, divider („dziś”), maksymalnie 4 ostatnie odbyte spotkania. Każda pozycja ma datę, tytuł i liczbę uczestników, a odbyte także zwycięzców i liczbę partii. Kliknięcie pozycji otwiera spotkanie, a „Zobacz więcej” otwiera kalendarz. | M |

#### 5.8.2 Kalendarz

| ID | Wymaganie | P |
|---|---|:-:|
| CAL-1 | Widok miesiąca (nawigacja ‹ ›, przycisk „Dziś”). Na kafelku dnia widać spotkania tego dnia (tytuł, kolor zależny od statusu), klikalne. | M |
| CAL-2 | Na telefonie kalendarz może przejść w widok listy lub agendy, jeśli siatka miesiąca będzie nieczytelna. | S |
| CAL-3 | Admin: przycisk **Zaplanuj spotkanie** oraz kliknięcie pustego dnia (z wypełnioną datą). | M |

#### 5.8.3 Planowanie i edycja (admin)

| ID | Wymaganie | P |
|---|---|:-:|
| PLAN-1 | Formularz: **tytuł**, **data**, **godzina**, **uczestnicy** (wielokrotny wybór z aktywnych członków), opcjonalnie **prowadzący** (jeden z uczestników innych niż admin). | M |
| PLAN-2 | Zapisanie zaplanowanego spotkania **otwiera głosowanie** na gry. | M |
| PLAN-3 | Admin może dowolnie edytować zaplanowane spotkanie (wszystkie pola, uczestników i prowadzącego), także po zamknięciu głosowania. Może też je usunąć, a usunięcie kasuje głosy. | M |
| PLAN-4 | W spotkaniu *w trakcie* admin może dodać uczestnika (np. spóźnionego gościa klubu) i zmienić prowadzącego. Nie może usunąć uczestnika, który ma już partię. | S |
| PLAN-5 | Spotkania zakończonego nie można usunąć, dopóki ma partie (decyzja Q4, §12). | M |

#### 5.8.4 Głosowanie na gry

| ID | Wymaganie | P |
|---|---|:-:|
| VOTE-1 | Głosować mogą **uczestnicy** spotkania, dopóki głosowanie jest otwarte. | M |
| VOTE-2 | Każdy uczestnik może zagłosować na **dowolną liczbę gier** z kolekcji, **jeden głos na grę**, i cofnąć głos do zamknięcia głosowania. | M |
| VOTE-3 | Głosowanie jest **jawne**: przy każdej grze widać liczbę głosów i awatary głosujących. Lista jest sortowana malejąco po głosach i ma wyszukiwarkę. | M |
| VOTE-4 | Gry niepasujące do liczby uczestników (min/max) są oznaczone, ale można na nie głosować. | S |
| VOTE-5 | Admin **zamyka głosowanie, publikując wybrane gry**. Wybiera je dowolnie z kolekcji: nie muszą to być gry z największą liczbą głosów ani gry, na które ktoś głosował. Po publikacji spotkanie pokazuje listę „Gramy w:”. | M |
| VOTE-6 | Admin może ponownie otworzyć głosowanie przed rozpoczęciem spotkania. | S |

#### 5.8.5 Przebieg spotkania (admin lub prowadzący)

| ID | Wymaganie | P |
|---|---|:-:|
| RUN-1 | **Rozpocznij spotkanie:** status zmienia się na *w trakcie* (zamyka też ewentualne otwarte głosowanie). | M |
| RUN-2 | **Nowa partia:** wybór gry (najpierw opublikowane, potem reszta kolekcji), wybór notesu (gdy gra ma ich kilka; bez notesu partii nie da się rozpocząć), wybór graczy spośród uczestników i przypisanie ich do miejsc w notesie, a potem notes (§5.5.1). | M |
| RUN-3 | W spotkaniu może być kilka partii w toku jednocześnie (np. dwa stoły), każda prowadzona na jednym urządzeniu. | S |
| RUN-4 | **Zakończ spotkanie:** status *zakończone*. Partie w toku trzeba wcześniej dokończyć albo porzucić, a system o tym przypomina. Po zakończeniu nie można dodawać partii. | M |
| RUN-5 | Admin może cofnąć zakończenie spotkania, czyli wrócić do *w trakcie*, żeby dograć zapomnianą partię. | C |

#### 5.8.6 Popup spotkania

| ID | Wymaganie | P |
|---|---|:-:|
| VIEW-1 | Nagłówek: tytuł, data, godzina, status, prowadzący, uczestnicy (awatary). | M |
| VIEW-2 | Zaplanowane: sekcja głosowania albo opublikowane gry, a dla admina akcje edycji. | M |
| VIEW-3 | W trakcie i zakończone: lista **partii** w kolejności rozegrania. Każda partia ma miniaturę **oderwanej karteczki** (klikalną, z powiększeniem), grę oraz graczy z miejscami i wynikami. | M |
| VIEW-4 | **Podsumowanie leaderboardowe spotkania:** dla każdego gracza punkty zdobyte (z rozbiciem na gry, np. „Wingspan +8, Azul +4”), liczba wygranych (za które gry) i zmiana serii (`+1 → seria 4`, `przerwana`, `bez zmian`). | M |
| VIEW-5 | Odblokowane na tym spotkaniu osiągnięcia („Ania odblokowała: Hat-trick”). | S |
| VIEW-6 | Admin: usunięcie partii (z potwierdzeniem, §5.6.5). | M |

### 5.9 Statystyki gracza (profil)

| ID | Wymaganie | P |
|---|---|:-:|
| STAT-1 | Spotkania (obecność), rozegrane partie, wygrane, % wygranych, suma punktów, rekord serii, bieżąca seria, aktualne miejsca w trzech leaderboardach. | M |
| STAT-2 | Ulubiona gra (najczęściej grana), najlepsza gra (najwięcej wygranych lub najwyższy % przy ≥ 3 partiach), ostatnie partie (lista z linkami do spotkań). | M |
| STAT-3 | Filtr roku jak w leaderboardzie. | S |

### 5.10 Osiągnięcia

| ID | Wymaganie | P |
|---|---|:-:|
| ACH-1 | Katalog osiągnięć jest **zdefiniowany w kodzie**: identyfikator, nazwa, opis, ikona, warunek liczony z historii. Zmiana katalogu wymaga zmiany kodu. | M |
| ACH-2 | Osiągnięcia są przeliczane automatycznie po zapisaniu i po usunięciu partii oraz po zakończeniu spotkania. Data odblokowania to data spotkania, na którym warunek został spełniony po raz pierwszy (odtwarzana chronologicznie, więc wynik jest deterministyczny). | M |
| ACH-3 | **Gablota** w profilu: wszystkie osiągnięcia z katalogu. Odblokowane są kolorowe z datą, nieodblokowane wyszarzone, z opisem warunku i (gdzie ma to sens) postępem, np. „7/10 spotkań”. | M |
| ACH-4 | Krótkie powiadomienie (toast) w aplikacji po odblokowaniu osiągnięcia na urządzeniu prowadzącym partię. | C |

**Proponowany katalog startowy** (do akceptacji lub korekty):

| Grupa | ID | Nazwa | Warunek |
|---|---|---|---|
| Spotkania | `meet-1` | Pierwsze kroki | Udział w 1. spotkaniu (z ≥ 1 partią) |
| | `meet-10` | Stały bywalec | 10 spotkań |
| | `meet-25` | Weteran | 25 spotkań |
| | `meet-50` | Filar klubu | 50 spotkań |
| Partie | `play-10` | Rozgrzewka | 10 rozegranych partii |
| | `play-50` | Zapalony gracz | 50 partii |
| | `play-100` | Setka | 100 partii |
| | `marathon` | Maratończyk | ≥ 5 partii na jednym spotkaniu |
| Wygrane | `win-1` | Pierwsza wygrana | 1 wygrana partia |
| | `win-10` | Zwycięzca | 10 wygranych |
| | `win-50` | Mistrz | 50 wygranych |
| | `hattrick` | Hat-trick | ≥ 3 wygrane na jednym spotkaniu |
| | `flawless` | Bez skazy | Wygrane wszystkie partie spotkania (przy ≥ 3 partiach gracza) |
| Serie | `streak-3` | W gazie | Seria 3 |
| | `streak-5` | Nie do zatrzymania | Seria 5 |
| | `streak-10` | Legenda | Seria 10 |
| Różnorodność | `explorer-10` | Odkrywca | Zagrane 10 różnych gier |
| | `explorer-25` | Ludoznawca | Zagrane 25 różnych gier |
| | `versatile-5` | Wszechstronny | Wygrane w 5 różnych grach |
| | `specialist` | Specjalista | 10 wygranych w jednej grze |
| | `beginners-luck` | Szczęście debiutanta | Wygrana w swojej pierwszej partii danej gry |
| Wyjątkowe | `record` | Rekordzista | Ustanowienie najwyższego wyniku w historii danej gry (zostaje na zawsze) |
| | `big-table` | Wielki stół | Partia z ≥ 6 graczami |
| | `tie-top` | Ex aequo | Wspólne 1. miejsce |
| | `comeback` | Powrót z popiołów | Wygrana na spotkaniu bezpośrednio po spotkaniu, które przerwało serię ≥ 3 |
| | `lantern-10` | Czerwona latarnia | 10 razy ostatnie miejsce |
| Punkty | `pts-100` | Setka punktów | 100 punktów leaderboardu |
| | `pts-500` | Pół tysiąca | 500 punktów |
| Klub | `voter-10` | Głos ludu | Głos oddany w 10 głosowaniach |

---

## 6. Model danych (propozycja, Supabase Postgres)

```
club                id (jeden wiersz, wymuszony ograniczeniem), name, logo_path, timezone (IANA),
                    created_at, updated_at
profiles            id (uuid = auth.users.id, bez kaskady), hook (unique), first_name, last_name,
                    avatar_path, role ('admin'|'player'), theme ('light'|'dark'|'system'),
                    created_at, deleted_at
games               id, title, cover_path, min_players, max_players,
                    placement_points int[]  -- długość = max_players
                    created_at, updated_at, deleted_at
scorepads           id, game_id, name, current_version_id, created_at, deleted_at
scorepad_versions   id, scorepad_id, template jsonb (format score-pad v2 + ranking),
                    image_path, player_slots, created_at          -- niezmienne
meetings            id, title, starts_at timestamptz, status ('planned'|'in_progress'|'finished'),
                    voting_open bool, host_id (prowadzący, null = admin), created_by,
                    started_at, finished_at, created_at, updated_at
meeting_participants meeting_id, profile_id, added_at                  PK (meeting_id, profile_id)
game_votes          meeting_id, game_id, profile_id, created_at      PK (meeting_id, game_id, profile_id)
meeting_games       meeting_id, game_id, position                     -- opublikowane gry
plays               id, meeting_id, game_id, scorepad_version_id,
                    status ('draft'|'saved'), sheet jsonb, sheet_image_path,
                    points_snapshot int[], started_by, started_at, saved_at
play_results        play_id, profile_id, seat, values jsonb, ranking_value numeric,
                    place int, tied bool, points int, is_win bool     PK (play_id, profile_id)
achievement_unlocks profile_id, achievement_id, unlocked_at, meeting_id, play_id
                    PK (profile_id, achievement_id)
```

- **Statystyki i leaderboardy** liczone są w bazie: widoki i funkcje SQL, np. `leaderboard(kind, year)`, `player_stats(profile_id, year)`, `game_stats(game_id)`. Przy skali jednego klubu (dziesiątki graczy, tysiące partii) wystarczą zwykłe zapytania. Seria jest wyliczana funkcją okienkową po spotkaniach.
- **Zapis partii** odbywa się przez funkcję RPC `save_play(play_id, results)` w jednej transakcji. Funkcja sprawdza uprawnienia (admin lub prowadzący, spotkanie w trakcie, gracze są uczestnikami), wylicza punkty i wygrane (§5.6) i przelicza osiągnięcia graczy partii.
- **Storage:** buckety `avatars`, `covers` (okładki gier i logo klubu), `scorepads` (zdjęcia szablonów), `sheets` (obrazy karteczek). Odczyt dla zalogowanych, zapis według ról.

### 6.1 Bezpieczeństwo (RLS)

- Wszystkie tabele mają włączone RLS. Odczyt jest dostępny tylko dla zalogowanych, aktywnych użytkowników.
- `profiles`: użytkownik aktualizuje wyłącznie swój wiersz i tylko pola `first_name`, `last_name`, `avatar_path`, `theme`. `role`, `hook` i `deleted_at` są tylko dla Edge Functions.
- `club`, `games`, `scorepads`, `meetings`, `meeting_games`: zapis tylko admin (funkcja `is_admin()`).
- `game_votes`: insert/delete tylko własne głosy, tylko uczestnik spotkania, tylko przy `voting_open`.
- `plays` i `play_results`: zapis przez RPC (security definer) z kontrolą „admin lub `host_id`”. Usuwanie tylko admin.
- **Edge Functions** (klucz service role tylko po stronie serwera): `create-member`, `delete-member`, `delete-own-account`, `bootstrap-admin` (jednorazowo).

---

## 7. Wymagania niefunkcjonalne

| ID | Wymaganie |
|---|---|
| NFR-1 | **Hosting:** statyczny SPA na Cloudflare Pages. Backend wyłącznie w Supabase (bez własnego serwera). Konfiguracja przez zmienne środowiskowe (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). |
| NFR-2 | **Wydajność:** widok Klubu interaktywny w < 2 s na telefonie średniej klasy (4G). Notes 3D i edytor (Three.js) są ładowane leniwie, dopiero przy otwarciu partii lub edytora. Notes w pełnej rozdzielczości tekstury (PAD-16) utrzymuje płynną animację (cel 60 kl./s, minimum 30 kl./s przy obrocie i zoomie). |
| NFR-3 | **PWA:** manifest, ikony, instalacja na ekranie głównym, cache powłoki aplikacji. Tryb offline nie jest wymagany poza ochroną szkicu partii (PAD-4). |
| NFR-4 | **Responsywność:** od 360 px szerokości. Popupy na telefonie są pełnoekranowe. Obsługa dotyku (notes już ją ma), w tym gestów dwoma palcami w notesie (PAD-10, PAD-11) bez konfliktu z zoomem strony przeglądarki. |
| NFR-5 | **Motywy:** jasny i ciemny, spójne z notesem i edytorem (edytor ma już atrybut `theme`). |
| NFR-6 | **Dostępność:** kontrast WCAG AA, nawigacja klawiaturą w popupach (focus trap, Esc zamyka), etykiety ARIA, alternatywy tekstowe dla awatarów. |
| NFR-7 | **Limity darmowego planu Supabase:** obrazy kompresowane po stronie klienta (awatar ≈ 30 KB, okładka ≈ 100 KB, karteczka ≈ 150 KB). Zdjęcia szablonów są w Storage, nie w JSON. Wyjątkiem jest zdjęcie szablonu notesu: dla jakości tekstury (EDT-12, PAD-16) może mieć 1–3 MB, bo jest jedno na wersję notesu. |
| NFR-8 | **Kopie zapasowe:** opis w README procedury eksportu bazy i Storage (np. `supabase db dump` + skrypt kopiowania bucketów). |
| NFR-9 | **Open source:** w repozytorium nie ma sekretów ani danych klubu. README opisuje wdrożenie od zera (projekt Supabase, migracje, seed admina, Cloudflare Pages). |
| NFR-10 | **Strefa czasowa:** daty spotkań przechowywane jako `timestamptz` i wyświetlane w strefie klubu (`club.timezone`, ustawiana przy zakładaniu klubu, CLUB-2). Rok w filtrze leaderboardu liczy się według tej strefy. |
| NFR-11 | **Testy:** testy jednostkowe logiki wyników (miejsca, remisy hierarchiczne, punkty z `floor`, serie, osiągnięcia) z przypadkami z tego dokumentu. Testy SQL funkcji leaderboardu. E2E (Playwright) dla głównych ścieżek. |

---

## 8. Proponowana technologia i struktura

### 8.1 Stos

- **Frontend:** Vite + TypeScript. Framework UI do wyboru: rekomendacja **React** albo **Preact** z TanStack Query (cache danych z Supabase). Notes i edytor zostają web componentami (vanilla TS, Three.js), osadzanymi bez przepisywania.
- **Backend:** Supabase: Postgres (migracje w repo, `supabase/migrations`), Auth, Storage, Edge Functions (Deno).
- **Wdrożenie:** Cloudflare Pages budowane z gałęzi `main`, z preview dla PR. Migracje uruchamiane przez Supabase CLI (ręcznie albo w CI).

### 8.2 Struktura repozytorium (propozycja)

```
bg-club/
  apps/web/                 # SPA (widok Klubu, popupy)
  packages/score-pad/       # źródła notesu + edytora (przeniesione z POC) z trybem klubowym
  packages/scoring/         # czysta logika: miejsca, remisy, punkty, serie, osiągnięcia (+ testy)
  supabase/migrations/      # schemat, RLS, funkcje SQL
  supabase/functions/       # create-member, delete-member, delete-own-account, bootstrap-admin
  supabase/seed/            # skrypt pierwszego admina
  PRD.md, README.md
```

### 8.3 Logika wyników współdzielona

Logika miejsc i remisów jest używana w notesie (podsumowanie przed oderwaniem) i w testach. Punkty i serie są liczone w SQL. Pakiet `scoring` ma zestaw przypadków testowych, który obie implementacje muszą przejść.

### 8.4 Ograniczenia z POC notesu

- Notes i edytor mają dziś limit **8 graczy** (`MAX_PLAYERS` w `core/util.ts`, używany w `core/templates.ts` i `editor/fields.ts`). Limit jest usuwany (EDT-8): liczba graczy wynika wyłącznie z notesu.
- Notes zapisuje dziś szablony w IndexedDB, a stan i historię w `localStorage`. W trybie klubowym zastępuje to warstwa danych aplikacji (PAD-1, PAD-4).
- Zdjęcie szablonu jest dziś data URL w JSON i trzeba je przenieść do Storage (EDT-1).
- Zwycięzca jest dziś wyznaczany przez najwyższą sumę końcową bez reguł remisów. Zastąpią to EDT-2…EDT-7.
- Zdjęcie kartki jest dziś skalowane kilka razy: źródło do 2400 px (`MAX_SRC` w `editor/photo.ts`), wyprostowana kartka do 1600 px (`editor/editor.ts`), zapis JPEG o jakości 0,86, a tekstura notesu ma stały dłuższy bok 1600 px (`texSize` w `core/print.ts`). Renderer ogranicza `devicePixelRatio` do 2 (`core/viewer.ts`). Zastąpią to EDT-12 i PAD-16.
- Kamera notesu ma dziś stałe nachylenie (`view.tilt` = 7°) i tylko wąski zoom Ctrl+kółko (0,55–1,35). Brak obrotu notesu, a spód bloku nie jest modelowany do oglądania. Zastąpią to PAD-10…PAD-12.
- Punkty wpisuje się dziś w oknie wyboru (`picker`) z polem tekstowym. Zastąpi to wpisywanie bezpośrednio w pole kartki (PAD-13…PAD-15).
- Edytor ma dziś trzy kroki (Zdjęcie, Kształt, Pola), a kształt można poprawiać różdżką i lassem. Zastąpi to kreator pięciu kroków (§5.5.2) z edycją obszaru punktami (EDT-10). Różdżka i lasso są usuwane.

---

## 9. Kluczowe przepływy (skrót)

0. **Pierwsze uruchomienie:** wdrożenie i seed admina → Admin loguje się → widok Klubu z ilustracją i przyciskiem „Dodaj klub” → nazwa, (logo), strefa czasowa → Zapisz → widżety z pustymi stanami.
1. **Dodanie członka:** Admin → Członkowie → Dodaj → imię, nazwisko → Zapisz → widzi hook i hasło → przekazuje je graczowi.
2. **Dodanie gry z notesem:** Admin → Kolekcja → Dodaj grę → tytuł, okładka, min/max, punkty za miejsca 1…max → Zapisz → Notesy → Dodaj notes → edytor: zdjęcie (plik lub aparat) → obszar kartki → mapowanie pól (prostokąty lub tabela) → kategorie (typy, zakresy, sumy, kategoria decydująca, remisy) → test z losowymi danymi → Zapisz.
3. **Planowanie:** Admin → Kalendarz → Zaplanuj → tytuł, data, godzina, uczestnicy, (prowadzący) → Zapisz → głosowanie otwarte → uczestnicy głosują → Admin wybiera gry i publikuje.
4. **Spotkanie:** Admin lub prowadzący → Rozpocznij → Nowa partia → gra, notes, gracze i miejsca → wpisywanie → Oderwij → podsumowanie → Zatwierdź → … → Zakończ spotkanie.
5. **Przegląd:** Gracz → Timeline → spotkanie → karteczki, punkty, wygrane, serie. Kliknięcie awatara → profil → statystyki i gablota.

---

## 10. Plan etapów (propozycja)

| Etap | Zakres |
|---|---|
| **E0: Fundament** | Repo, Vite, Supabase (schemat, RLS), Cloudflare Pages, logowanie hookiem, bootstrap admina, pierwsze uruchomienie i zakładanie klubu (CLUB-1…CLUB-4), motywy, szkielet widoku Klubu i systemu popupów. |
| **E1: Członkowie i profil** | Dodawanie i usuwanie członków (Edge Functions), profil, ustawienia, awatary. |
| **E2: Kolekcja** | CRUD gier, okładki, punktacja miejsc, wyszukiwanie, notesy (przeniesienie edytora jako kreatora pięciu kroków + zapis w bazie + EDT-2…EDT-14). |
| **E3: Spotkania** | Kalendarz, planowanie, głosowanie, publikacja, widżety Timeline i Aktywne spotkanie. |
| **E4: Partie** | Notes w trybie klubowym (wybór graczy, obrót, zoom i widok z góry, wpisywanie z klawiatury, jakość tekstury, szkice, oderwanie, obraz karteczki), RPC zapisu, usuwanie partii. |
| **E5: Rywalizacja** | Leaderboardy z filtrem roku, statystyki gracza i gry, podsumowanie spotkania. |
| **E6: Osiągnięcia i szlif** | Katalog osiągnięć, gablota, PWA, dostępność, testy E2E, README wdrożenia. |

---

## 11. Decyzje podjęte z właścicielem produktu

| # | Temat | Decyzja |
|---|---|---|
| D1 | Notes podczas spotkania | Jedno urządzenie na partię, bez synchronizacji na żywo. |
| D2 | Partia bez notesu | Niedozwolona: partie powstają wyłącznie z oderwanych karteczek. |
| D3 | Seria a nieobecność | Nieobecność (lub brak partii) nie przerywa serii. Leaderboard pokazuje rekord. |
| D4 | Osiągnięcia | Stała lista w kodzie. |
| D5 | Logowanie | Hook + hasło (techniczny e-mail ukryty). |
| D6 | Reset hasła | Brak. |
| D7 | Punktacja miejsc | Punkty zdefiniowane dla każdego miejsca 1…max. liczby graczy gry. |
| D8 | Remis o 1. miejsce | Każdy remisujący dostaje wygraną i przedłuża serię. |
| D9 | Zakres leaderboardów | Cała historia + filtr roku. |
| D10 | Korekty | Admin może usunąć partię (bez edycji wpisów). |
| D11 | Administratorzy | Jeden admin tworzony przy instalacji. |
| D12 | Status spotkania | Rozpoczęcie i zakończenie ręczne. |
| D13 | Kto prowadzi partie | Admin. Gdy go nie ma, może wskazać prowadzącego spośród uczestników. |
| D14 | Głosowanie | Jawne (liczby i awatary), bez limitu, 1 głos na grę, z możliwością cofnięcia. |
| D15 | Obrazy | Upload do Supabase Storage (awatary, okładki). |
| D16 | Interfejs | Polski, mobile-first, PWA. |
| D17 | Limit graczy | Brak limitu w aplikacji. Graczy w partii może być tylu, ile miejsc zdefiniowano w notesie. |
| D18 | Pierwsze uruchomienie | Admin po zalogowaniu zakłada klub (nazwa, logo, strefa czasowa) jedynym przyciskiem „Dodaj klub” w miejscu widżetów (CLUB-1, CLUB-2). |
| D19 | Sterowanie notesem | Notes 3D z obrotem bez ograniczeń (także widok tyłu), dowolnym zoomem i domyślnym widokiem z góry; punkty z klawiatury systemowej (telefon) lub sprzętowej (komputer), fokus przechodzi do kolejnej kategorii gracza (PAD-10…PAD-16). |
| D20 | Edytor notesu | Kreator pięciu kroków: zdjęcie, obszar kartki (z nazwą notesu i kolorem grzbietu), mapowanie pól, kategorie, test (nieobowiązkowy) i zapis (§5.5.2). Bez różdżki i lassa. |

---

## 12. Decyzje szczegółowe

Założenia zaproponowane w wersji 1.0 i zaakceptowane przez właściciela produktu.

| # | Pytanie | Decyzja |
|---|---|---|
| Q1 | Czy zmiana punktacji gry ma działać wstecz na rozegrane partie? | **Nie.** Partia ma snapshot punktacji i szablonu. |
| Q2 | Gry jednoosobowe (min = 1): czy partia solo daje wygraną, punkty i serię? | Dopuszczamy min = 1, ale partia musi mieć **≥ 2 graczy**. Solo jest poza MVP. |
| Q3 | Czy na spotkaniu można zagrać w grę spoza opublikowanej listy? | **Tak.** Opublikowane gry to plan, nie ograniczenie. |
| Q4 | Czy admin może usunąć zakończone spotkanie z partiami? | **Nie.** Najpierw trzeba usunąć partie. |
| Q5 | Czy zmiana imienia lub nazwiska zmienia hook (login)? | **Nie.** Hook jest niezmienny. |
| Q6 | Kierunek „mniej = lepiej” dla kategorii decydującej i reguł remisu (dodatek spoza briefu). | Uwzględniony jako **S**. |
| Q7 | Reguła remisu „rozstrzyga prowadzący” (dodatek spoza briefu). | Uwzględniona jako **C**. |
| Q8 | Widżet członków przy ≤ 5 członkach. | Wszystkie awatary bez licznika `+N`. |
| Q9 | Usunięci gracze między sobą na końcu leaderboardu. | Według wyniku, wyszarzeni, nigdy na podium. |
| Q10 | Czy zakończone spotkanie można „otworzyć” ponownie, żeby dograć partię? | Tak, tylko admin (**C**, RUN-5). |
| Q11 | Kryterium kolejności gier w widżecie kolekcji. | Ostatnio grane, potem ostatnio dodane. |
| Q12 | Czy potrzebny jest limit liczby uczestników spotkania? | Brak limitu. Limit dotyczy tylko partii (min/max gry, miejsca w notesie). |
