# BG Club — wymagania produktu

Dokument opisuje wymagane zachowanie aplikacji BG Club 2.0. Zakres bazowy to funkcje wersji 1, a dokument jest aktualizowany o zmiany wersji 2.0.

**Konwencje dokumentu**

- Zdanie w czasie teraźniejszym jest wymaganiem.
- Tekst w cudzysłowie „…” to dokładne brzmienie interfejsu.
- „Min” i „max” gry oznaczają minimalną i maksymalną liczbę graczy z formularza gry.
- Rozmiar „ok. N KB” to cel kompresji obrazu, a nie twardy limit.
- Sortowanie alfabetyczne stosuje polską kolejność znaków (porównanie dla locale `pl`), bez rozróżniania wielkości liter.

## 1. Produkt

BG Club to aplikacja webowa (PWA) jednego klubu planszówkowego. Obejmuje planowanie spotkań, głosowanie na gry, zapis partii w notesie 3D, rankingi, statystyki i osiągnięcia graczy.

**Zasady ogólne**

- Jedna instancja obsługuje dokładnie jeden klub.
- Interfejs jest wyłącznie po polsku i stosuje poprawne formy liczby mnogiej („1 partia”, „3 partie”, „5 partii”).
- Daty i godziny są wyświetlane w strefie czasowej klubu, w formacie „sobota, 28 lis 2026 · 18:00”.
- Minimalna obsługiwana szerokość ekranu to 360 px. Formularze otwierają się na telefonie jako arkusz, a na desktopie jako okno dialogowe.
- Motyw jest jasny, ciemny albo systemowy. Wybór jest zapisany w profilu i obowiązuje na wszystkich urządzeniach użytkownika.
- Historia jest nienaruszalna. Członków, gry i notesy usuwa się miękko, a ich partie, wyniki, karteczki i osiągnięcia zostają w historii.

**Role**

| Rola          | Kto                                                     | Uprawnienia                                                                                                                                                         |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator | Dokładnie jeden: pierwsze konto instancji.              | Wszystkie operacje: klub, członkowie, gry, notesy, spotkania, publikacja gier, usuwanie partii, ponowne otwarcie spotkania. Konta administratora nie da się usunąć. |
| Prowadzący    | Uczestnik wskazany w konkretnym spotkaniu (rozdział 9). | W swoim spotkaniu: rozpoczęcie i zakończenie spotkania, nowa partia, notes, zapis i porzucenie partii.                                                              |
| Gracz         | Każdy aktywny członek.                                  | Odczyt wszystkich danych klubu, głosowanie w spotkaniach, w których jest uczestnikiem, własny profil i ustawienia.                                                  |

Usunięte konto nie ma dostępu do odczytu ani zapisu, także z niewygasłym tokenem sesji.

**Pojęcia**

| Pojęcie              | Znaczenie                                                                             |
| -------------------- | ------------------------------------------------------------------------------------- |
| Członek              | Osoba z kontem w klubie, aktywna albo usunięta.                                       |
| Uczestnik            | Członek przypisany do konkretnego spotkania.                                          |
| Notes                | Szablon kartki wyników gry (rozdział 8). Każdy zapis tworzy niezmienną wersję notesu. |
| Miejsce notesu       | Pozycja na kartce przeznaczona dla jednej strony partii.                              |
| Strona               | Gracz albo zespół zajmujący jedno miejsce notesu.                                     |
| Kategoria decydująca | Kategoria notesu, której wartość wyznacza miejsca w partii.                           |
| Partia w toku        | Partia rozpoczęta i niezapisana. Jej wpisy tworzą szkic.                              |
| Partia zapisana      | Partia zapisana trwale. Wchodzi do rankingów, statystyk i osiągnięć.                  |
| Karteczka            | Obraz wypełnionej kartki, utworzony przy oderwaniu jej z notesu.                      |

## 2. Konta i logowanie

- **Hook** to login.
  - Składa się z małych liter, cyfr i myślników, np. `jan-kowalski-3f9a`.
  - Powstaje z imienia i nazwiska oraz 4 losowych znaków szesnastkowych i ma najwyżej 64 znaki.
  - Nie da się go zmienić.
- **Konto** nie ma adresu e-mail widocznego dla użytkownika. Nie ma samodzielnej rejestracji ani resetu hasła; konta zakłada wyłącznie administrator.
- **Pierwszy administrator** powstaje ze skryptu instalacyjnego uruchomionego na pustej instancji.
  - Jego hasło ma co najmniej 12 znaków.
  - Ponowne uruchomienie skryptu nie tworzy drugiego administratora.
- **Ekran logowania** ma pola „Hook” i „Hasło”. Obsługiwane błędy:
  - nieprawidłowy hook lub hasło;
  - konto usunięte;
  - zbyt wiele prób;
  - brak sieci.
- **Sesja** przetrwa odświeżenie strony. Wygaśnięcie sesji albo usunięcie konta przenosi do ekranu logowania z komunikatem.
- **Hasła:**
  - mają co najmniej 12 znaków;
  - hasło wygenerowane dla nowego konta ma 16 znaków z alfabetu bez znaków mylących (`l`, `I`, `O`, `0`, `1`).
