# BG Club — wymagania produktu

## 1. Produkt

BG Club to aplikacja webowa (PWA) jednego klubu planszówkowego. Klub planuje spotkania, głosuje na gry, zapisuje partie w cyfrowym notesie 3D i prowadzi rankingi, statystyki oraz osiągnięcia graczy.

**Zasady ogólne**

- Jedna instancja aplikacji obsługuje dokładnie jeden klub.
- Interfejs jest wyłącznie po polsku, z poprawnymi formami liczby mnogiej („1 partia”, „3 partie”, „5 partii”).
- Daty i godziny pokazujemy w strefie czasowej klubu, w formacie „sobota, 28 lis 2026 · 18:00”.
- Działa od szerokości 360 px. Na telefonie formularze otwierają się jako arkusz, a na desktopie jako okno.
- Motyw jest jasny, ciemny albo systemowy. Wybór zapisujemy w profilu, więc obowiązuje na każdym urządzeniu.
- Historia jest nienaruszalna. Usunięcie członka, gry albo notesu jest miękkie: partie, wyniki, karteczki i osiągnięcia zostają w historii.

**Role**

| Rola          | Kto                                        | Uprawnienia                                                                                                                             |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator | Dokładnie jeden, pierwsze konto instancji. | Wszystko: klub, członkowie, gry, notesy, spotkania, publikacja gier, usuwanie partii, ponowne otwarcie spotkania. Nie da się go usunąć. |
| Prowadzący    | Uczestnik wskazany w konkretnym spotkaniu. | W swoim spotkaniu: rozpoczęcie i zakończenie, nowa partia, notes, zapis i porzucenie partii.                                            |
| Gracz         | Każdy aktywny członek.                     | Przegląd wszystkiego, głosowanie w spotkaniach, w których jest uczestnikiem, własny profil i ustawienia.                                |

Konto usunięte nie widzi żadnych danych i niczego nie zapisze, nawet z ważnym jeszcze tokenem.

## 2. Konta i logowanie

- **Hook** to login: małe litery, cyfry i myślniki, np. `jan-kowalski-3f9a`. Powstaje z imienia i nazwiska oraz 4 losowych znaków szesnastkowych i ma najwyżej 64 znaki. Nie da się go zmienić.
- Konto nie ma e-maila widocznego dla użytkownika. Nie ma samodzielnej rejestracji ani resetu hasła: konta zakłada wyłącznie administrator.
- **Pierwszy administrator** powstaje skryptem instalacyjnym na pustej instancji. Jego hasło ma co najmniej 12 znaków, a ponowne uruchomienie skryptu nie utworzy drugiego administratora.
- **Ekran logowania** ma pola hook i hasło. Błędy:
  - nieprawidłowy hook lub hasło;
  - konto usunięte;
  - zbyt wiele prób;
  - brak sieci.
- Sesja przetrwa odświeżenie strony. Wygaśnięcie sesji albo usunięcie konta wraca do logowania z komunikatem.
- **Hasła:**
  - mają co najmniej 12 znaków;
  - hasło wygenerowane dla nowego konta ma 16 znaków z alfabetu bez znaków mylących (bez `l`, `I`, `O`, `0`, `1`).
- **Pierwsze logowanie** hasłem wygenerowanym proponuje ustawienie własnego („Ustaw własne hasło”). Propozycję można pominąć i nie wraca po pominięciu ani po zmianie hasła.
- **Zmiana hasła** wymaga obecnego hasła oraz dwukrotnie wpisanego nowego, różnego od obecnego.

## 3. Klub

- **Przed założeniem klubu** administrator widzi „Załóż swój klub” z ilustracją i przyciskiem „Dodaj klub”. Gracz widzi „Klub nie został jeszcze założony”.
- **Formularz klubu** („Dodaj klub” albo „Edytuj klub”) ma:
  - **nazwę:** wymagana, najwyżej 80 znaków;
  - **logo:** opcjonalne, WebP, JPEG lub PNG, zmniejszane w przeglądarce do 800 px i ok. 100 KB. Bez logo pokazujemy monogram nazwy;
  - **strefę czasową IANA:** domyślnie strefa przeglądarki, lista z wyszukiwaniem i przesunięciem UTC.
- Strefa klubu wyznacza terminy spotkań i granice lat w rankingach i statystykach.
- Klub zakłada i edytuje tylko administrator. Drugiego klubu nie da się założyć.

