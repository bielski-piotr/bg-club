# BG Club — dokument wymagań produktu (PRD)

## 1. Cel produktu

BG Club to aplikacja dla jednego, zamkniętego klubu gier planszowych. Pozwala prowadzić kolekcję gier klubu, planować spotkania i głosować na gry oraz terminy, rozgrywać partie z cyfrowym notesem punktacji, a na podstawie zapisanych wyników prowadzić rankingi, statystyki i rekordy.

Jedna instalacja obsługuje dokładnie jeden klub. Dostęp mają wyłącznie członkowie dodani przez administratora — nie ma rejestracji samodzielnej ani dostępu anonimowego.

## 2. Role

| Rola                     | Opis                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Administrator**        | Dokładnie jeden na instalację. Zarządza klubem, członkami, kolekcją gier, notesami, spotkaniami i partiami. Nie może zostać usunięty.                                                                                                            |
| **Gracz**                | Członek klubu. Przegląda wszystkie dane klubu (także historię), głosuje na gry i terminy spotkań, w których uczestniczy, proponuje terminy i zarządza własnym profilem.                                                                          |
| **Prowadzący spotkania** | Gracz wyznaczony przez administratora do prowadzenia konkretnego spotkania. W swoim niezakończonym spotkaniu może je rozpocząć i zakończyć oraz rozpoczynać, prowadzić, zapisywać i porzucać partie. Domyślnie spotkanie prowadzi administrator. |

Zasady ogólne:

- Każdy aktywny członek widzi wszystkie dane klubu, także dotyczące usuniętych członków i gier.
- Konto usunięte traci dostęp natychmiast — nawet jeśli jego sesja jest jeszcze ważna.
- Nikt, także administrator, nie może edytować cudzego profilu.

## 3. Konta i logowanie

### 3.1. Pierwsze uruchomienie

- Pierwsze konto instalacji to zawsze administrator. Tworzy je operator instalacji poza aplikacją (skrypt z kluczem serwisowym); nie istnieje publiczny sposób „zajęcia” pustej instalacji.
- Operator może podać własne hasło administratora albo otrzymać hasło wygenerowane (pokazywane jednorazowo).
- Ponowienie tworzenia administratora jest bezpieczne: gdy administrator już istnieje, nic się nie zmienia. Drugiego administratora nie da się utworzyć, także przy równoległych próbach.

### 3.2. Login (hook)

- Członek loguje się **hookiem** i hasłem. Hook powstaje z imienia i nazwiska (transliteracja polskich znaków, małe litery, słowa rozdzielone myślnikami) i losowego czteroznakowego sufiksu szesnastkowego, np. `lukasz-zolw-7c1e`.
- Hook jest unikalny (także względem usuniętych członków), niezmienny i ma najwyżej 64 znaki. Wielkość liter przy logowaniu nie ma znaczenia.
- System nie używa adresów e-mail; żadne wiadomości nie są wysyłane.
- Sesja jest wydawana i odświeżana wyłącznie kontu z aktywnym profilem.

### 3.3. Dodawanie członków

- Członka dodaje tylko administrator, podając imię i nazwisko (każde niepuste, najwyżej 50 znaków).
- System generuje hook i losowe hasło (co najmniej 12 znaków, bez łatwych do pomylenia znaków). Hasło jest przekazywane administratorowi jednorazowo i nigdzie nie jest zapisywane ani logowane.
- Nowy członek ma zawsze rolę gracza. Konto i profil powstają atomowo — błąd nie zostawia niespójnego konta.

### 3.4. Hasło

- Konto z hasłem wygenerowanym przez system ma oznaczenie „zalecana zmiana hasła”; przy pierwszym logowaniu członek dostaje propozycję zmiany. Może ją pominąć — wtedy propozycja nie wraca.
- Zmiana hasła wymaga podania obecnego hasła.

### 3.5. Usuwanie kont