- **Pierwsze logowanie** hasłem wygenerowanym proponuje „Ustaw własne hasło”. Propozycję można pominąć. Nie wraca po pominięciu ani po zmianie hasła.
- **Zmiana hasła** wymaga obecnego hasła oraz dwukrotnie wpisanego nowego hasła, różnego od obecnego.
- **Limity prób:**
  - **logowanie:** 5 nieudanych prób dla jednego hooka w ciągu 15 minut blokuje logowanie na ten hook na 15 minut;
  - **potwierdzenie hasłem** (zmiana hasła, usunięcie własnego konta): 5 nieudanych prób w ciągu 15 minut blokuje tę operację na koncie na 15 minut;
  - udana próba zeruje licznik;
  - komunikat blokady podaje godzinę, od której można spróbować ponownie.

## 3. Klub

- **Przed założeniem klubu:**
  - administrator widzi „Załóż swój klub” z ilustracją i przyciskiem „Dodaj klub”;
  - gracz widzi „Klub nie został jeszcze założony”.
- **Formularz klubu** („Dodaj klub” albo „Edytuj klub”):
  - **nazwa:** wymagana, najwyżej 80 znaków;
  - **logo:** opcjonalne, WebP, JPEG lub PNG, zmniejszane w przeglądarce do 800 px i ok. 100 KB. Klub bez logo ma monogram nazwy;
  - **strefa czasowa IANA:** domyślnie strefa przeglądarki. Lista ma wyszukiwarkę i pokazuje przesunięcie względem UTC.
- Strefa klubu wyznacza terminy spotkań oraz granice lat w rankingach i statystykach.
- Klub zakłada i edytuje wyłącznie administrator. Drugiego klubu nie da się założyć.

## 4. Widok klubu (hub)

- **Nagłówek:**
  - logo i nazwa klubu, a dla administratora przycisk „Edytuj klub”;
  - po prawej awatar z menu „Mój profil”, „Ustawienia”, „Wyloguj się”.
- **Widżety** mają stałą kolejność, wspólną dla układu, czytnika ekranu i klawisza Tab: 1. Spotkanie, 2. Ranking, 3. Timeline, 4. Kolekcja, 5. Członkowie.
- **Układ:**
  - desktop: dwie kolumny o niezależnych wysokościach, odstęp 24 px;
  - telefon: jedna kolumna.
- **Stany widżetu:** każdy widżet ma własny stan ładowania, błędu i pusty stan, w wariantach dla administratora i gracza.
- **Popupy** otwierają się na stosie nad hubem.
  - Każdy popup na stosie to jeden parametr `p` w adresie, np. `/?p=members&p=profile/<id>`.
  - Odświeżenie, otwarcie wysłanego linku oraz Wstecz i Dalej odtwarzają cały stos.
- **Błędne adresy:**
  - nieznany albo uszkodzony adres popupu pokazuje „Nie znaleziono”;
  - nieznana ścieżka strony pokazuje „Nie ma takiej strony” z linkiem do klubu.
- **Awatar:** kliknięcie awatara w dowolnym miejscu aplikacji otwiera profil tej osoby.

**Widżet Spotkanie** pokazuje najbliższe zaplanowane albo trwające spotkanie.

- **Nagłówek:** odliczanie („dziś”, „jutro”, „za 16 dni”) albo chip „Trwa”, oraz menu akcji zależne od roli.
- **Blok spotkania:** kafelek daty, tytuł, termin, liczba uczestników, stos awatarów pierwszych 5 uczestników i prowadzący.
- **Taca stanu:**
  - przed spotkaniem: „Najwięcej głosów”, czyli 3 gry z największą liczbą głosów, albo „Nikt jeszcze nie głosował”;
  - w trakcie: liczniki partii („2 rozegrane · 1 w toku”) i do 3 partii.
- **Pusty stan:** administrator ma przycisk „Zaplanuj spotkanie”.

**Widżet Ranking**

- Zakładki Punkty, Wygrane i Seria; zakres to cała historia.
- Pokazuje podium i kolejne miejsca. Przy remisie pokazuje najwyżej 3 awatary na miejsce i „i N więcej”.
- Link „Zobacz pełny ranking” otwiera popup rankingu na tej samej zakładce.

**Widżet Timeline**

- Pokazuje 2 najbliższe nadchodzące spotkania (zaplanowane albo trwające) i 4 ostatnie zakończone.
- Każde spotkanie ma liczbę partii i zwycięzców (puchar, stos awatarów, imiona).
- Link „Zobacz więcej w kalendarzu”.

**Widżet Kolekcja**

- Pokazuje 5 gier: najpierw ostatnio grane, potem gry bez partii od najnowszej dodanej.
- Pierwsza gra jest wyróżniona okładką.
- Licznik obejmuje wszystkie aktywne gry. Administrator ma „Dodaj grę”.

**Widżet Członkowie**

- Liczba osób, stos awatarów i imiona („Bartek, Ania, Ewa, Julia i 8 innych osób”).
- Link „Wszyscy członkowie: N”, a dla administratora „Dodaj członka”.