## 4. Widok klubu (hub)

- **Nagłówek:** logo i nazwa klubu, a dla administratora „Edytuj klub”. Po prawej awatar z menu: „Mój profil”, „Ustawienia”, „Wyloguj się”.
- **Widżety** są zawsze w tej samej kolejności (czytnik ekranu, Tab): 1 Spotkanie, 2 Ranking, 3 Timeline, 4 Kolekcja, 5 Członkowie.
- **Układ:** na desktopie dwie kolumny o niezależnych wysokościach z odstępem 24 px, a na telefonie jedna kolumna. Każdy widżet ma własny stan ładowania, błędu i pusty stan, z wersją dla administratora i dla gracza.
- **Popupy** otwierają się na stosie nad hubem. Każdy popup na stosie to parametr `p` w adresie (np. `/?p=members&p=profile/<id>`), więc odświeżenie, wysłany link i Wstecz/Dalej odtwarzają cały stos.
- **Nieznany albo uszkodzony adres popupu** pokazuje „Nie znaleziono”. Nieznana ścieżka strony pokazuje „Nie ma takiej strony” z linkiem do klubu.
- **Kliknięcie awatara** w dowolnym miejscu aplikacji otwiera profil tej osoby.

**Widżet Spotkanie** (najbliższe zaplanowane albo trwające spotkanie):

- **nagłówek:** odliczanie („dziś”, „jutro”, „za 16 dni”) albo chip „Trwa” oraz menu akcji zależne od roli;
- **blok spotkania:** kafelek daty, tytuł, termin, liczba uczestników, stos awatarów (pierwszych 5) i prowadzący;
- **taca stanu:**
  - przed spotkaniem: „Najwięcej głosów”, czyli 3 gry z największą liczbą głosów, albo „Nikt jeszcze nie głosował”;
  - w trakcie: „2 rozegrane · 1 w toku” i do 3 partii;
- **pusty stan:** administrator ma przycisk „Zaplanuj spotkanie”.

**Widżet Ranking:** zakładki Punkty / Wygrane / Seria dla całej historii. Pokazuje podium i kolejne miejsca, a przy remisie najwyżej 3 awatary na miejsce oraz „i N więcej”. Link „Zobacz pełny ranking” otwiera popup na tej samej zakładce.

**Widżet Timeline:** 2 najbliższe nadchodzące (zaplanowane albo trwające) i 4 ostatnie zakończone spotkania. Każde ma liczbę partii i zwycięzców (puchar, stos awatarów, imiona). Link „Zobacz więcej w kalendarzu”.

**Widżet Kolekcja:** 5 gier w kolejności: ostatnio grane, potem gry bez partii od najnowszej dodanej. Pierwsza gra jest wyróżniona okładką. Licznik pokazuje wszystkie gry, a administrator ma „Dodaj grę”.

**Widżet Członkowie:** liczba osób, stos awatarów i imiona („Bartek, Ania, Ewa, Julia i 8 innych osób”), link „Wszyscy członkowie: N”, a dla administratora „Dodaj członka”.

## 5. Członkowie

- **Popup Członkowie** pokazuje listę aktywnych członków: awatar, imię i nazwisko, hook oraz badge „Ty” i „Admin”. Wyszukiwarka działa bez polskich znaków i wielkości liter, po imieniu, nazwisku lub hooku.
- **„Dodaj członka”** (tylko administrator) ma pola imię i nazwisko, wymagane, najwyżej 50 znaków każde.
  - Po zapisie aplikacja pokazuje jednorazowo hook i hasło z przyciskami kopiowania i ostrzeżeniem, że hasła nie da się odczytać ponownie.
  - Dostępne akcje to „Gotowe” i „Dodaj kolejnego”.
  - Błąd sieci przy dodawaniu prosi o sprawdzenie listy przed ponowieniem, bo konto mogło już powstać.
- **„Usuń członka”** (administrator, w profilu członka) wymaga potwierdzenia.
  - Członek znika z listy i z zaplanowanych spotkań, razem z głosami. Jego konto przestaje działać.
  - Partie, wyniki i osiągnięcia zostają w historii. Usunięty członek ma profil tylko do odczytu z adnotacją.
  - Operacji nie da się cofnąć.

## 6. Profil i ustawienia