- **Administrator usuwa członka** — usunięcie jest miękkie: profil zostaje w historii (partie, wyniki, spotkania), a konto przestaje działać.
- **Gracz usuwa własne konto** po potwierdzeniu obecnym hasłem (obowiązują limity prób jak przy logowaniu). Administrator nie może usunąć własnego konta.
- Skutki usunięcia członka (niezależnie od ścieżki):
  - natychmiastowa utrata dostępu i unieważnienie sesji,
  - usunięcie z zaplanowanych spotkań razem z jego głosami i propozycjami terminów,
  - prowadzenie wszystkich niezakończonych spotkań, które prowadził, wraca do administratora,
  - w spotkaniu w trakcie jego uczestnictwo i partie zostają; zakończone spotkania nie zmieniają się.
- Usunięcie jest idempotentne — ponowienie po błędzie kończy proces.
- Usunięty członek nie może zostać dodany do spotkania ani do partii.

## 4. Profil członka

- Profil zawiera imię, nazwisko, hook, rolę, opcjonalne zdjęcie profilowe oraz preferencję motywu (jasny, ciemny, systemowy).
- Członek zmienia własne imię, nazwisko, zdjęcie (lub powrót do monogramu) i motyw. Hook i rola są niezmienne.
- Zdjęcie profilowe jest przechowywane prywatnie w folderze właściciela; nikt inny nie może go zmienić.
- Profil każdego członka (także usuniętego) można przeglądać razem z jego statystykami i rekordami (sekcja 11).

## 5. Klub

- Instancja ma dokładnie jeden klub. Zakłada go i edytuje administrator.
- Dane klubu: nazwa (niepusta, najwyżej 80 znaków), opcjonalne logo oraz strefa czasowa (poprawna strefa IANA).
- Strefa czasowa klubu wyznacza interpretację terminów spotkań, granice dni w filtrach dat i dni w kalendarzu. Zmiana strefy nie przesuwa już zapisanych terminów spotkań.
- Lista aktywnych członków klubu jest dostępna dla wszystkich; wyszukiwanie członków działa po imieniu, nazwisku i hooku, bez rozróżniania wielkości liter i polskich znaków, a każde słowo zapytania musi pasować.

## 6. Kolekcja gier

### 6.1. Gra

- Grę dodaje, edytuje i usuwa wyłącznie administrator.
- Atrybuty gry:
  - tytuł (niepusty, najwyżej 120 znaków),
  - minimalna (≥ 1) i maksymalna (≥ minimalnej) liczba graczy,
  - skomplikowanie 1,00–5,00 (wymagane przy dodaniu i każdej edycji gry, która je ma),
  - punktacja miejsc: punkty za miejsca 1…max graczy (liczby ≥ 0, najwyżej dwa miejsca po przecinku),
  - opcjonalna okładka (z możliwością ponownego kadrowania z zachowanego oryginału),
  - dostępność.
- **Punktacja miejsc** jest domyślnie wyliczana ze skomplikowania gry i maksymalnej liczby graczy; administrator może ją poprawić ręcznie:

  `points(p) = round( M(w) × 20 × [0,1 + 0,9 × (n − p) / (n − 1)] × (1 + 0,03 × (n − 2)), 1 )`, gdzie `M(w) = 1 + 2 × (w − 1) / 4`, `w` — skomplikowanie, `n` — maks. liczba graczy, `p` — miejsce.

- Zmiana punktacji nie wpływa na rozegrane partie — każda partia ma własny snapshot punktacji z chwili rozpoczęcia.

### 6.2. Dodatki

- Dodatek to osobna pozycja wskazująca grę podstawową, z własnym tytułem, okładką, liczbą graczy, skomplikowaniem, punktacją i notesami.
- Dodatek nie może mieć własnych dodatków; gra podstawowa musi być aktywna w chwili dodania dodatku, a przypisanie do gry podstawowej jest niezmienne.
- Dodatki nie występują samodzielnie w kolekcji, wyszukiwaniu ani głosowaniu — wybiera się je przy rozpoczęciu partii gry podstawowej.

### 6.3. Dostępność

- Gra niedostępna (np. pożyczona) zostaje w kolekcji, wyszukiwaniu i filtrach, ale nie można na nią głosować, opublikować jej ani rozpocząć jej partii. Niedostępnego dodatku nie można wybrać w partii.
- Oddane głosy, opublikowane listy i rozegrane partie pozostają bez zmian.
- Wyłączenie dostępności gry podstawowej wyłącza jej dodatki; ponowne włączenie gry nie włącza dodatków. Nowy dodatek gry niedostępnej jest niedostępny.