## 5. Członkowie

- **Popup Członkowie** zawiera listę aktywnych członków: awatar, imię i nazwisko, hook oraz badge „Ty” i „Admin”.
  - Wyszukiwarka dopasowuje imię, nazwisko lub hook, bez rozróżniania wielkości liter i polskich znaków.
- **„Dodaj członka”** (wyłącznie administrator): pola imię i nazwisko, oba wymagane, najwyżej 50 znaków każde.
  - Po zapisie aplikacja jednorazowo pokazuje hook i hasło, z przyciskami kopiowania i ostrzeżeniem, że hasła nie da się odczytać ponownie.
  - Akcje: „Gotowe” i „Dodaj kolejnego”.
  - Błąd sieci przy dodawaniu każe sprawdzić listę członków przed ponowieniem, bo konto mogło już powstać.
- **„Usuń członka”** (wyłącznie administrator, w profilu członka) wymaga potwierdzenia i jest nieodwracalne.
  - Członek znika z listy członków i z zaplanowanych spotkań, razem ze swoimi głosami.
  - Jego konto przestaje działać.
  - Jego partie, wyniki i osiągnięcia zostają w historii. Profil usuniętego członka jest tylko do odczytu i ma adnotację o usunięciu.
  - **Członek prowadzący zaplanowane albo trwające spotkanie:**
    - jeśli administrator jest uczestnikiem tego spotkania, prowadzenie przechodzi na administratora;
    - w przeciwnym razie usunięcie jest zablokowane do zakończenia spotkania albo do zmiany prowadzącego. Komunikat wskazuje spotkanie.

## 6. Profil i ustawienia

- **Profil** zawiera awatar, imię i nazwisko, hook, statystyki gracza (rozdział 14) i gablotę osiągnięć (rozdział 15).
  - We własnym profilu jest przycisk „Ustawienia”.
  - Administrator w cudzym profilu ma „Usuń członka”.
- **Ustawienia** mają trzy sekcje:
  - **Profil:**
    - zdjęcie JPG, PNG lub WebP do 25 MB, kadrowane do kwadratu: przeciąganie, powiększenie do 400 %, obsługa klawiaturą. Zapisywany obraz ma 256 × 256 px i najwyżej 1 MB. Profil bez zdjęcia ma inicjały;
    - imię i nazwisko, najwyżej 50 znaków każde. Hook się nie zmienia;
  - **Wygląd:** motyw „Jasny”, „Ciemny” albo „Systemowy”;
  - **Konto:** hook, „Zmień hasło”, „Wyloguj się” i „Usuń konto”. Administrator nie ma opcji „Usuń konto”.
- **Usunięcie własnego konta:**
  - wymaga potwierdzenia obecnym hasłem, z limitem prób (rozdział 2);
  - ma te same skutki i ograniczenia co usunięcie członka (rozdział 5);
  - kończy się powrotem do ekranu logowania z podziękowaniem.

## 7. Kolekcja gier

- **Popup Kolekcja** zawiera wszystkie aktywne gry: okładkę, tytuł i liczbę graczy („2–4 graczy”).
  - Wyszukiwarka filtruje po tytule, bez rozróżniania polskich znaków.
  - Administrator ma przy każdej grze menu: „Edytuj”, „Notesy”, „Usuń”.
- **Formularz gry** (wyłącznie administrator):
  - **okładka:** opcjonalna, WebP, JPEG lub PNG, zmniejszana do 800 px i ok. 100 KB. Gra bez okładki ma monogram tytułu;
  - **tytuł:** wymagany, najwyżej 120 znaków;
  - **liczba graczy:** min ≥ 1, max ≥ min. Nie ma globalnego limitu graczy;
  - **skomplikowanie:** od 1,00 do 5,00, najwyżej dwa miejsca po przecinku. Wymagane dla nowej gry oraz przy edycji gry, która nie ma jeszcze skomplikowania;
  - **punkty za miejsca:** jedna wartość dla każdego miejsca od 1. do max. Wartość ≥ 0, najwyżej 999 999,99, najwyżej dwa miejsca po przecinku.
    - Wpisanie albo zmiana skomplikowania przelicza punkty ze wzoru.
    - Ręczna zmiana punktów jest dozwolona. Wtedy formularz pokazuje „Punkty różnią się od wyliczonych ze wzoru” i akcję „Przelicz ze wzoru”.
    - Gdy niższe miejsce ma więcej punktów niż wyższe, formularz pokazuje ostrzeżenie, ale pozwala zapisać.
- **Zmiana punktacji** nie zmienia rozegranych partii, bo każda partia ma kopię punktacji z chwili rozpoczęcia.
- **Usunięcie gry** jest miękkie i nieodwracalne.
  - Gra znika z kolekcji, wyszukiwania, głosowań i list „Gramy w” zaplanowanych spotkań.
  - Jej partie, karteczki i punkty zostają.
- **Szczegóły gry:**
  - okładka i metadane: ostatnia partia, skomplikowanie „N / 5”, „Łącznie głosów: N”;
  - statystyki gry (rozdział 14);
  - galeria oderwanych karteczek, od najnowszej.