- **Profil** pokazuje awatar, imię i nazwisko, hook, statystyki (rozdział 14) i gablotę osiągnięć (rozdział 15). We własnym profilu jest „Ustawienia”, a administrator w cudzym profilu ma „Usuń członka”.
- **Ustawienia** mają trzy sekcje:
  - **Profil:**
    - zdjęcie JPG, PNG lub WebP do 25 MB. Kadrujesz je do kwadratu (przeciąganie, powiększenie do 400 %, obsługa klawiaturą), a zapisujemy 256×256 px do 1 MB. Bez zdjęcia pokazujemy inicjały;
    - imię i nazwisko, najwyżej 50 znaków każde. Hook się nie zmienia;
  - **Wygląd:** motyw Jasny / Ciemny / Systemowy;
  - **Konto:** hook, „Zmień hasło”, „Wyloguj się” i „Usuń konto”. Administrator nie ma opcji usunięcia konta.
- **Usunięcie własnego konta** wymaga potwierdzenia obecnym hasłem i ma limit prób. Skutki są takie jak przy usunięciu członka. Po usunięciu aplikacja wraca do logowania z podziękowaniem.

## 7. Kolekcja gier

- **Popup Kolekcja** pokazuje wszystkie aktywne gry: okładkę, tytuł i liczbę graczy („2–4 graczy”). Wyszukiwarka filtruje po tytule bez polskich znaków. Administrator ma przy każdej grze menu: Edytuj, Notesy, Usuń.
- **Formularz gry** (tylko administrator):
  - **okładka:** opcjonalna, WebP, JPEG lub PNG, do 800 px i ok. 100 KB. Bez okładki pokazujemy monogram tytułu;
  - **tytuł:** wymagany, najwyżej 120 znaków;
  - **liczba graczy:** min co najmniej 1 i max nie mniejszy niż min. Nie ma globalnego limitu graczy;
  - **skomplikowanie:** od 1,00 do 5,00, z najwyżej dwoma miejscami po przecinku. Jest wymagane dla nowych gier i przy edycji gry, która nie ma jeszcze skomplikowania;
  - **punkty za miejsca:** od 1. miejsca do max liczby graczy, liczby ≥ 0 z najwyżej dwoma miejscami po przecinku, najwyżej 999 999,99. Wpisanie albo zmiana skomplikowania przelicza je ze wzoru. Ręczna poprawka jest dozwolona: wtedy pojawia się „Punkty różnią się od wyliczonych ze wzoru” i „Przelicz ze wzoru”. Gdy niższe miejsce ma więcej punktów niż wyższe, pojawia się ostrzeżenie, ale zapis jest możliwy.
- **Zmiana punktacji** nie zmienia rozegranych partii, bo każda partia ma kopię punktacji z chwili rozpoczęcia.
- **Usunięcie gry** jest miękkie i nieodwracalne. Gra znika z kolekcji, wyszukiwania, głosowań i list „Gramy w” zaplanowanych spotkań. Partie, karteczki i punkty zostają.
- **Szczegóły gry** pokazują:
  - okładkę i metadane: ostatnia partia, skomplikowanie „N / 5”, „Łącznie głosów: N”;
  - statystyki gry (rozdział 14);
  - galerię oderwanych karteczek od najnowszej.

**Wzór punktacji ze skomplikowania** (w = skomplikowanie, n = max liczba graczy, p = miejsce):

```
points(p) = round( M(w) × 20 × [0,1 + 0,9 × (n − p) / (n − 1)] × (1 + 0,03 × (n − 2)), 1 )
M(w)      = 1 + 2 × (w − 1) / 4
```

Dla n = 1 ułamek miejsca wynosi 1. Ostatnie miejsce dostaje 10 % punktów zwycięzcy.

## 8. Notesy punktacji

Notes to szablon kartki wyników gry: zdjęcie pustej kartki z zaznaczonymi polami, kategoriami i regułą miejsc. Gra może mieć kilka notesów.

- **Lista notesów gry:** miniatura, nazwa, liczba miejsc dla graczy i numer wersji. Notes z mniejszą liczbą miejsc niż max graczy gry ma dopisek „Tylko partie do N graczy”. Akcje administratora:
  - Edytuj;
  - Zmień nazwę (nie tworzy wersji);
  - Eksportuj do pliku;
  - Usuń.

  Dodawanie: „Dodaj notes” albo „Importuj plik”.

