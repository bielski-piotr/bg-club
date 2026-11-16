# Ręczne rozstrzyganie remisów

W kroku „Kategorie”, na zakładce „Wygrana i remisy”, administrator może dodać
„Rozstrzyga prowadzący”. Format v2 zapisuje ją jako `{ "type": "manual" }`
w `template.ranking.tiebreak`. Reguły kategorii stosuje się przed regułą ręczną.
Manual kończy hierarchię, a nierozstrzygnięte przez prowadzącego remisy zostają
wspólnymi miejscami. Starsze notesy działają bez zmian.

Po oderwaniu kartki admin lub prowadzący widzi osobną grupę dla każdego remisu,
który pozostał po kategoriach. Wybiera kolejność każdego gracza tylko w tej grupie.
Ta sama kolejność oznacza wspólne miejsce. Numery kolejności są względne do grupy,
a podgląd poniżej pokazuje rzeczywiste miejsca w partii i punkty. Luki w wybranej
kolejności nie tworzą pustych miejsc. Na przykład kolejność 1, 3, 3 w grupie
oznacza pierwszego gracza i dwóch graczy na wspólnym kolejnym miejscu.

Wyniki wcześniej rozdzielonych grup pozostają ustalone. Przykładowo kategoria
dzieli czterech graczy na zwycięzcę i remis trzech osób. Prowadzący może wybrać
drugie miejsce i wspólne trzecie miejsce dla dwóch pozostałych, ale nie zmieni
zwycięzcy. Punkty wspólnego trzeciego miejsca wyniosą
`floor((punktacja[3] + punktacja[4]) / 2)`.

„Wróć do kartki”, Escape i kliknięcie tła przywracają wpisy na notes, bez zapisania
ręcznej kolejności. Kolejne oderwanie rozpoczyna nową decyzję. Dopiero „Zapisz
partię” utrwala miejsca w `play_results`, razem z kartką i jej kategoriami.
Historia i popup karteczki czytają utrwalone miejsca. Wpisy i obraz kartki nie
zmieniają się po ręcznym rozstrzygnięciu. Ponowienie zapisu z tymi samymi wynikami
pozostaje idempotentne, a zmiana zapisanej partii nadal wymaga jej usunięcia.

Te same kontrolki są dostępne w kroku „Test i zapis”. Zmieniają podgląd wyniku
testu, bez zapisywania partii lub decyzji w szablonie.

Migracja `20261116004700_manual_tiebreak.sql` pozwala `save_play` przyjąć ręczną
kolejność równych wartości. Wyzwalacz przed zmianą statusu na `saved` sprawdza
wszystkie wyniki razem i odrzuca odwrócenie lub scalenie grup rozstrzygniętych
wcześniejszymi kategoriami. Kategorie sum liczy z wpisów punktacji, także dla
zagnieżdżonych sum i premii. Funkcja RPC zachowuje dotychczasowe uprawnienia,
blokady, snapshoty, przeliczanie punktów i osiągnięć. Nie ma nowego publicznego RPC,
tabeli, backfillu ani zmiany protokołu zapisu, co ogranicza kolizję z toastami #50.

Po integracji #50 aplikacja przekazuje ręcznie ustalone miejsca przez
`save_play_with_achievements`, który deleguje zapis do `save_play`. Zachowuje
identyfikator żądania podczas ponowień i pokazuje toast nowych odznak po zapisie.
Test SQL sprawdza odznakę ręcznie wybranego zwycięzcy oraz odzyskanie tego samego
potwierdzenia. E2E sprawdza ręczny remis, toast Ex aequo, ponowienie bez duplikatu
i brak ponownego toastu po przeładowaniu.

Testy obejmują logikę grup w `packages/scoring/src/manual.test.ts`, SQL
`270_manual_tiebreak.test.sql` i scenariusze manual w `play-save.spec.ts`
oraz `scorepad-categories.spec.ts`. E2E sprawdzają także dostępność i brak
poziomego przewijania przy 360 px i 1280 px w jasnym oraz ciemnym motywie.

Weryfikacja SQL używa własnego projektu Supabase `bg-club-manual47-20261116`
z bazą na porcie 34722 i API na 34721. Wszystkie migracje zastosowano do świeżej
bazy, a pełny zestaw pgTAP uruchomiono przez `supabase test db --workdir <stos>`.
Wcześniej testy zapisu, manual, statystyk i osiągnięć przeszły też w osobnym
procesie PGlite. Stosy współdzielone i stos #50 nie zostały zmienione ani
zresetowane. Testy przeglądarkowe używają atrap API, a uprawnienia i integralność
wyników sprawdzają testy SQL na Supabase.