**Wzór punktacji ze skomplikowania** (w = skomplikowanie, n = max gry, p = miejsce):

```
points(p) = round( M(w) × 20 × [0,1 + 0,9 × (n − p) / (n − 1)] × (1 + 0,03 × (n − 2)), 1 )
M(w)      = 1 + 2 × (w − 1) / 4
```

- Dla n = 1 czynnik miejsca `[…]` wynosi 1.
- Ostatnie miejsce dostaje 10 % punktów zwycięzcy.

## 8. Notesy punktacji

Notes to szablon kartki wyników gry: zdjęcie pustej kartki z zaznaczonymi polami, kategoriami i regułą wyznaczania miejsc. Gra może mieć kilka notesów.

- **Lista notesów gry:** miniatura, nazwa, liczba miejsc notesu i numer wersji.
  - Notes z mniejszą liczbą miejsc niż max gry ma dopisek „Tylko partie do N graczy”.
  - Akcje administratora: „Edytuj”, „Zmień nazwę” (nie tworzy wersji), „Eksportuj do pliku”, „Usuń”.
  - Dodawanie: „Dodaj notes” albo „Importuj plik”.
- **Wersje:**
  - każdy zapis notesu tworzy nową, niezmienną wersję;
  - partie zapisane i partie w toku pozostają przy swojej wersji;
  - zdjęcia wersji nie są usuwane.
- **Plik notesu:** format `.json` v2 (score-pad) ze zdjęciem kartki do 5 MB (WebP, JPEG lub PNG). Import tworzy nowy notes, a eksport zapisuje bieżącą wersję.
- **Usunięcie notesu** jest miękkie: notes znika z listy i z wyboru przy nowej partii, a historia zostaje.

**Edytor notesu** to kreator pięciu kroków z paskiem postępu. Wyjście z niezapisanymi zmianami wymaga potwierdzenia.

1. **Zdjęcie:**
   - źródła: przeciągnięcie, wklejenie ze schowka, wybór pliku, zdjęcie kamerą;
   - wskazówki wykonania dobrego zdjęcia;
   - import z pliku `.json`.

   Zastąpienie zdjęcia zeruje obszar, pola i kategorie, a zachowuje nazwę i kolor.

2. **Obszar kartki:**
   - nazwa notesu, wymagana;
   - kolor grzbietu, jeden z 11;
   - obrót i cofanie (Ctrl+Z);
   - obszar: całe zdjęcie, obszar wykryty automatycznie albo ręczny wielokąt z lupą podczas przeciągania. Punkt wielokąta dodaje kliknięcie krawędzi, a usuwa dwuklik albo przytrzymanie;
   - wygładzanie krawędzi z regulacją siły;
   - rozmiar kartki od 3 do 60 cm;
   - grzbiet u góry albo z lewej.

3. **Mapowanie pól:**
   - tryb „Prostokąty ręczne”: po narysowaniu pola edytor przechodzi do następnej kategorii tego samego miejsca. Pola można powielić dla kolejnego miejsca;
   - tryb „Wykryj tabelę”: linie z uchwytami, gracze w kolumnach albo wierszach, kolumny opisu, pomijanie miejsc;
   - dodawanie i usuwanie miejsc oraz kategorii;
   - powiększanie gestem dwóch palców albo Ctrl + kółko myszy.

   Zmiana trybu usuwa pola i kategorie.

4. **Kategorie:**
   - **zakładka „Kategorie”:**
     - nazwa, typ i opis (pokazywany w chmurce);
     - typy:
       - „Nazwa gracza”, dokładnie jedna, z opcją „Zespoły”;
       - „Punktacja”, co najmniej jedna;
       - „Suma wybranych kategorii”, bez cykli;
       - „Premia ze starszych notesów”;
       - „Puste pole”;
     - zakres wartości: dowolna liczba całkowita, min–max z krokiem albo lista wartości;
   - **zakładka „Wygrana i remisy”:**
     - kategoria decydująca, domyślnie suma wszystkich punktacji;
     - kierunek: „więcej = lepiej” albo „mniej = lepiej”;
     - uporządkowana lista reguł remisu: kategoria z kierunkiem, „Rozstrzyga prowadzący”, „Wspólne miejsce”. Reguły po „Wspólnym miejscu” nigdy nie są stosowane.

   Panel „Do poprawy” wymienia błędy blokujące zapis.

5. **Test i zapis:**
   - notes działa jak w partii, z fikcyjnymi graczami;
   - akcje „Wypełnij losowo” i „Wymuś remis”;
   - oderwanie kartki pokazuje wynik testu: miejsca i kategorię, która rozstrzygnęła remis;
   - test jest opcjonalny, a testowe karteczki nie są zapisywane.

   Zapis notesu z mniejszą liczbą miejsc niż max gry kończy się ostrzeżeniem.

## 9. Spotkania