### 6.4. Usuwanie gry

- Usunięcie jest miękkie i nieodwracalne: usuniętej gry nie można edytować ani przywrócić.
- Gra znika z kolekcji, z głosowań i z opublikowanych list zaplanowanych spotkań. Partie, wyniki i snapshoty zostają w historii.
- Usunięcie gry podstawowej usuwa (miękko) jej dodatki.

### 6.5. Przeglądanie kolekcji

- Kolekcja obejmuje aktywne gry podstawowe; kolejność: data ostatniej zapisanej partii malejąco (gry bez partii na końcu), następnie data dodania malejąco.
- Wyszukiwanie po fragmencie tytułu, bez rozróżniania wielkości liter i polskich znaków („zolw” znajduje „Żółwie”).
- Dla każdej gry dostępna jest łączna liczba głosów oddanych na nią we wszystkich spotkaniach, jej statystyki (sekcja 11.3) oraz historia oderwanych karteczek od najnowszej.

## 7. Notesy punktacji

### 7.1. Notes i wersje

- Notes to szablon kartki wyników przypisany do gry albo dodatku. Gra może mieć wiele notesów. Tworzy je, edytuje, przemianowuje, przenosi i usuwa administrator.
- Notes ma nazwę (niepusta, najwyżej 40 znaków) i ciąg **niezmiennych wersji**. Każdy zapis notesu (z edytora albo z importu pliku) tworzy nową wersję i ustawia ją jako bieżącą, atomowo. Numery wersji nadaje system kolejno i nigdy nie są używane ponownie.
- Zmiana nazwy, przeniesienie do innej (aktywnej) gry lub dodatku i usunięcie nie tworzą nowej wersji. Rozegrane partie zachowują swoją wersję.
- Usunięcie notesu jest miękkie i nieodwracalne; nowe partie nie mogą go użyć, historia nadal wskazuje jego wersje.
- Zdjęcie kartki wersji jest trwałe — nie da się go usunąć ani nadpisać, dopóki wskazuje je jakakolwiek wersja.

### 7.2. Tworzenie notesu

Tworzenie notesu przebiega w krokach, a przejście dalej jest możliwe tylko z poprawnego kroku:

1. **Zdjęcie** — zdjęcie kartki z pliku, schowka lub kamery albo import pliku notesu `.json`.
2. **Obszar kartki** — wyznaczenie obszaru kartki na zdjęciu i nazwa notesu.
3. **Mapowanie pól** — każde miejsce gracza i każda kategoria muszą mieć przypisane pola.
4. **Kategorie** — definicja kategorii i reguły miejsc; muszą przejść walidację.
5. **Test i zapis** — próbne wypełnienie kartki (imiona „Gracz 1…n”, opcjonalnie losowe wpisy z wymuszonym remisem) i sprawdzenie wyznaczonych miejsc przed zapisem.

Edycja istniejącego notesu i import pliku zaczynają od stanu z wykonanymi wszystkimi krokami. Notes można wyeksportować do przenośnego pliku `.json` (ze zdjęciem).

### 7.3. Kategorie

- Rodzaje kategorii: **punktacja** (lista dozwolonych wartości, zakres od–do z krokiem albo dowolna liczba całkowita), **suma** (częściowa lub końcowa, z wybranych kategorii, także innych sum), **premia** (wartość przy przekroczeniu progu sumy), **nazwa gracza** oraz pole puste.
- Notes musi mieć dokładnie jedną kategorię nazwy gracza i co najmniej jedną punktację. Sumy nie mogą tworzyć cykli, identyfikatory kategorii są unikalne, a zakresy i listy wartości muszą być poprawne.
- Kategoria nazwy gracza może dopuszczać **zespoły** — kilku graczy na jednym miejscu kartki.
- Liczba miejsc dla graczy wynika z notesu (bez globalnego limitu).

### 7.4. Reguła miejsc