- **Wersje:** każdy zapis notesu tworzy nową niezmienną wersję. Rozegrane partie i partie w toku zostają przy swojej wersji, a zdjęcia wersji są trwałe.
- **Plik notesu:** format `.json` v2 (score-pad) ze zdjęciem kartki do 5 MB (WebP, JPEG lub PNG). Import tworzy nowy notes. Eksport zapisuje bieżącą wersję.
- **Usunięcie notesu** jest miękkie: notes znika z listy i z wyboru przy nowej partii, a historia zostaje.

**Edytor notesu** to kreator pięciu kroków z paskiem postępu. Wyjście z niezapisanymi zmianami wymaga potwierdzenia.

1. **Zdjęcie:**
   - przeciągnij, wklej ze schowka, wybierz plik albo zrób zdjęcie kamerą;
   - wskazówki dobrego zdjęcia;
   - import z pliku `.json`.

   Zastąpienie zdjęcia zeruje obszar, pola i kategorie, ale zostawia nazwę i kolor.

2. **Obszar kartki:**
   - nazwa notesu, wymagana;
   - kolor grzbietu z 11 kolorów;
   - obrót, cofanie (Ctrl+Z);
   - obszar: całe zdjęcie, wykryty automatycznie albo ręczny wielokąt z lupą przy przeciąganiu. Punkty dodaje się kliknięciem krawędzi, a usuwa dwuklikiem albo przytrzymaniem;
   - wygładzanie krawędzi z siłą;
   - rozmiar kartki 3–60 cm;
   - grzbiet u góry albo z lewej.
3. **Mapowanie pól:**
   - tryb „Prostokąty ręczne”: rysowanie pola przechodzi do następnej kategorii tego miejsca, a pola można powielić dla kolejnego miejsca;
   - tryb „Wykryj tabelę”: linie z uchwytami, gracze w kolumnach albo wierszach, kolumny opisu, pomijanie miejsc;
   - dodawanie i usuwanie miejsc oraz kategorii, zoom dwoma palcami lub Ctrl+kółko.

   Zmiana trybu usuwa pola i kategorie.

4. **Kategorie:**
   - **zakładka Kategorie:**
     - nazwa, typ i opis (chmurka);
     - typy: Nazwa gracza (dokładnie jedna), Punktacja (co najmniej jedna), Suma wybranych kategorii (bez cykli), Premia ze starszych notesów, Puste pole;
     - opcja „Zespoły” przy nazwie gracza;
     - zakres wartości: dowolna liczba całkowita, min–max z krokiem albo lista wartości;
   - **zakładka Wygrana i remisy:**
     - kategoria decydująca: domyślnie suma wszystkich punktacji;
     - kierunek: więcej albo mniej = lepiej;
     - lista reguł remisu: kategoria z kierunkiem, „Rozstrzyga prowadzący”, „Wspólne miejsce”. Reguła po „Wspólnym miejscu” nigdy nie działa.

   Panel „Do poprawy” wymienia błędy blokujące zapis.

5. **Test i zapis:**
   - notes działa jak w partii, z fikcyjnymi graczami;
   - „Wypełnij losowo”, „Wymuś remis”, oderwanie i wynik testu z miejscami oraz kategorią, która rozstrzygnęła remis;
   - test jest opcjonalny, a testowe karteczki nie są zapisywane.

   Po zapisie z mniejszą liczbą miejsc niż max graczy gry aplikacja pokazuje ostrzeżenie.

## 9. Spotkania

- **Statusy:** zaplanowane, w trakcie, zakończone. Naraz może trwać najwyżej jedno spotkanie.
- **Formularz spotkania** (tylko administrator):
  - **tytuł:** wymagany, najwyżej 120 znaków;
  - **data i godzina:** co pół godziny, w strefie klubu, nie w przeszłości. Godzina nieistniejąca przez zmianę czasu jest odrzucana;
  - **uczestnicy:** co najmniej jeden, „Zaznacz wszystkich” i licznik „Wybrano N z M”;
  - **prowadzący:** domyślnie administrator albo jeden z uczestników.

  Zapis otwiera głosowanie.

- **Co wolno zmienić:**
  - **zaplanowane:** wszystko. Usunięcie uczestnika kasuje jego głosy;
  - **w trakcie:** tylko dopisanie uczestnika, zmiana prowadzącego i usunięcie uczestnika bez partii;
  - **zakończone:** nic.