- **Statusy:** zaplanowane, w trakcie, zakończone. W danej chwili trwa najwyżej jedno spotkanie.
- **Formularz spotkania** (wyłącznie administrator):
  - **tytuł:** wymagany, najwyżej 120 znaków;
  - **data i godzina:** w krokach co 30 minut, w strefie klubu, nie w przeszłości. Godzina nieistniejąca z powodu zmiany czasu jest odrzucana;
  - **uczestnicy:** co najmniej jeden; akcja „Zaznacz wszystkich” i licznik „Wybrano N z M”;
  - **prowadzący:** jeden z uczestników, domyślnie administrator, jeśli jest uczestnikiem. Usunięcie prowadzącego z listy uczestników wymaga wskazania nowego prowadzącego.

  Zapis spotkania otwiera głosowanie.

- **Dozwolone zmiany według statusu:**
  - **zaplanowane:** wszystkie pola. Usunięcie uczestnika usuwa jego głosy. Spotkanie, którego termin minął, administrator może edytować bez zmiany terminu; nowy termin nie może być w przeszłości;
  - **w trakcie:** wyłącznie dopisanie uczestnika, zmiana prowadzącego i usunięcie uczestnika, który nie ma partii;
  - **zakończone:** żadne.
- **Usunięcie spotkania** (administrator, z potwierdzeniem) usuwa jego uczestników i głosy.
  - Spotkania w trakcie nie da się usunąć.
  - Zakończone spotkanie da się usunąć dopiero po usunięciu wszystkich jego partii.
- **Menu spotkania:**

  | Status      | Administrator                                                  | Prowadzący          |
  | ----------- | -------------------------------------------------------------- | ------------------- |
  | Zaplanowane | „Edytuj”, „Otwórz głosowanie ponownie” (po publikacji), „Usuń” | —                   |
  | W trakcie   | „Dodaj uczestnika”, „Zmień prowadzącego”                       | „Zakończ spotkanie” |
  | Zakończone  | „Otwórz spotkanie ponownie”, „Usuń” (bez partii)               | —                   |
  - W widżecie Spotkanie administrator ma dodatkowo „Zaplanuj kolejne spotkanie”.
  - Rozpoczęcie i zakończenie spotkania są dostępne w polu akcji popupu spotkania.

- **Popup spotkania:**
  - nagłówek ze statusem, terminem i prowadzącym;
  - lista uczestników;
  - pole akcji dla administratora i prowadzącego;
  - przed rozpoczęciem: głosowanie i lista „Gramy w”;
  - od rozpoczęcia: partie, podsumowanie i osiągnięcia spotkania.
- **Kalendarz:**
  - siatka miesiąca od poniedziałku, z kolorami statusów i legendą;
  - przechodzenie między miesiącami i przycisk „Dziś”;
  - agenda „W tym miesiącu”;
  - kliknięcie pustego dnia przez administratora otwiera formularz spotkania z tą datą.
- **Rozpoczęcie** (administrator albo prowadzący, z potwierdzeniem) zamyka głosowanie i pozwala zapisywać partie.
- **Zakończenie** jest zablokowane, dopóki istnieją partie w toku. Dialog wymienia je i wymaga zapisania albo porzucenia każdej z nich.
- **Ponowne otwarcie zakończonego spotkania** (wyłącznie administrator) przywraca status „W trakcie”, żeby dograć partie. Historia, partie i karteczki zostają.

## 10. Głosowanie i publikacja gier

- **Głosowanie** jest otwarte od zapisania spotkania.
  - Głosują wyłącznie uczestnicy, po jednym głosie na każdą wybraną grę z kolekcji; liczba gier nie jest ograniczona.
  - Głos można cofnąć, dopóki głosowanie jest otwarte.
  - Głosy są jawne: przy grze widać liczbę głosów i głosujących.
  - Gra niepasująca do liczby uczestników ma oznaczenie „Dla 2–4 graczy”, ale można na nią głosować.
  - Lista ma wyszukiwarkę i licznik „Twoje głosy: N”.
- **„Opublikuj gry”** (wyłącznie administrator):
  - pozwala wybrać dowolne aktywne gry, także bez głosów;
  - zamyka głosowanie i pokazuje listę „Gramy w”;
  - ponowna publikacja zastępuje listę.
- **„Otwórz głosowanie ponownie”** (administrator, wyłącznie przed rozpoczęciem spotkania) usuwa listę „Gramy w” i zachowuje głosy.
- **Łączna liczba głosów gry** to suma istniejących głosów na nią ze wszystkich spotkań.

## 11. Partie

**Nowa partia** (administrator albo prowadzący, wyłącznie w spotkaniu w trakcie) to trzy kroki oznaczone pigułkami:

1. **Gra:** najpierw gry opublikowane („Gramy w”), potem reszta kolekcji. Gra niedostępna jest wyłączona z podaniem przyczyny:
   - brak notesu;
   - gra jednoosobowa;
   - żaden notes nie mieści wymaganej liczby graczy;
   - za mało uczestników.
2. **Notes:** wybór notesu. Krok jest pomijany, gdy pasuje dokładnie jeden notes.
3. **Gracze:** przypisanie uczestników do miejsc notesu, jeden gracz na miejscu. Pozostali uczestnicy są na liście „Poza partią”.
   - Liczba graczy n spełnia max(2, min gry) ≤ n ≤ min(max gry, liczba miejsc notesu).
   - W notesie z zespołami na jednym miejscu może siedzieć kilku graczy, a partia ma co najmniej 2 strony.