- **Kategoria decydująca** (punktacja lub suma) i **kierunek**: więcej lepiej albo mniej lepiej. Puste pole jest zawsze gorsze od każdej liczby.
- **Reguły remisu** stosowane hierarchicznie — każda kolejna dotyczy tylko graczy nadal zremisowanych:
  - rozstrzygnięcie inną kategorią (z własnym kierunkiem),
  - wspólne miejsce,
  - rozstrzyga prowadzący (ręczne ułożenie kolejności w grupach remisu pozostałych po wcześniejszych regułach).
- Reguły po „wspólnym miejscu” lub „rozstrzyga prowadzący” nie mają działania i nie są zapisywane.
- Gracze wciąż zremisowani zajmują wspólne miejsce, a numeracja ma postać „1, 1, 3”.
- Notes bez jawnej reguły rozstrzyga najwyższą sumą końcową (a bez sumy końcowej — sumą wszystkich punktacji i premii).
- Szablon z błędną regułą miejsc jest odrzucany, a nie naprawiany.

## 8. Spotkania

### 8.1. Cykl życia

Spotkanie ma status **zaplanowane → w trakcie → zakończone**. Dozwolone jest też cofnięcie zakończenia (**zakończone → w trakcie**), np. by dograć zapomnianą partię. Powrót do statusu „zaplanowane” nie istnieje.

- W danej chwili może trwać **tylko jedno** spotkanie.
- **Rozpoczęcie** — administrator lub prowadzący; zamyka głosowanie na gry i na termin.
- **Zakończenie** — administrator lub prowadzący; wymaga dokończenia albo porzucenia wszystkich partii w toku.
- **Cofnięcie zakończenia** — tylko administrator; nie zmienia historii spotkania ani partii. Prowadzący odzyskuje wtedy uprawnienia.
- Prowadzący traci uprawnienia po zakończeniu spotkania, ale pozostaje zapisany w jego historii.

### 8.2. Planowanie i edycja

- Spotkanie tworzy administrator. Spotkanie ma tytuł (niepusty, najwyżej 120 znaków), termin, listę uczestników (co najmniej jeden) i opcjonalnie prowadzącego, który musi być uczestnikiem i nie może być administratorem.
- Termin podaje się jako datę i godzinę w strefie klubu. Godzina nieistniejąca z powodu zmiany czasu jest odrzucana; godzina podwójna oznacza jej drugie wystąpienie.
- Nowe spotkanie jest zaplanowane z otwartym głosowaniem na gry.
- Zakres zmian zależy od statusu:
  - **zaplanowane** — wszystko (tytuł, termin, uczestnicy, prowadzący); usunięcie uczestnika kasuje jego głosy i propozycje terminów,
  - **w trakcie** — tylko dopisanie uczestnika, zmiana prowadzącego i usunięcie uczestnika bez partii (także bez partii w toku),
  - **zakończone** — nic.
- Usunięcie prowadzącego z listy uczestników przywraca prowadzenie administratorowi.

### 8.3. Usuwanie

- Spotkanie usuwa tylko administrator. Nie można usunąć spotkania w trakcie ani spotkania z zapisanymi partiami.
- Usunięcie kasuje uczestników, głosy, propozycje terminów i opublikowaną listę gier.

### 8.4. Głosowanie na gry

- Głosują wyłącznie uczestnicy spotkania, tylko przy otwartym głosowaniu i tylko w spotkaniu zaplanowanym.
- Uczestnik może zagłosować na dowolną liczbę aktywnych, dostępnych gier podstawowych — najwyżej jeden głos na grę. Głos można cofnąć, dopóki głosowanie jest otwarte. Głosy są jawne.
- **Publikacja gier** (tylko administrator) zamyka głosowanie i zapisuje uporządkowaną listę „Gramy w:”. Administrator wybiera dowolne aktywne gry z kolekcji, także bez głosów. Ponowna publikacja zastępuje listę. Głosy zostają jako historia.
- **Ponowne otwarcie głosowania** (tylko administrator, tylko przed rozpoczęciem spotkania) usuwa opublikowaną listę — otwarte głosowanie i opublikowana lista wykluczają się.

### 8.5. Głosowanie na termin