- **Usunięcie spotkania** (administrator, z potwierdzeniem) kasuje uczestników i głosy. Spotkania w trakcie nie da się usunąć. Zakończone spotkanie da się usunąć dopiero po usunięciu jego partii.
- **Menu spotkania** zależy od roli i statusu:
  - **administrator:**
    - zaplanowane: Edytuj, Otwórz głosowanie ponownie (po publikacji), Usuń;
    - w trakcie: Dodaj uczestnika, Zmień prowadzącego;
    - zakończone: Otwórz spotkanie ponownie, Usuń (bez partii);
  - **prowadzący:** w trakcie „Zakończ spotkanie”.

  W widżecie administrator ma też „Zaplanuj kolejne spotkanie”. Rozpoczęcie i zakończenie są dostępne w polu akcji popupu spotkania.

- **Popup spotkania** ma:
  - nagłówek ze statusem, terminem i prowadzącym;
  - uczestników;
  - pole akcji dla administratora albo prowadzącego;
  - przed spotkaniem: głosowanie i „Gramy w”;
  - od rozpoczęcia: partie, podsumowanie i osiągnięcia spotkania.
- **Kalendarz:**
  - siatka miesiąca od poniedziałku z kolorami statusów i legendą;
  - przechodzenie między miesiącami i „Dziś”;
  - agenda „W tym miesiącu”.

  Kliknięcie pustego dnia planuje spotkanie z tą datą (administrator).

- **Rozpoczęcie** (administrator albo prowadzący, z potwierdzeniem) zamyka głosowanie i pozwala zapisywać partie.
- **Zakończenie** jest niemożliwe, póki są partie w toku: dialog wymienia je i każe je zapisać albo porzucić.
- **Ponowne otwarcie zakończonego spotkania** (tylko administrator) wraca do stanu „W trakcie”, żeby dograć partie. Historia, partie i karteczki zostają.

## 10. Głosowanie i publikacja gier

- **Głosowanie** jest otwarte od zaplanowania spotkania.
  - Głosują tylko uczestnicy: po jednym głosie na dowolną liczbę gier z kolekcji. Głos można cofnąć, dopóki głosowanie trwa.
  - Głosy są jawne: przy grze widać liczbę głosów i głosujących.
  - Gra, która nie pasuje do liczby uczestników, ma oznaczenie „Dla 2–4 graczy”, ale można na nią głosować.
  - Lista ma wyszukiwarkę, a licznik pokazuje „Twoje głosy: N”.
- **„Opublikuj gry”** (tylko administrator) to wybór dowolnych aktywnych gier, także bez głosów. Publikacja zamyka głosowanie i pokazuje listę „Gramy w”, a ponowna publikacja zastępuje listę.
- **„Otwórz głosowanie ponownie”** (administrator, tylko przed rozpoczęciem) usuwa listę „Gramy w”. Głosy zostają.
- **Łączna liczba głosów gry** to suma istniejących głosów ze wszystkich spotkań.

## 11. Partie

**Nowa partia** (administrator albo prowadzący, tylko w spotkaniu w trakcie) ma trzy kroki z pigułkami:

1. **Gra:** najpierw opublikowane („Gramy w”), potem reszta kolekcji. Gry niepasujące są wyłączone z wyjaśnieniem:
   - brak notesu;
   - gra jednoosobowa;
   - żaden notes nie mieści wymaganej liczby graczy;
   - za mało uczestników.
2. **Notes:** wybór notesu. Krok jest pomijany, gdy pasuje tylko jeden.
3. **Gracze:** uczestnicy spotkania na miejscach notesu (jeden gracz na jednym miejscu), lista „Poza partią”.
   - Liczba graczy: max(2, min gry) ≤ n ≤ min(max gry, miejsca notesu).
   - W notesie z zespołami na jednym miejscu siedzi kilku graczy, a partia ma co najmniej 2 strony.

Partii w toku może być kilka naraz. Ponowienie rozpoczęcia po błędzie sieci nie tworzy duplikatu.

**Partia w toku**

- **Notes 3D:** kartka do wpisów z obrotem i zoomem. Dostęp mają tylko administrator i prowadzący, także z innego urządzenia. Pozostali widzą „Trwa partia · od 18:10” i graczy.
- **Szkic:**
  - wpisy zapisują się z opóźnieniem 1–2 s;
  - kopia zostaje na urządzeniu na wypadek odświeżenia, awarii albo braku sieci;
  - status szkicu jest widoczny: zapisany, czeka, zapisywanie, brak sieci, serwer nie odpowiada.