W spotkaniu może trwać kilka partii jednocześnie. Ponowienie rozpoczęcia partii po błędzie sieci nie tworzy duplikatu.

**Partia w toku**

- **Notes 3D:** kartka do wpisów, z obrotem i powiększaniem.
  - Dostęp mają wyłącznie administrator i prowadzący, także z innego urządzenia.
  - Pozostali widzą „Trwa partia · od 18:10” i listę graczy.
- **Szkic:**
  - wpisy są zapisywane w bazie z opóźnieniem 1–2 s;
  - kopia szkicu zostaje na urządzeniu na wypadek odświeżenia, awarii albo braku sieci;
  - status szkicu jest widoczny: zapisany, czeka, zapisywanie, brak sieci, serwer nie odpowiada.
- **Konflikt szkicu:** gdy szkic zmienił się na innym urządzeniu, użytkownik wybiera „Wczytaj szkic z bazy” albo „Zachowaj wpisy z tego urządzenia”. Wybór wpisów lokalnych nadpisuje szkic w bazie. Synchronizacji na żywo nie ma.
- **„Porzuć”** (z potwierdzeniem) usuwa szkic bez śladu w historii i statystykach.
- **„Oderwij kartkę”** kończy wpisywanie i pokazuje podsumowanie: miejsca, oznaczenia „Wspólne miejsce” i „Wygrana”, wynik i punkty do rankingu.
  - „Wróć do kartki” przywraca kartkę na notes.
  - „Zapisz partię” zapisuje partię trwale. Zapisanej partii nie można zmienić.
  - Ponowienie zapisu po błędzie sieci nie zapisuje partii dwukrotnie.

**Miejsca, remisy i punkty**

- Miejsca wyznacza wartość kategorii decydującej, w kierunku określonym w notesie. Puste pole jest gorsze od każdej liczby.
- Remisy rozstrzygają kolejne reguły remisu, stosowane wyłącznie do stron nadal zremisowanych.
  - „Rozstrzyga prowadzący”: przy oderwaniu kartki prowadzący ustala kolejność w każdej grupie remisu. Ta sama pozycja oznacza wspólne miejsce.
  - Remis nierozstrzygnięty daje wspólne miejsce, a numeracja pomija zajęte miejsca („1, 1, 3”).
- Kartki nie da się zapisać, gdy żadna strona nie ma wartości w kategorii decydującej.
- **Punkty:** w partii z n stronami liczą się ostatnie n pozycji punktacji gry.
  - Strona na 1. miejscu dostaje punkty za miejsce (max gry − n + 1), a strona ostatnia za miejsce max gry.
  - Przykład: gra 2–6 graczy, partia 4 stron, punktowane są miejsca 3–6.
  - Strony we wspólnym miejscu dostają średnią punktów zajętych miejsc, zaokrągloną w dół do setnych.
- **Wygrana:** każda strona na 1. miejscu, także wspólnym. Każdy członek zespołu dostaje pełne punkty miejsca zespołu i wygraną, bez dzielenia.
- Punkty, remisy i wygrane wylicza serwer.

**Karteczki**

- Przy oderwaniu notes tworzy obraz kartki z wpisami (WebP, ok. 150 KB). Brak obrazu nie blokuje zapisu, bo wpisy i wersja notesu wystarczają do ponownego wyrenderowania kartki.
- **Partia na liście spotkania:** „Partia 1 · 18:10 · 5 graczy”, miniatura karteczki i wiersze wyników (miejsce, awatar, imię, wynik, punkty).
- **Popup karteczki:**
  - powiększony obraz albo podgląd 3D tylko do odczytu (obrót, powiększanie);
  - wyniki, notes i link do spotkania.
- Obrazy osierocone przez przerwany zapis są usuwane automatycznie, gdy administrator otwiera spotkanie.
- **„Usuń partię”** (wyłącznie administrator, partia zapisana, z potwierdzeniem) trwale usuwa partię z karteczką i wynikami. Rankingi, statystyki, serie i osiągnięcia są przeliczane bez niej.

## 12. Ranking

- **Klasyfikacje:**
  - **Punkty:** suma punktów;
  - **Wygrane:** liczba wygranych partii;
  - **Seria:** najdłuższa seria zwycięstw.
- **Seria** jest liczona po spotkaniach gracza w kolejności chronologicznej:
  - spotkanie z co najmniej jedną wygraną gracza zwiększa serię o 1, niezależnie od liczby wygranych;
  - spotkanie z partiami gracza bez wygranej zeruje serię;
  - spotkanie bez partii gracza nie zmienia serii.
- **Zakres:** „Cała historia” albo rok kalendarzowy w strefie klubu.
  - Lista lat obejmuje lata, w których są partie.
  - W zakresie roku seria jest liczona wyłącznie z jego spotkań.