- Niezależne od głosowania na gry; włącza je administrator przy edycji spotkania, możliwe tylko w spotkaniu zaplanowanym.
- Uczestnicy (i administrator) proponują terminy — bez limitu, nie w przeszłości, każdy termin raz na spotkanie. Proponujący uczestnik od razu głosuje na swoją propozycję.
- Uczestnicy głosują na dowolnie wiele propozycji i mogą cofać głosy, dopóki głosowanie jest otwarte. Głosy są jawne.
- Głosowanie jest tylko opinią: administrator **wybiera termin** z propozycji (zamyka to głosowanie) albo wpisuje dowolny termin. Administrator może też ponownie otworzyć głosowanie na termin i edytować listę propozycji (pozostawione propozycje zachowują głosy).
- Rozpoczęcie spotkania zamyka głosowanie na termin.

### 8.6. Przegląd spotkań

- Spotkania nadchodzące (zaplanowane i trwające) i odbyte (zakończone), uporządkowane chronologicznie.
- Kalendarz miesięczny — spotkanie przypisane jest do dnia według strefy klubu.
- Dla każdego spotkania: liczba zapisanych partii i zwycięzcy (gracze z co najmniej jedną wygraną, od największej liczby wygranych).

## 9. Partie

### 9.1. Rozpoczęcie partii

- Partię rozpoczyna administrator lub prowadzący, tylko w spotkaniu w trakcie. W spotkaniu może trwać kilka partii jednocześnie.
- Wybiera się: grę (aktywną, dostępną, podstawową), opcjonalnie dodatki (aktywne, dostępne dodatki tej gry), notes (aktywny notes gry lub jednego z wybranych dodatków — bez notesu partii nie można rozpocząć) oraz graczy przypisanych do miejsc notesu.
- Gracze to aktywni uczestnicy spotkania, każdy najwyżej raz. Kilku graczy na jednym miejscu tylko w notesie z zespołami.
- **Liczba graczy partii**: od max(2, najmniejsze minimum gry i dodatków) do największego maksimum gry i dodatków, i nie więcej niż miejsc notesu (w notesie z zespołami wystarczą dwa miejsca). Partia ma co najmniej 2 strony, więc gra jednoosobowa nie ma partii w klubie.
- **Punktacja partii** pochodzi z tytułu (gra lub wybrany dodatek) o najwyższym skomplikowaniu spośród tych, które mieszczą wszystkich graczy; przy remisie wygrywa gra podstawowa.
- Partia zapamiętuje bieżącą wersję notesu i snapshot punktacji — późniejsze zmiany gry i notesu jej nie dotyczą.
- Ponowienie rozpoczęcia (np. po błędzie sieci) z tym samym identyfikatorem i tą samą treścią zwraca istniejącą partię zamiast tworzyć duplikat.

### 9.2. Partia w toku (szkic)

- Wpisy kartki są zapisywane w systemie automatycznie z opóźnieniem 1–2 s oraz lokalnie na urządzeniu. Odświeżenie, awaria przeglądarki i utrata sieci nie gubią wpisów; zapis jest ponawiany po odzyskaniu połączenia.
- Każdy zapis szkicu ma numer wersji. Zapis oparty na nieaktualnej wersji (inne urządzenie, inna karta) jest odrzucany jako **konflikt** — nic nie jest nadpisywane po cichu; użytkownik decyduje, którą wersję zachować.
- Partię w toku może dokończyć administrator lub prowadzący na innym urządzeniu (bez synchronizacji na żywo).
- Rozmiar szkicu jest ograniczony.
- **Porzucenie partii** (administrator lub prowadzący) usuwa szkic razem z graczami. Szkice nie liczą się do żadnych statystyk.
- Aktualizacja aplikacji jest wstrzymywana, dopóki otwarta partia ma wpisy niezapisane w systemie.

### 9.3. Zapis partii (oderwanie karteczki)

- Oderwanie karteczki kończy partię; po potwierdzeniu podsumowania wyniki są zapisywane atomowo: pełne wpisy kartki, wyniki graczy i status „zapisana”.
- Miejsca wyznacza notes według swojej reguły miejsc (w tym ręczne rozstrzygnięcie remisów przez prowadzącego). System weryfikuje:
  - gracze i miejsca w notesie są dokładnie te z rozpoczęcia partii,
  - numeracja miejsc jest poprawna („1, 1, 3”) i zgodna z kolejnością wartości kategorii decydującej,
  - co najmniej jeden gracz ma wartość kategorii decydującej,
  - wersja notesu jest ta z rozpoczęcia partii,
  - ręczne rozstrzygnięcie dotyczy tylko remisów, których nie rozstrzygnęły wcześniejsze reguły,
  - członkowie zespołu mają to samo miejsce i te same wpisy,
  - zapisana partia ma co najmniej 2 graczy i komplet wyników.