- **Konflikt:** gdy szkic zmienił się na innym urządzeniu, użytkownik wybiera „Wczytaj szkic z bazy” albo „Zachowaj wpisy z tego urządzenia”. Wybór lokalnych wpisów nadpisuje szkic w bazie. Synchronizacji na żywo nie ma.
- **„Porzuć”** (z potwierdzeniem) usuwa szkic bez śladu w historii i statystykach.
- **„Oderwij kartkę”** kończy partię i pokazuje podsumowanie: miejsca, „Wspólne miejsce”, „Wygrana”, wynik i punkty do rankingu.
  - „Wróć do kartki” kładzie kartkę z powrotem na notesie.
  - „Zapisz partię” zapisuje ją trwale; zapisanej partii nie można zmienić.
  - Ponowienie zapisu po błędzie sieci nie zapisze partii dwa razy.

**Miejsca, remisy i punkty**

- Miejsca wyznacza kategoria decydująca w kierunku notesu. Puste pole jest gorsze od każdej liczby.
- Remisy rozstrzygają kolejne reguły, tylko wśród graczy nadal zremisowanych.
  - „Rozstrzyga prowadzący”: przy oderwaniu prowadzący ustala kolejność w każdej grupie remisu. Ta sama pozycja oznacza wspólne miejsce.
  - Nierozstrzygnięty remis to wspólne miejsce, a numeracja to „1, 1, 3”.
- Kartki nie da się zapisać, gdy nikt nie ma wyniku w kategorii decydującej.
- **Punkty:** w partii z n stronami liczą się ostatnie n pozycji punktacji gry. Zwycięzca dostaje punkty za miejsce max − n + 1, ostatni za miejsce max.
  - Przykład: gra 2–6, partia 4 graczy, punktowane są miejsca 3…6.
  - Remis dostaje średnią punktów zajętych miejsc, zaokrągloną w dół do setnych.
- **Wygrana:** każdy gracz na 1. miejscu, także wspólnym. Każdy członek zespołu dostaje pełne punkty miejsca zespołu i wygraną, bez dzielenia.
- Punkty, remisy i wygrane liczy serwer, nie klient.

**Karteczki**

- Przy oderwaniu notes robi obraz kartki z pismem (WebP, ok. 150 KB). Brak obrazu nie blokuje zapisu, bo pełne wpisy i wersja notesu wystarczą do ponownego renderu.
- **Partia na liście spotkania:** „Partia 1 · 18:10 · 5 graczy”, miniatura karteczki i wiersze wyników (miejsce, awatar, imię, wynik, punkty).
- **Popup karteczki:**
  - powiększony obraz albo podgląd 3D tylko do odczytu (obrót, zoom);
  - wyniki, notes i link do spotkania.
- Osierocone obrazy (przerwany zapis) sprząta się automatycznie przy otwarciu spotkania przez administratora.
- **„Usuń partię”** (tylko administrator, zapisana partia, z potwierdzeniem) trwale usuwa partię z karteczką i wynikami. Rankingi, statystyki, serie i osiągnięcia przeliczają się bez niej.

## 12. Ranking

- **Klasyfikacje:**
  - **Punkty:** suma punktów;
  - **Wygrane:** liczba wygranych partii;
  - **Seria:** rekord serii zwycięstw.
- **Seria:** spotkania gracza chronologicznie.
  - Spotkanie z co najmniej jedną wygraną daje +1 (najwyżej raz).
  - Spotkanie z partiami bez wygranej zeruje serię.
  - Spotkanie bez partii gracza nic nie zmienia.
- **Zakres:** „Cała historia” albo rok kalendarzowy w strefie klubu. Lista lat obejmuje lata z partiami, a w roku seria liczy się tylko w jego obrębie.
- **Kto jest klasyfikowany:** gracze z co najmniej jedną zapisaną partią w zakresie. Liczą się zapisane partie, także w spotkaniu w trakcie; szkice nie.
- **Miejsca:**
  - równe wyniki mają wspólne miejsce, alfabetycznie w remisie;
  - usunięci członkowie są za aktywnymi, z miejscami liczonymi dalej, i nigdy nie stają na podium.
- **Popup rankingu:** zakładki, wybór zakresu, podium i lista kolejnych miejsc.
- **Puste stany:** „Ranking pojawi się po pierwszej partii” i „Brak partii w {rok}”.

## 13. Kolejność zdarzeń