- **Klasyfikowani gracze:** gracze z co najmniej jedną partią zapisaną w zakresie. Liczą się partie zapisane, także w spotkaniu w trakcie; szkice nie.
- **Miejsca:**
  - równe wyniki dają wspólne miejsce, a w jego obrębie gracze są posortowani alfabetycznie po imieniu, potem po nazwisku;
  - usunięci członkowie są za wszystkimi aktywnymi, z dalszą numeracją miejsc, i nigdy nie stają na podium.
- **Popup rankingu:** zakładki, wybór zakresu, podium i lista kolejnych miejsc.
- **Puste stany:** „Ranking pojawi się po pierwszej partii” i „Brak partii w {rok}”.

## 13. Kolejność zdarzeń

- Wszystkie wyliczenia historii stosują jedną kolejność:
  - spotkania według terminu, potem identyfikatora;
  - partie w spotkaniu według chwili zapisu, potem identyfikatora.
- Rankingi, statystyki i podsumowania są wyliczane z zapisanych wyników przy odczycie. Zapis i usunięcie partii są w nich widoczne natychmiast.

## 14. Statystyki

**Statystyki gracza** (w profilu, z filtrem: cała historia albo rok):

- **Liczniki:**
  - spotkania z co najmniej jedną partią gracza;
  - partie, wygrane, procent wygranych, punkty;
  - najdłuższa i bieżąca seria.
- **Miejsca w trzech klasyfikacjach rankingu** dla tego samego zakresu. Usunięty członek ma „Brak miejsca”.
- **Ulubiona gra:** najczęściej grana. Remis rozstrzyga większa liczba wygranych, potem tytuł alfabetycznie.
- **Najlepsza gra:** najwyższy procent wygranych spośród gier z co najmniej 3 partiami gracza. Bez takiej gry: „Zagraj co najmniej 3 partie jednej gry”.
- **Ostatnie partie:** najwyżej 10, od najnowszej: gra, miejsce, punkty i link do spotkania.

**Statystyki gry** (w szczegółach gry):

- **Partie:** liczba partii i data ostatniej.
- **Najczęściej wygrywa:** gracz z największą liczbą wygranych; przy remisie wszyscy zremisowani. Usunięci członkowie nie są wyróżniani.
- **Rekord gry:** najlepsza wartość kategorii decydującej. Przy każdym rekordziście jest pierwsza partia, w której ją osiągnął, z linkiem do spotkania.
  - Kierunek pochodzi z wersji notesu ostatniej partii gry.
  - Partie notesów o przeciwnym kierunku nie są brane pod uwagę.
- **Średni wynik zwycięzcy.**
- **Ranking graczy w grze:** według wygranych, potem punktów.

**Podsumowanie spotkania** obejmuje graczy z co najmniej jedną partią w spotkaniu. Dla każdego gracza:

- punkty do rankingu z rozbiciem na gry („Azul +12, Carcassonne ×2”);
- wygrane;
- zmiana serii: „+1 → seria 4”, „seria przerwana” albo „seria bez zmian”.

Kolejność: punkty malejąco, usunięci członkowie na końcu.

## 15. Osiągnięcia

- **Przeliczanie:** serwer przelicza osiągnięcia w tej samej transakcji co:
  - zapis i usunięcie partii;
  - zakończenie i ponowne otwarcie spotkania;
  - zamknięcie głosowania;
  - zmiana terminu spotkania z zamkniętym głosowaniem;
  - usunięcie spotkania.

  Przeliczenie odtwarza całą historię. Po usunięciu partii osiągnięcia, których warunek przestał być spełniony, znikają, a daty odblokowania są korygowane.

- **Data odblokowania:** termin spotkania, na którym warunek został spełniony po raz pierwszy.
- **Gablota:**
  - cały katalog w grupach i licznik „N z 29”;
  - odblokowane odznaki są kolorowe, z datą;
  - zablokowane odznaki są wyszarzone, z opisem albo postępem („7/10”).
- **Szczegóły odznaki:** warunek, data i spotkanie odblokowania. Gablota usuniętego członka jest tylko do odczytu.
- **Osiągnięcia spotkania:** odblokowania, których datą jest to spotkanie.
- **Powiadomienie:** po zapisie partii osoba zapisująca dostaje toast „Nowe osiągnięcie” z akcją „Zobacz”, wyłącznie dla odblokowań powstałych w tym zapisie.