- **Punkty liczy system** ze snapshotu punktacji (klient ich nie przesyła):
  - partia z _n_ stronami korzysta z ostatnich _n_ pozycji punktacji (np. gra 2–6, partia 4 graczy: zwycięzca dostaje punkty za 3. miejsce, ostatni za 6.),
  - strony zremisowane dostają średnią punktów zajmowanych pozycji zaokrągloną w dół do setnych,
  - każdy członek zespołu dostaje pełne punkty miejsca zespołu.
- **Wygrana** to 1. miejsce, także wspólne (i dla każdego członka zwycięskiego zespołu).
- Podsumowanie przed zapisem pokazuje podgląd rekordów, które partia ustanowi (sekcja 11.4).
- Ponowienie zapisu z identyczną treścią zwraca zapisaną partię; inna treść jest błędem — zapisanej partii nie można zapisać ponownie ani edytować.

### 9.4. Obraz karteczki

- Przy oderwaniu powstaje obraz kartki z pismem, dołączany do zapisanej partii. Obraz jest tylko podglądem — pełne wpisy i niezmienna wersja szablonu pozwalają odtworzyć kartkę (także w widoku 3D).
- Brak obrazu nie blokuje zapisu wyników. Pierwszy dołączony obraz jest ostateczny.
- Obrazy niewskazywane przez żadną partię (osierocone) mogą być sprzątane przez administratora lub prowadzącego spotkania, gdy są starsze niż 15 minut i nie należą do partii w toku.

### 9.5. Historia karteczek

- Każda zapisana partia jest dostępna jako karteczka: obraz, wpisy, wyniki, spotkanie, dodatki, czas rozpoczęcia i oderwania oraz nazwa notesu (także usuniętego).
- Gra ma galerię swoich karteczek od najnowszej, także po edycji i usunięciu notesu.

### 9.6. Usuwanie partii

- Zapisaną partię trwale usuwa tylko administrator, w spotkaniu w trakcie lub zakończonym. Usuwane są wpisy, wyniki i obraz karteczki.
- Rankingi, statystyki, serie i rekordy są liczone z zapisanych wyników przy odczycie, więc zapis i usunięcie partii zmieniają je natychmiast.

## 10. Ranking klubu

- Dwie klasyfikacje: **punkty** (suma punktów) i **wygrane** (liczba wygranych partii).
- Liczą się tylko zapisane partie, także ze spotkania w trakcie. Klasyfikowani są gracze z co najmniej jedną partią w zakresie filtrów.
- Filtry (opcjonalne, łączone): zakres dni (włącznie, w strefie klubu, według terminu spotkania) i zestaw gier. Pusty zakres dat jest błędem.
- Nie ma miejsc ex aequo. Równy wynik rozstrzygają kolejno:
  1. spotkanie, na którym gracz osiągnął swój wynik — późniejsze wyżej (gracz z wynikiem 0 niżej),
  2. punkty zdobyte na tym spotkaniu — więcej wyżej,
  3. liczba wszystkich wygranych w całej historii (bez filtrów) — więcej wyżej,
  4. imię i nazwisko alfabetycznie.
- Dla graczy z równym wynikiem dostępne jest wyjaśnienie, które kryterium zdecydowało o kolejności.
- Usunięci członkowie są klasyfikowani za aktywnymi i nigdy nie zajmują podium.
- Filtry rankingu są częścią adresu, więc ranking z filtrami można udostępnić linkiem.

## 11. Statystyki i rekordy

Wspólne zasady: liczą się tylko zapisane partie; kolejność zdarzeń wyznacza termin spotkania, a w spotkaniu czas zapisu partii. Rekordy dotyczą wartości kategorii decydującej; kierunek „lepiej” pochodzi z wersji notesu ostatniej zapisanej partii gry, a partie z wersji o innym kierunku nie są porównywane.