Wszystkie wyliczenia historii używają tej samej kolejności: spotkania po terminie, potem po identyfikatorze; partie w spotkaniu po chwili zapisu, potem po identyfikatorze. Rankingi, statystyki i podsumowania liczą się z zapisanych wyników przy odczycie, więc zapis i usunięcie partii działa od razu.

## 14. Statystyki

**Statystyki gracza** (w profilu, z filtrem: cała historia albo rok):

- **Liczniki:**
  - spotkania z co najmniej jedną partią gracza;
  - partie, wygrane, % wygranych, punkty;
  - rekord serii i bieżąca seria.
- **Miejsca w trzech rankingach** dla tego samego zakresu. Usunięty członek ma „Brak miejsca”.
- **Ulubiona gra:** najczęściej grana, a przy remisie ta z większą liczbą wygranych, potem tytuł.
- **Najlepsza gra:** najwyższy % wygranych spośród gier z co najmniej 3 partiami. Bez takiej gry pokazujemy „Zagraj co najmniej 3 partie jednej gry”.
- **Ostatnie partie:** najwyżej 10, od najnowszej, z grą, miejscem, punktami i linkiem do spotkania.

**Statystyki gry** (w szczegółach gry):

- **Partie:** liczba partii i ostatnia data.
- **Najczęściej wygrywa:** wszyscy przy remisie; usunięci członkowie nie są wyróżniani.
- **Rekord gry:** najlepsza wartość kategorii decydującej, a przy każdym rekordziście pierwsza partia, w której ją osiągnął, z linkiem do spotkania.
  - Kierunek bierzemy z wersji notesu ostatniej partii.
  - Partie notesów o innym kierunku nie biorą udziału w rekordzie.
- **Średni wynik zwycięzcy.**
- **Ranking graczy w grze:** wygrane, potem punkty.

**Podsumowanie spotkania:** gracze z partią w spotkaniu. Przy każdym:

- punkty do rankingu z rozbiciem na gry („Azul +12, Carcassonne ×2”);
- wygrane;
- zmiana serii: „+1 → seria 4”, „seria przerwana” albo „seria bez zmian”.

Kolejność: punkty malejąco, a usunięci na końcu.

## 15. Osiągnięcia

- **Przeliczanie:** osiągnięcia przelicza serwer w tej samej transakcji co:
  - zapis i usunięcie partii;
  - zakończenie i ponowne otwarcie spotkania;
  - zamknięcie głosowania;
  - zmiana terminu spotkania z zamkniętym głosowaniem;
  - usunięcie spotkania.

  Przeliczenie odtwarza całą historię, więc po usunięciu partii niespełnione osiągnięcia znikają, a daty się poprawiają.

- **Data odblokowania:** termin spotkania, na którym warunek spełniono po raz pierwszy.
- **Gablota:**
  - cały katalog w grupach i licznik „N z 29”;
  - odblokowane są kolorowe z datą;
  - zablokowane są wyszarzone z opisem albo postępem („7/10”).
- **Szczegóły odznaki:** warunek, data i spotkanie odblokowania. Usunięty członek ma gablotę tylko do odczytu.
- **Osiągnięcia spotkania:** lista odblokowań, których datą jest to spotkanie.
- **Powiadomienie:** po zapisie partii osoba zapisująca dostaje toast „Nowe osiągnięcie” z akcją „Zobacz”, tylko dla nowych odblokowań z tego zapisu.