| Grupa        | Id                       | Nazwa                                                  | Warunek                                                                                                      |
| ------------ | ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Spotkania    | meet-1 / -10 / -25 / -50 | Pierwsze kroki / Stały bywalec / Weteran / Filar klubu | 1 / 10 / 25 / 50 spotkań z co najmniej jedną partią                                                          |
| Partie       | play-10 / -50 / -100     | Rozgrzewka / Zapalony gracz / Setka                    | 10 / 50 / 100 partii                                                                                         |
| Partie       | marathon                 | Maratończyk                                            | Co najmniej 5 partii na jednym spotkaniu                                                                     |
| Wygrane      | win-1 / -10 / -50        | Pierwsza wygrana / Zwycięzca / Mistrz                  | 1 / 10 / 50 wygranych                                                                                        |
| Wygrane      | hattrick                 | Hat-trick                                              | Co najmniej 3 wygrane na jednym spotkaniu                                                                    |
| Wygrane      | flawless                 | Bez skazy                                              | Wygrane wszystkie partie gracza w zakończonym spotkaniu, co najmniej 3                                       |
| Serie        | streak-3 / -5 / -10      | W gazie / Nie do zatrzymania / Legenda                 | Seria zwycięstw 3 / 5 / 10                                                                                   |
| Różnorodność | explorer-10 / -25        | Odkrywca / Ludoznawca                                  | 10 / 25 różnych gier                                                                                         |
| Różnorodność | versatile-5              | Wszechstronny                                          | Wygrane w 5 różnych grach                                                                                    |
| Różnorodność | specialist               | Specjalista                                            | 10 wygranych w jednej grze                                                                                   |
| Wyjątkowe    | beginners-luck           | Szczęście debiutanta                                   | Wygrana w pierwszej partii danej gry                                                                         |
| Wyjątkowe    | record                   | Rekordzista                                            | Wynik lepszy od wszystkich wcześniejszych partii gry; pierwsza partia gry i wyrównanie rekordu się nie liczą |
| Wyjątkowe    | big-table                | Wielki stół                                            | Partia z co najmniej 6 graczami                                                                              |
| Wyjątkowe    | tie-top                  | Ex aequo                                               | Wspólne 1. miejsce różnych stron; wygrana w ramach jednego zespołu się nie liczy                             |
| Wyjątkowe    | comeback                 | Powrót z popiołów                                      | Wygrana na pierwszym spotkaniu po przerwaniu serii co najmniej 3                                             |
| Wyjątkowe    | lantern-10               | Czerwona latarnia                                      | 10 razy ostatnie miejsce, także wspólne, z wyjątkiem partii, w których wszyscy dzielą 1. miejsce             |
| Punkty       | pts-100 / -500           | Setka punktów / Pół tysiąca                            | 100 / 500 punktów rankingu                                                                                   |
| Klub         | voter-10                 | Głos ludu                                              | Głos w 10 głosowaniach                                                                                       |

„Głos ludu”: zaliczone jest spotkanie, w którym gracz miał co najmniej jeden głos w chwili zamknięcia głosowania. Późniejsze cofnięcie głosów nie odbiera zaliczenia, a wielokrotne zamknięcie głosowania w tym samym spotkaniu liczy się raz.

## 16. Aplikacja instalowana

- Aplikację można zainstalować (manifest, ikony, service worker).
- Zasoby aplikacji działają z pamięci podręcznej; dane wymagają sieci.
- Brak internetu pokazuje stały komunikat. Wpisy w notesie czekają na urządzeniu i zapisują się automatycznie po powrocie sieci.
- **Aktualizacja:**
  - nowa wersja instaluje się w tle;
  - aplikacja pokazuje „Dostępna nowa wersja” z przyciskiem „Odśwież” i przełącza się dopiero po jego kliknięciu;
  - odświeżenie jest zablokowane, dopóki szkic partii ma wpisy niezapisane w bazie;
  - aktualizacja wykonana w innej karcie wyświetla komunikat w bieżącej karcie.

## 17. Wymagania niefunkcjonalne

- **Bezpieczeństwo:**
  - dostęp jest domyślnie zabroniony;
  - każdy odczyt wymaga aktywnego profilu;
  - operacje zmieniające kilka tabel (spotkanie, partia, notes, głosowanie) są atomowe po stronie serwera i same sprawdzają uprawnienia;
  - klucz serwera nigdy nie trafia do przeglądarki; build z kluczem serwera kończy się błędem.
- **Spójność:**
  - równoległe operacje są szeregowane, m.in. dwa rozpoczęcia spotkania, dwa zapisy partii i przeliczenia osiągnięć;
  - ponowienie operacji po błędzie sieci jest bezpieczne.
- **Błędy:**
  - każdy błąd reguły ma komunikat po polsku;
  - komunikat błędu sieci mówi, co zostało zapisane i czy ponowienie jest bezpieczne.
- **Dostępność:**
  - kontrast WCAG AA w obu motywach;
  - pełna obsługa klawiaturą;
  - etykiety dla czytnika ekranu;
  - kolejność w dokumencie zgodna z kolejnością wizualną.
- **Wydajność:**
  - notes i edytor 3D ładują się leniwie;
  - początkowy JS ma najwyżej 215 KB po gzip, a CSS najwyżej 30 KB;
  - aplikacja działa płynnie na telefonie średniej klasy i w sieci „Slow 4G”;
  - obrazy są skalowane w przeglądarce przed wysłaniem.
- **Prywatność:** dane testowe są fikcyjne. Aplikacja nie zbiera adresów e-mail ani danych spoza klubu.
- **Kopie zapasowe:**
  - eksport, weryfikacja i odtworzenie całej instancji: bazy, kont z hasłami i plików;
  - ćwiczenie odtworzenia jest częścią testów.
- **Migracja z wersji 1:** dane instancji wersji 1 (baza, konta z hasłami, pliki) dają się przenieść do wersji 2.0 bez utraty historii.