### 11.1. Podsumowanie spotkania

- Dla graczy z partią w spotkaniu: punkty zdobyte na spotkaniu z rozbiciem na gry, suma i miejsce w klasyfikacji punktów przed spotkaniem i po nim oraz zmiana miejsca (awans, spadek, bez zmian, nowy w rankingu).
- Podsumowanie można zawęzić do wybranych gier spotkania.
- Rekordy ustanowione w partiach spotkania (sekcja 11.4).

### 11.2. Statystyki gracza

- Z filtrami jak w rankingu: liczba spotkań z partią gracza, liczba partii, liczba wygranych.
- Z całej historii: miejsca w klasyfikacjach punktów i wygranych, suma punktów, łączna liczba wygranych, bieżąca i rekordowa **seria zwycięstw** (kolejne spotkania z co najmniej jedną wygraną).
- Ulubiona gra (najwięcej partii) i najlepsza gra (najwyższy odsetek wygranych spośród gier z co najmniej 3 partiami).
- 5 ostatnich spotkań gracza z liczbą partii, wygranych i punktów.
- **Rekordy osobiste** — najlepsza wartość gracza w każdej grze podstawowej kolekcji (z filtrami dat i gier), z dodatkami partii rekordowej.

### 11.3. Statystyki gry

- Liczba partii i termin ostatniej partii.
- Najczęściej wygrywający aktywni gracze (wszyscy przy remisie).
- **Rekord gry** — najlepsza wartość i wszyscy, którzy ją osiągnęli, z pierwszą partią, w której to zrobili.
- Średnia wartość zwycięzców.
- Ranking graczy gry: wygrane, potem punkty; przy równych obu — wspólne miejsce; usunięci na końcu.

### 11.4. Rekordy w partiach

- **Rekord klubu** — wynik lepszy od wszystkich wcześniejszych w tej grze (pierwsza partia gry ustanawia rekord).
- **Rekord osobisty** — wynik lepszy od wszystkich wcześniejszych wyników gracza w tej grze (pierwsza partia gracza w grze nie jest rekordem osobistym).
- Rekord klubu ma pierwszeństwo przed osobistym. Rekordy są wyznaczane dla zapisanych partii spotkania oraz jako podgląd dla partii przed zapisem.

## 12. Wymagania niefunkcjonalne

### 12.1. Bezpieczeństwo i prywatność

- Odmowa domyślna: brak dostępu anonimowego, a każdy zapis wymaga aktywnego konta i odpowiedniej roli. Reguły uprawnień i spójności są egzekwowane po stronie serwera niezależnie od klienta.
- Wszystkie pliki (zdjęcia profilowe, okładki, logo, zdjęcia notesów, obrazy karteczek) są prywatne i dostępne tylko dla zalogowanych członków.
- Hasła nie są logowane ani przechowywane poza mechanizmem uwierzytelniania.

### 12.2. Spójność danych

- Profile, gry i notesy są usuwane miękko; historia (partie, wyniki, spotkania) nigdy nie traci autora, gry ani wersji notesu.
- Operacje złożone (zapis spotkania, notesu, partii, publikacja gier, usunięcie partii) są atomowe.
- Operacje są odporne na ponowienia i równoległe wywołania (np. dwa urządzenia, druga karta) — nie powstają duplikaty ani niespójne stany.
- Wszystkie znaczniki czasu są przechowywane ze strefą czasową.

### 12.3. Aplikacja i praca offline

- Aplikacja webowa instalowalna jako PWA. Nowa wersja instaluje się w tle i jest aktywowana po zgodzie użytkownika; sprawdzanie aktualizacji co 30 minut i przy powrocie do aplikacji.
- Wpisy partii w toku są chronione przed utratą przy braku sieci (sekcja 9.2).
- Aplikacja jest w języku polskim; wyszukiwanie i sortowanie uwzględniają polskie znaki.

### 12.4. Kopie zapasowe

- Operator może wyeksportować, zweryfikować i odtworzyć pełną kopię danych instalacji: bazę, konta (z identyfikatorami, hashami haseł i stanem usunięcia) oraz pliki. Sesje i dzienniki nie są przenoszone.