| Grupa        | Id                       | Nazwa                                                  | Warunek                                                                                          |
| ------------ | ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Spotkania    | meet-1 / -10 / -25 / -50 | Pierwsze kroki / Stały bywalec / Weteran / Filar klubu | 1 / 10 / 25 / 50 spotkań z co najmniej jedną partią                                              |
| Partie       | play-10 / -50 / -100     | Rozgrzewka / Zapalony gracz / Setka                    | 10 / 50 / 100 partii                                                                             |
| Partie       | marathon                 | Maratończyk                                            | Co najmniej 5 partii na jednym spotkaniu                                                         |
| Wygrane      | win-1 / -10 / -50        | Pierwsza wygrana / Zwycięzca / Mistrz                  | 1 / 10 / 50 wygranych                                                                            |
| Wygrane      | hattrick                 | Hat-trick                                              | Co najmniej 3 wygrane na jednym spotkaniu                                                        |
| Wygrane      | flawless                 | Bez skazy                                              | Wygrane wszystkie partie zakończonego spotkania (co najmniej 3)                                  |
| Serie        | streak-3 / -5 / -10      | W gazie / Nie do zatrzymania / Legenda                 | Seria zwycięstw 3 / 5 / 10                                                                       |
| Różnorodność | explorer-10 / -25        | Odkrywca / Ludoznawca                                  | 10 / 25 różnych gier                                                                             |
| Różnorodność | versatile-5              | Wszechstronny                                          | Wygrane w 5 różnych grach                                                                        |
| Różnorodność | specialist               | Specjalista                                            | 10 wygranych w jednej grze                                                                       |
| Wyjątkowe    | beginners-luck           | Szczęście debiutanta                                   | Wygrana w pierwszej partii danej gry                                                             |
| Wyjątkowe    | record                   | Rekordzista                                            | Wynik lepszy od wszystkich wcześniejszych partii gry; pierwsza partia i wyrównanie się nie liczą |
| Wyjątkowe    | big-table                | Wielki stół                                            | Partia z co najmniej 6 graczami                                                                  |
| Wyjątkowe    | tie-top                  | Ex aequo                                               | Wspólne 1. miejsce różnych stron; wygrana zespołu się nie liczy                                  |
| Wyjątkowe    | comeback                 | Powrót z popiołów                                      | Wygrana na pierwszym spotkaniu po przerwaniu serii co najmniej 3                                 |
| Wyjątkowe    | lantern-10               | Czerwona latarnia                                      | 10 razy ostatnie miejsce, także wspólne, ale nie gdy wszyscy dzielą 1. miejsce                   |
| Punkty       | pts-100 / -500           | Setka punktów / Pół tysiąca                            | 100 / 500 punktów rankingu                                                                       |
| Klub         | voter-10                 | Głos ludu                                              | Głos w 10 głosowaniach                                                                           |

Do „Głosu ludu” liczy się spotkanie, w którym gracz miał co najmniej jeden głos w chwili zamknięcia głosowania. Późniejsze cofnięcie głosów nie odbiera zaliczenia, a ponowne zamknięcie liczy się raz.

## 16. Aplikacja instalowana

- Aplikację można zainstalować (manifest, ikony, service worker). Zasoby aplikacji działają z pamięci podręcznej, ale dane wymagają sieci.
- Brak internetu pokazuje stały komunikat. Wpisy w notesie czekają na urządzeniu i zapiszą się same.
- Nowa wersja instaluje się w tle. Aplikacja pokazuje „Dostępna nowa wersja” z przyciskiem „Odśwież” i przełącza się dopiero po kliknięciu.
- Odświeżenie jest wstrzymane, póki szkic partii ma wpisy, których nie ma w bazie.
- Aktualizacja w innej karcie daje komunikat w tej karcie.

## 17. Wymagania niefunkcjonalne

- **Bezpieczeństwo:**
  - odmowa domyślna;
  - każdy odczyt wymaga aktywnego profilu;
  - operacje zmieniające kilka tabel (spotkanie, partia, notes, głosowanie) są atomowe po stronie serwera i same sprawdzają rolę;
  - klucz serwera nigdy nie trafia do przeglądarki, a build go zatrzymuje.
- **Spójność:** równoległe operacje (dwa starty spotkania, dwa zapisy partii, przeliczenia osiągnięć) są szeregowane. Ponowienia po błędzie sieci są bezpieczne.
- **Błędy:** każdy błąd reguły ma polski komunikat. Błąd sieci mówi, co zostało zapisane i czy ponowienie jest bezpieczne.
- **Dostępność:** WCAG AA kontrastu w obu motywach, pełna obsługa klawiaturą, etykiety dla czytnika ekranu, kolejność dokumentu zgodna z kolejnością wizualną.
- **Wydajność:**
  - notes i edytor 3D ładują się leniwie;
  - początkowy JS po gzip najwyżej 215 KB, a CSS najwyżej 30 KB;
  - aplikacja działa płynnie na telefonie średniej klasy i w sieci „Slow 4G”;
  - obrazy są skalowane w przeglądarce przed wysłaniem.
- **Prywatność:** dane testowe są fikcyjne, a aplikacja nie zbiera e-maili ani danych spoza klubu.
- **Kopie zapasowe:** eksport, weryfikacja i odtworzenie całej instancji (baza, konta z hasłami, pliki). Ćwiczenie odtworzenia jest częścią testów.
