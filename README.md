# BG Club

Aplikacja webowa dla jednego klubu planszówkowego: spotkania, głosowanie na gry, notes punktacji 3D, historia partii, leaderboardy i osiągnięcia.

- Wymagania produktowe: [PRD.md](PRD.md)
- Wygląd: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)

Stos (PRD §8.1): Vite + TypeScript + React + TanStack Query, Supabase (Postgres, Auth, Storage, Edge Functions), hosting statyczny na Cloudflare Pages.

## Struktura repozytorium

```
apps/web/              SPA (React). Teksty interfejsu: apps/web/src/i18n/pl.ts; hub: src/hub; klub: src/club; członkowie: src/members; spotkania: src/meetings; profil i ustawienia: src/profile; popupy: src/popups
packages/accounts/     konta: hook, techniczny e-mail, hasła, tworzenie członka, skrypt bootstrapu admina (+ testy)
packages/score-pad/    web componenty <score-pad> i <score-pad-editor> z POC w trybie klubowym (+ testy); adaptery React: apps/web/src/score-pad
packages/scoring/      czysta logika wyników: sumy, miejsca, remisy, punkty, walidacja notesu (+ wspólne przypadki TS/SQL)
supabase/config.toml   konfiguracja lokalnego Supabase (CLI)
supabase/migrations/   schemat, RLS i funkcje SQL
supabase/functions/    Edge Functions (Deno): create-member, delete-member, delete-own-account, _shared (+ testy deno)
supabase/seed/         seed ładowany przez `supabase db reset` i dane pierwszego admina (.env)
supabase/tests/        testy SQL (pgTAP)
.github/workflows/     CI
```

## Wymagania

- **Node.js 22.18 lub nowszy** (wersja główna w `.nvmrc`). Skrypt bootstrapu uruchamia TypeScript bezpośrednio w Node.
- **pnpm 10**. Najprościej przez Corepack: `corepack enable` (wersję wskazuje pole `packageManager` w `package.json`).
- **Docker** (Docker Desktop, OrbStack, Colima itp.), potrzebny do lokalnego Supabase i testów SQL. Supabase CLI instaluje się razem z zależnościami (`pnpm exec supabase`), nie trzeba go instalować globalnie.
- **Deno 2** (opcjonalnie): tylko do lintu, typów i testów Edge Functions (`deno lint`, `deno test` w `supabase/functions`). Lokalny Supabase uruchamia funkcje sam, bez Deno na komputerze.

## Uruchomienie od zera

```bash
git clone https://github.com/bielski-piotr/bg-club.git
cd bg-club
corepack enable
pnpm install

# Lokalny Supabase (pierwszy start pobiera obrazy Dockera, kilka minut).
pnpm db:start
# Na końcu CLI wypisuje adres API i klucze. Można je też odczytać później:
pnpm exec supabase status

# Pierwszy administrator (AUTH-3): imię i nazwisko w supabase/seed/.env.
cp supabase/seed/.env.example supabase/seed/.env
# W supabase/seed/.env wpisz BOOTSTRAP_ADMIN_FIRST_NAME i BOOTSTRAP_ADMIN_LAST_NAME
# (hasło opcjonalnie; bez niego skrypt wygeneruje losowe).
pnpm bootstrap:admin:local
# Skrypt wypisuje hook administratora i (jednorazowo) wygenerowane hasło.

# Konfiguracja frontendu.
cp apps/web/.env.example apps/web/.env.local
# W apps/web/.env.local wpisz:
#   VITE_SUPABASE_URL      = API URL z `supabase status` (domyślnie http://127.0.0.1:54321)
#   VITE_SUPABASE_ANON_KEY = klucz anon / publishable z `supabase status`

pnpm dev
```

Aplikacja działa pod <http://localhost:5173> i startuje od ekranu logowania: hook i hasło z `pnpm bootstrap:admin:local`. Bez uzupełnionych zmiennych pokazuje komunikat „Brak konfiguracji aplikacji” z listą brakujących wartości.

`pnpm db:reset` odtwarza pustą bazę (bez kont), więc po resecie trzeba ponownie uruchomić `pnpm bootstrap:admin:local`.

Studio Supabase (podgląd bazy) jest pod <http://127.0.0.1:54323>. Zatrzymanie: `pnpm db:stop`.

## Komendy

Uruchamiane w katalogu głównym repozytorium.

| Komenda                          | Co robi                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                       | serwer deweloperski aplikacji (port 5173)                                                                         |
| `pnpm build`                     | build produkcyjny do `apps/web/dist`                                                                              |
| `pnpm preview`                   | podgląd buildu (port 4173)                                                                                        |
| `pnpm typecheck`                 | sprawdzenie typów we wszystkich pakietach                                                                         |
| `pnpm lint`                      | ESLint i Prettier (`--check`)                                                                                     |
| `pnpm format`                    | formatowanie Prettierem                                                                                           |
| `pnpm test`                      | testy jednostkowe (Vitest) we wszystkich pakietach                                                                |
| `pnpm test:e2e`                  | testy E2E (Playwright): telefon 360 px i desktop, motyw jasny i ciemny                                            |
| `pnpm check`                     | typy, lint, testy jednostkowe i build naraz                                                                       |
| `pnpm db:start` / `pnpm db:stop` | start i stop lokalnego Supabase                                                                                   |
| `pnpm db:reset`                  | odtworzenie lokalnej bazy z migracji i seeda                                                                      |
| `pnpm bootstrap:admin:local`     | konto pierwszego administratora w lokalnym Supabase (dane z `supabase/seed/.env`)                                 |
| `pnpm bootstrap:admin`           | to samo dla dowolnego projektu: adres i klucz service role ze zmiennych środowiskowych                            |
| `pnpm db:lint`                   | lint schematu bazy (`supabase db lint`)                                                                           |
| `pnpm test:sql`                  | testy SQL (pgTAP) na lokalnej bazie; wymaga `pnpm db:start` albo `pnpm exec supabase db start`                    |
| `pnpm test:auth`                 | testy integracyjne kont, logowania, członków i klubu na lokalnym Supabase; wymagają pustej bazy (`pnpm db:reset`) |

Pierwsze uruchomienie E2E na nowym komputerze wymaga przeglądarki Playwright:

```bash
pnpm --filter @bg-club/web exec playwright install chromium
```

`pnpm test:e2e` sam buduje aplikację i uruchamia `vite preview`. Bez zmiennych środowiskowych używa lokalnego adresu Supabase i klucza zastępczego.

## Konfiguracja i sekrety

Repozytorium jest przygotowane do upublicznienia (PRD §1.1, NFR-9): nie zawiera sekretów ani danych klubu.

- Frontend czyta wyłącznie `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` (NFR-1). Wzór: [`apps/web/.env.example`](apps/web/.env.example). Klucz anon jest publiczny z założenia; dostęp chroni RLS.
- Klucz `service_role` jest używany tylko w Edge Functions i w skrypcie `pnpm bootstrap:admin` uruchamianym przez instalującego. Nigdy nie trafia do frontendu ani do repozytorium. Lokalne sekrety funkcji: `supabase/functions/.env` (wzór: [`supabase/functions/.env.example`](supabase/functions/.env.example)); dane pierwszego administratora: `supabase/seed/.env` (wzór: [`supabase/seed/.env.example`](supabase/seed/.env.example)).
- Pliki `.env` i `.env.*` (poza `.env.example`) są w `.gitignore`.
- Rejestracja samodzielna jest wyłączona (`enable_signup = false`, PRD §1.2), a baza dodatkowo odrzuca konta Auth utworzone poza aplikacją (sekcja „Konta i logowanie”). Konta tworzy administrator.

## Teksty interfejsu

Interfejs jest po polsku, a wszystkie teksty są w jednym module: [`apps/web/src/i18n/pl.ts`](apps/web/src/i18n/pl.ts) (PRD §1.1). Komponenty importują `t` i `format` z `apps/web/src/i18n`. Nowy tekst dodaje się najpierw do słownika, nigdy jako literał w komponencie.

## Design system

Wygląd opisuje [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). W kodzie:

- **Tokeny i motywy:** [`apps/web/src/styles/tokens.css`](apps/web/src/styles/tokens.css). Motyw jasny, ciemny albo systemowy wybiera atrybut `data-theme` na `<html>` (`src/theme`); wybór zalogowanego jest w profilu, a `localStorage` trzyma jego podręczną kopię (sekcja „Profil i ustawienia”). Test `tokens.test.ts` sprawdza kontrast WCAG AA wszystkich par tekst/tło w obu motywach.
- **Fonty:** Bricolage Grotesque, Instrument Sans i DM Mono z pakietów `@fontsource*` (bez zewnętrznego CDN).
- **Komponenty:** [`apps/web/src/ui`](apps/web/src/ui), import z `src/ui`: przyciski, pola, wyszukiwarka, stepper, lista rozwijana (opcjonalnie z wyszukiwarką, `searchLabel`), checkbox, radio, pigułki wyboru, chipy, próbki kolorów, awatary i stosy, karta widżetu z tacą i wierszami, zakładki, badge i chipy statusu, toasty (`ToastProvider` + `useToast`), menu kontekstowe (`Menu`, wzorzec „menu button”), banery, puste stany, spinner, szkielety, switch, slider i popup (`Modal`: okno 560/880 na desktopie, pełnoekranowy arkusz na telefonie; opcjonalna stopka formularza `footer`). Teksty wbudowane w komponenty są w `t.ui`.
- **Galeria:** `pnpm dev` i <http://localhost:5173/design-system>. Pokazuje wszystkie komponenty i stany z przełącznikiem motywu; E2E sprawdza ją na 360 px i desktopie w obu motywach, także z axe (WCAG A/AA).

## Hub i popupy

Wymagania: PRD §4, NFR-4, NFR-6; wygląd DS §6, §7, §17. Kod: [`apps/web/src/hub`](apps/web/src/hub), [`apps/web/src/popups`](apps/web/src/popups).

- **Widok Klubu** (`/`) jest jedynym pełnoekranowym widokiem po zalogowaniu (przed założeniem klubu: pierwsze uruchomienie, sekcja „Klub”): nagłówek z klubem i chipem użytkownika oraz pięć widżetów w kolejności PRD (Spotkanie, Ranking, Timeline, Kolekcja, Członkowie). Od 1112 px treść ma 1064 px i dwie kolumny po 520 px o niezależnych wysokościach (`useMasonry`), węższe ekrany mają jedną kolumnę. Kolejność dokumentu (czytnik ekranu, Tab) jest zawsze ta z PRD. Widżety Spotkanie, Ranking, Timeline i Kolekcja mają na razie puste stany; ich treść dochodzi w kolejnych zadaniach.
- **Adres popupu:** stos popupów jest w parametrach `p`, od dołu do góry, np. `/?p=members&p=profile/<uuid>`. Odświeżenie i link wysłany komuś odtwarzają cały stos (także po zalogowaniu). Nieznany lub uszkodzony wpis otwiera popup „Nie znaleziono”, profil spoza klubu pokazuje „Nie znaleziono gracza”, a nieznana ścieżka stronę „Nie ma takiej strony”. Stos ma najwyżej 8 poziomów.
- **Historia:** otwarcie popupu dodaje wpis historii, więc Wstecz zamyka górny popup, a Dalej otwiera go ponownie. ← i Esc zamykają górny popup, × cały stos. Popup otwarty z linku nie ma wpisu pod sobą, więc zamknięcie podmienia adres zamiast wychodzić z aplikacji.
- **Dostępność:** popup ma `role="dialog"`, fokus po otwarciu, pętlę Tab, Esc, a po zamknięciu oddaje fokus elementowi, który go otworzył. Hub i niższe popupy dostają `inert`. Strona pod popupem się nie przewija, a arkusz na telefonie ma wysokość widocznego obszaru (`visualViewport`), więc klawiatura ekranowa nie zasłania treści.
- **Awatar gracza** w dowolnym miejscu to link `ProfileLink` do jego profilu (`?p=profile/<id>`); Ctrl/Cmd+klik otwiera go w nowej karcie.
- **Nowy popup:** rodzaj w `popups/routes.ts` (`PopupRoute`, `parseRoute`, `serializeRoute`), komponent z `PopupModal` i wpis w `hub/HubPopup.tsx`. Link do niego: `PopupLink` albo `usePopups().open(route)`.

## Klub: pierwsze uruchomienie i strefa czasowa

Wymagania: PRD CLUB-1…CLUB-4, NFR-10; wygląd DS §17. Kod: [`apps/web/src/club`](apps/web/src/club), dane w [`apps/web/src/hub/club.ts`](apps/web/src/hub/club.ts).

- **Pierwsze uruchomienie** (CLUB-1, CLUB-3). Dopóki tabela `club` jest pusta, widok Klubu zamiast widżetów pokazuje ilustrację SVG (kolory stołu, cienia i ciemnej kostki z motywu, więc działa w obu motywach), powitanie i dla administratora przycisk **Dodaj klub**. Gracz widzi tekst „Klub nie został jeszcze założony” bez przycisku. Nagłówek ma wtedy tylko chip użytkownika.
- **Formularz klubu** (CLUB-2) to popup `?p=club`: „Dodaj klub” przed założeniem, „Edytuj klub” z ołówka w nagłówku potem. Gracz pod tym adresem dostaje „Nie znaleziono”, a bazę i tak chroni RLS. Pola:
  - **logo** (opcjonalne): przeglądarka zmniejsza obraz do 800 px po dłuższym boku i koduje do WebP o rozmiarze ok. 100 KB (`club/image.ts`, jak okładki GAME-6), plik trafia do bucketu `covers` pod nową nazwą `club/logo-<uuid>.webp`. Bez logo kafelek pokazuje monogram nazwy. Po zapisie poprzedni plik jest usuwany, a przy nieudanym zapisie wiersza usuwany jest nowy;
  - **nazwa** (wymagana, do 80 znaków, bez spacji na brzegach);
  - **strefa czasowa**: lista stref IANA z przesunięciem UTC i wyszukiwarką (po nazwie bez `_` i `/`, bez polskich znaków albo po przesunięciu, np. „utc-05”). Domyślnie strefa przeglądarki, a gdy jej nie ma lub jest nieznana, `Europe/Warsaw`. Bazę sprawdza dodatkowo wyzwalacz `club_validate` (`pg_timezone_names`).
- **Drugi klub nie powstanie.** Klucz główny `id = 1` odrzuca drugi wiersz (`23505`), także przy równoległych próbach. Formularz traktuje to jako „Klub został już założony”, zamyka się i pokazuje istniejący klub.
- **Strefa a terminy** (NFR-10). Terminy spotkań są `timestamptz`, więc zmiana strefy klubu zmienia tylko sposób wyświetlania dat i granice roku, a nie zapisane chwile. Sprawdzają to test SQL `080_club` i `pnpm test:auth`.
- **Logo w nagłówku** jest pobierane z prywatnego bucketu przez podpisany URL (ważny godzinę, `useCoverUrl`).
- **Widżety po założeniu klubu** (CLUB-4) mają puste stany. Puste widżety Członkowie i Kolekcja mają dla admina „Dodaj członka” i „Dodaj grę” (sekcje „Członkowie” i „Kolekcja gier”), a pusty widżet Spotkanie „Zaplanuj spotkanie” (sekcja „Spotkania: planowanie i statusy”).

## Spotkania: planowanie i statusy

Wymagania: PRD PLAN-1…PLAN-5, MTG-1, MTG-2, RUN-1, RUN-4, NFR-10, Q4, Q12, Q14; wygląd DS §15. Kod: [`apps/web/src/meetings`](apps/web/src/meetings), migracja [`20261113001000_meeting_planning.sql`](supabase/migrations/20261113001000_meeting_planning.sql), testy SQL `130_meetings`.

- **Widżet Spotkanie** (MTG-1) pokazuje spotkanie w trakcie, a gdy go nie ma, najwcześniejsze zaplanowane (`starts_at`, potem `id`): kafelek daty, tytuł, datę i godzinę w strefie klubu, awatary i liczbę uczestników, prowadzącego oraz stan. W nagłówku karty jest odliczanie w dniach strefy klubu („dziś”, „jutro”, „za 16 dni”; po terminie brak) albo chip „Trwa”. Pod spodem taca stanu (najwyżej 3 wiersze, resztę pokazuje popup): przy otwartym głosowaniu chip „Głosowanie otwarte”, „Twoje głosy: N” (uczestnik) i gry z największą liczbą głosów; po publikacji chip „Gry wybrane” i lista „Gramy w”; w trakcie „Partie” z „2 rozegrane · 1 w toku”, najpierw partie w toku, potem ostatnio zapisane ze zwycięzcami. Administrator ma menu ⋯ „Zaplanuj kolejne spotkanie”, a w zaplanowanym „Edytuj spotkanie”, „Otwórz głosowanie ponownie” (po publikacji, VOTE-6) i „Usuń spotkanie”; w trakcie „Dodaj uczestnika” i „Zmień prowadzącego” (oba otwierają formularz edycji, PLAN-4). Prowadzący w trakcie ma w menu tylko „Zakończ spotkanie” (Q14). Pusty stan ma dla admina **Zaplanuj spotkanie**. Tytuł otwiera popup spotkania. Zaplanowane spotkanie, którego nikt nie rozpoczął, zostaje w widżecie także po terminie (admin albo prowadzący może je rozpocząć).
- **Zaplanuj / Edytuj spotkanie** (PLAN-1, `?p=meetings/new`, `?p=meetings/new/<RRRR-MM-DD>` z wypełnioną datą, `?p=meeting/<uuid>/edit`; tylko admin, gracz dostaje „Nie znaleziono”): tytuł (do 120 znaków), data, godzina (co pół godziny), uczestnicy z aktywnych członków bez limitu (Q12, „Zaznacz wszystkich”) i opcjonalny prowadzący spośród uczestników innych niż admin (domyślnie prowadzi admin, `host_id = NULL`). Odznaczony prowadzący oddaje prowadzenie adminowi. Nowe spotkanie nie może zaczynać się w przeszłości; zapis otwiera głosowanie (PLAN-2).
- **Jeden zapis, jedna transakcja.** Formularz wywołuje RPC `save_meeting(meeting_id, title, local_date, local_time, participant_ids, host_id, is_new)`: spotkanie, pełna lista uczestników i prowadzący naraz. Id nowego spotkania nadaje klient, więc ponowienie po błędzie sieci nie zdubluje go; edycja (`is_new = false`) spotkania usuniętego w międzyczasie kończy się błędem zamiast utworzyć je na nowo. Edycja bez zmiany terminu wysyła `NULL` jako datę i godzinę, więc baza nie przelicza terminu w strefie, którą formularz mógł mieć nieaktualną. To jedyna droga zapisu: `authenticated` nie ma bezpośredniego `INSERT`/`UPDATE` na `meetings` ani `INSERT`/`DELETE` na `meeting_participants`. RPC zaczyna od `private.require_admin()`, więc prowadzący nie edytuje spotkania (Q14).
- **Termin w strefie klubu** (NFR-10). Data i godzina przychodzą jako czas lokalny klubu, a `timestamptz` liczy baza (`private.meeting_local_start`). Godzinę z luki wiosennej zmiany czasu (np. 02:30 w ostatnią niedzielę marca w Warszawie) RPC odrzuca z komunikatem zamiast przesuwać; podwójna godzina jesienią oznacza drugie wystąpienie (czas zimowy). Zmiana strefy klubu nie przesuwa zapisanych terminów.
- **Co wolno zmienić** (PLAN-3, PLAN-4): zaplanowane wszystko, także po zamknięciu głosowania (usunięty uczestnik traci głosy, kaskada); w trakcie tylko dopisanie uczestnika, zmiana prowadzącego i usunięcie uczestnika bez partii (zapisanej ani szkicu; formularz blokuje takiego uczestnika z oznaczeniem „Ma partię”), a tytuł i termin są zablokowane; zakończone nic. Wyzwalacz `meetings_validate` pilnuje tytułu, terminu i prowadzącego zakończonego spotkania także dla service role.
- **Start i koniec** (RUN-1, RUN-4, MTG-2): RPC `start_meeting(meeting_id)` i `finish_meeting(meeting_id)` dla admina i prowadzącego (`private.require_meeting_runner`). Start działa tylko dla zaplanowanego i zamyka głosowanie. Drugie spotkanie w trakcie odrzuca unikalny indeks `meetings_single_in_progress` także przy równoczesnych startach (druga transakcja czeka na pierwszą i dostaje `23505`; sprawdza to `pnpm test:auth` dwiema sesjami). Koniec działa tylko dla trwającego, a szkice partii go blokują. SPA ma funkcje `startMeeting` i `finishMeeting` z polskimi komunikatami (sekcja „Przebieg spotkania”).
- **Usuń spotkanie** (PLAN-3, PLAN-5, `?p=meeting/<uuid>/delete`): zwykłe `DELETE` z RLS (tylko admin) kasuje uczestników, głosy i opublikowane gry. Trwającego nie da się usunąć (wyzwalacz `meetings_guard_delete`), a zakończonego z partiami blokuje klucz obcy `plays → meetings` (Q4).
- **Błędy reguł** mają SQLSTATE `23514` (albo `23505`) i nazwę reguły w polu `hint` (np. `meetings_single_in_progress`, `meetings_no_drafts_when_finished`, `meetings_local_time_exists`). PostgREST przekazuje ją klientowi, a `meetingFailure` w `meetings.ts` zamienia ją na polski komunikat (`t.meetings.errors`).

## Głosowanie i publikacja gier

Wymagania: PRD VOTE-1…VOTE-6, PLAN-2, PLAN-3, VIEW-1, VIEW-2; wygląd DS §15. Kod: [`apps/web/src/meetings`](apps/web/src/meetings) (`voting.ts`, `MeetingPopup.tsx`, `PublishGamesPopup.tsx`), migracja [`20261113001100_voting.sql`](supabase/migrations/20261113001100_voting.sql), testy SQL `140_voting`, E2E `voting.spec.ts`.

- **Popup spotkania** (`?p=meeting/<uuid>`, widżet Spotkanie): status, termin w strefie klubu, uczestnicy z prowadzącym, a w zaplanowanym głosowanie albo lista „Gramy w”. Przebieg i partie opisuje sekcja „Przebieg spotkania”.
- **Głos** (VOTE-1, VOTE-2) to wiersz `game_votes`, który uczestnik dodaje i usuwa sam przez RLS: tylko własny, tylko przy otwartym głosowaniu, jeden na grę (klucz główny), bez limitu gier. Ponowienie głosu (`23505`) SPA traktuje jak sukces. Głos po zamknięciu odrzuca wyzwalacz `game_votes_require_open_voting` (blokada wiersza spotkania, więc także w wyścigu z publikacją), głos na usuniętą grę `require_active_game`, a głos osoby spoza spotkania klucz obcy do uczestników. Usunięcie uczestnika z planu, gry albo spotkania kasuje głosy.
- **Lista głosowania** (VOTE-3, VOTE-4): wszystkie gry kolekcji, malejąco po liczbie głosów, potem alfabetycznie; przy grze awatary głosujących, liczba głosów („Brak głosów”, „1 głos”, „3 głosy”) i przełącznik „Głosuj” / „Twój głos” (tylko dla uczestników). Wyszukiwarka ignoruje wielkość liter i polskie znaki. Gra, której zakres graczy nie obejmuje liczby uczestników, ma oznaczenie „Dla 2–4 graczy”, ale przyjmuje głosy.
- **Opublikuj gry** (VOTE-5, `?p=meeting/<uuid>/publish`, tylko admin): dowolne aktywne gry z kolekcji, także bez głosów. RPC `publish_meeting_games(meeting_id, game_ids)` w jednej transakcji zapisuje listę „Gramy w” (kolejność z listy głosowania) i zamyka głosowanie. Głosy zostają. Ponowna publikacja w zaplanowanym spotkaniu („Zmień listę gier”) zastępuje listę.
- **Otwórz głosowanie ponownie** (VOTE-6, popup i menu widżetu, tylko admin): RPC `reopen_voting(meeting_id)` działa tylko przed rozpoczęciem spotkania i usuwa listę „Gramy w” (otwarte głosowanie i opublikowane gry się wykluczają). Ponowienie przy otwartym głosowaniu niczego nie zmienia.
- **Tylko przez RPC.** `authenticated` nie ma bezpośredniego `INSERT`/`UPDATE`/`DELETE` na `meeting_games`. Obie funkcje zaczynają od `private.require_admin()`, więc prowadzący nie publikuje gier. Błędy mają nazwę reguły w `hint` (`meeting_games_required`, `meeting_games_game_active`, `meeting_games_planned`, `meetings_reopen_planned`, `meetings_not_found`), a `votingFailure` w `voting.ts` zamienia je na polskie komunikaty (`t.meetings.voting.errors`).

## Przebieg spotkania

Wymagania: PRD MTG-1, VIEW-1…VIEW-3, RUN-1, RUN-4, PLAN-4, Q14; wygląd DS §15. Kod: [`apps/web/src/meetings`](apps/web/src/meetings) (`plays.ts`, `meetingMenu.ts`, `MeetingPlays.tsx`, `RunMeetingDialogs.tsx`, `MeetingPopup.tsx`), widżet w [`apps/web/src/hub/widgets.tsx`](apps/web/src/hub/widgets.tsx), E2E `meeting-run.spec.ts`. Reguły po stronie bazy: sekcja „Spotkania: planowanie i statusy”.

- **Kto prowadzi** (§2.1): admin zawsze, prowadzący (`host_id`) tylko w niezakończonym spotkaniu (`isMeetingRunner`, odpowiednik `private.is_meeting_runner`). Obaj mają w popupie pole akcji: w zaplanowanym **Rozpocznij spotkanie** (admin także „Opublikuj gry” / „Zmień listę gier” / „Otwórz głosowanie ponownie”), w trakcie **Zakończ spotkanie**. Prowadzący nie ma edycji, uczestników, prowadzącego ani usuwania (PLAN-4, Q14); jego menu w trakcie to tylko „Zakończ spotkanie”.
- **Rozpocznij spotkanie** (RUN-1, `?p=meeting/<uuid>/start`): dialog z potwierdzeniem; przy otwartym głosowaniu uprzedza, że start je zamknie (głosy zostają). Błędy bazy mają polskie komunikaty, np. „Trwa już inne spotkanie. Najpierw je zakończ.” (MTG-2). Gracz, który nie prowadzi, albo spotkanie już rozpoczęte (stary link): dialog wyjaśnia powód, a przycisk jest nieaktywny.
- **Zakończ spotkanie** (RUN-4, `?p=meeting/<uuid>/finish`): dialog zawsze pobiera partie od nowa. Gdy są partie w toku (szkice), zamiast potwierdzenia pokazuje ostrzeżenie „Najpierw dokończ partie w toku” z ich listą (gra, „Trwa partia · od 20:55”) i tylko „Zamknij”. Gdy szkic pojawi się między otwarciem a kliknięciem, baza odrzuca koniec (`meetings_no_drafts_when_finished`), a odświeżona lista go pokazuje. Po zakończeniu nie można dodawać partii.
- **Partie** (VIEW-3): w trwającym i zakończonym spotkaniu sekcja „Partie” z licznikiem („1 rozegrana · 1 w toku”) i zwycięzcami spotkania. Najpierw karty partii w toku (zielone, gra, od kiedy, gracze), potem zapisane w kolejności rozegrania (`saved_at`, potem `id`): miniatura oderwanej karteczki w kolorze gry, „Partia 1 · 19:10 · 3 graczy” i wiersze wyników (miejsce, awatar z linkiem do profilu, imię i nazwisko, wynik kategorii decydującej, punkty do rankingu „+N”). Gra usunięta z kolekcji zostaje pod tytułem z historii, a gracz bez profilu jako „Usunięty gracz”. Odczyt: `plays` z osadzoną grą i `play_results` (RLS: aktywni członkowie).
- **Gotowe do podłączenia w E4.** `MeetingPlaysSection` przyjmuje `onOpenPlay`: karta zapisanej partii staje się wtedy przyciskiem (szczegóły i powiększenie karteczki). Spotkanie ma stały adres `?p=meeting/<uuid>`, więc historia partii (profil, gra) może do niego linkować. Nowa partia, powrót do notesu i porzucenie szkicu (RUN-2, RUN-3) dochodzą razem z notesem partii.

## Członkowie

Wymagania: PRD MEM-1…MEM-3, AUTH-2, AUTH-4, USR-1, USR-2; wygląd DS §6–8. Kod: [`apps/web/src/members`](apps/web/src/members), Edge Function [`supabase/functions/create-member`](supabase/functions/create-member), logika konta w [`packages/accounts/src/member.ts`](packages/accounts/src/member.ts).

- **Widżet** (MEM-1) pokazuje do pięciu awatarów, a przy więcej niż pięciu członkach cztery awatary i licznik `+N`. Awatar otwiera profil, licznik i „Zobacz więcej” listę. Gdy w klubie jest tylko admin, widżet ma pusty stan z przyciskiem **Dodaj członka**.
- **Lista** (MEM-2, `?p=members`) zawiera aktywnych członków (bez usuniętych) z hookiem i oznaczeniem admina. Wyszukiwarka szuka po imieniu, nazwisku i hooku, bez polskich znaków i wielkości liter, a każde wpisane słowo musi pasować („lukasz zol”, „7c1e”). Esc czyści pole. Wiersz otwiera profil.
- **Kolor monogramu** (USR-2) wynika deterministycznie z hooka, więc jest stały na każdym urządzeniu i nie zmienia się po zmianie imienia.
- **Dodaj członka** (MEM-3, `?p=members/new`, tylko admin; gracz pod tym adresem dostaje „Nie znaleziono”). Formularz ma imię i nazwisko (wymagane, do 50 znaków) i wywołuje Edge Function `create-member`:
  - Funkcja sprawdza token sesji i to, czy wywołujący jest **aktywnym administratorem**. Gracz dostaje 403, a brak lub nieważny token 401. Klucz service role jest tylko w funkcji.
  - **Hook** (USR-1) powstaje z imienia i nazwiska: małe litery, transliteracja polskich znaków (`Łukasz Żółw` → `lukasz-zolw-…`), myślniki i 4 znaki szesnastkowe z generatora kryptograficznego. Gdy hook jest zajęty (także przez usuniętego członka, którego profil zostaje w historii) albo zajmie go równoległe żądanie, funkcja losuje nowy sufiks (do 8 prób). Ostatecznie unikalność pilnują e-mail w Auth i `profiles_hook_key`. Hook jest niezmienny (wyzwalacz z [005]).
  - **Hasło** (AUTH-4) ma 16 znaków z generatora kryptograficznego (bez łatwych do pomylenia znaków 0/O, 1/l/I). Funkcja nie loguje hasła ani treści żądania (`console.log` dostaje tylko id). Odpowiedź ma `Cache-Control: no-store`.
  - **Bez niespójnego konta:** konto Auth i profil powstają w jednej transakcji (wyzwalacz `on_auth_user_created`). Odrzucona próba nie zostawia ani konta, ani profilu.
  - Po zapisie popup pokazuje **jednorazowo** hook i hasło z przyciskami „Kopiuj” i ostrzeżeniem, że hasła nie da się odczytać ponownie. Hasło jest tylko w stanie tego popupu: nie trafia do adresu, cache'u zapytań (mutacja ma `gcTime: 0`) ani `localStorage`, więc znika po zamknięciu okna. Gdy ktoś zgubi hasło, admin usuwa konto i dodaje członka ponownie (sekcja „Usuwanie członka i własnego konta”).
  - Nowy członek ma monogram. Zdjęcie ustawia sam w ustawieniach (sekcja „Profil i ustawienia”): Storage pozwala pisać tylko do własnego folderu w `avatars`, więc administrator nie wgra cudzego zdjęcia (USR-7). Opcjonalny awatar w formularzu MEM-3 wymagałby wysyłki przez Edge Function i nie jest częścią [010].
  - Konto ma wygenerowane hasło, więc przy pierwszym logowaniu członek dostaje propozycję zmiany (AUTH-6).

## Profil i ustawienia

Wymagania: PRD USR-2…USR-5, USR-7, USR-8, AUTH-6; wygląd DS §7–12 (strona Profile w Paper). Kod: [`apps/web/src/profile`](apps/web/src/profile), migracja [`20261113000600_profile_settings.sql`](supabase/migrations/20261113000600_profile_settings.sql).

- **Menu awatara** (CLUB-1, DS §7, §17). Chip użytkownika w nagłówku otwiera menu: Mój profil, Ustawienia, Wyloguj się. Klawiatura jak we wzorcu WAI-ARIA „menu button” (↑ ↓ Home End, Esc oddaje fokus chipowi).
- **Profil** (USR-4, `?p=profile/<id>`): awatar, imię i nazwisko, hook, oznaczenia Admin i Ty. Statystyki (§5.9) i gablota osiągnięć (§5.10) mają stan oczekiwania do etapów E5 i E6. Właściciel ma w nagłówku przycisk **Ustawienia**; cudzy profil nie ma akcji edycji, także dla administratora (USR-7). Usunięty członek ma profil tylko do odczytu (MEM-5).
- **Awatar** (USR-2, USR-3). Bez zdjęcia monogram w kolorze z hooka. Zdjęcie JPG, PNG albo WebP (do 25 MB na wejściu) kadruje się w przeglądarce: kwadratowy kadr z okrągłą maską, przeciąganie (mysz, palec), strzałki, suwak, kółko myszy i klawisze +/−. Wynik to **256×256 WebP** (PNG, gdy przeglądarka nie koduje WebP), zwykle 10–30 KB (NFR-7), zapisany jako `avatars/<id>/avatar-<uuid>.webp`. Każde wgranie ma nową nazwę, więc podpisany URL starego pliku nie pokaże nowego zdjęcia. Po zapisie poprzedni plik jest usuwany, a przy nieudanym zapisie wiersza usuwany jest nowy. „Usuń zdjęcie” wraca do monogramu. Zdjęcia wszędzie (nagłówek, widżet, lista, profil) idą przez podpisany URL ważny godzinę (`useAvatarUrl`).
- **Ustawienia** (USR-5, `?p=settings`, zawsze własne): zdjęcie, imię i nazwisko (wymagane, do 50 znaków, bez spacji na brzegach; hook się nie zmienia), motyw, hook tylko do odczytu, zmiana hasła, wylogowanie i (poza administratorem) usunięcie własnego konta (USR-6, sekcja „Usuwanie członka i własnego konta”).
- **Motyw** (USR-8). Wybór działa od razu i jest zapisywany w `profiles.theme` oraz w `localStorage`. Skrypt w `index.html` stosuje kopię z `localStorage` przed pierwszym renderem, więc motyw nie miga. Po zalogowaniu na innym urządzeniu (albo gdy motyw zmieni się gdzie indziej) aplikacja stosuje motyw z profilu i aktualizuje kopię (`useProfileTheme`). Nieudany zapis w profilu przywraca poprzedni wybór.
- **Zmiana hasła** (USR-5, `?p=settings&p=settings/password`): obecne hasło i dwa razy nowe, co najmniej 12 znaków (jak hasła generowane, AUTH-4) i inne niż obecne. Obecne hasło sprawdza **Auth**, nie tylko formularz: `updateUser({ password, current_password })` przy włączonym `require_current_password` (`supabase/config.toml`; w projekcie Supabase trzeba to włączyć, sekcja „Wdrożenie”). Minimalną długość pilnuje też Auth (`minimum_password_length = 12`). Błędy (złe obecne hasło, za słabe, takie samo, limit prób, brak sieci) są po polsku. Hasło jest tylko w stanie formularza.
- **Pierwsze logowanie** (AUTH-6). `profiles.password_change_suggested` mówi, że konto ma jeszcze wygenerowane hasło: `create-member` i bootstrap bez własnego hasła ustawiają `app_metadata.bg_club.password_generated`, z którego wyzwalacz konta ustawia flagę. Hub otwiera wtedy raz na uruchomienie popup „Ustaw własne hasło” (`?p=first-login`). **Pomiń** zapisuje rezygnację w profilu; zamknięcie (×, Esc) tylko odkłada propozycję. Udana zmiana hasła też wyłącza flagę. Gdy administrator ustawi komuś hasło ręcznie w panelu Supabase (PRD §1.2), może ponownie włączyć propozycję: `update profiles set password_change_suggested = true where hook = '…'`.

## Usuwanie członka i własnego konta

Wymagania: PRD MEM-4…MEM-6, USR-6, AUTH-7, decyzja Q22; wygląd DS §7 (mały dialog: „Członkowie / Usuń członka – potwierdzenie”, „Profil / Usuń konto – potwierdzenie hasłem”). Kod: Edge Functions [`delete-member`](supabase/functions/delete-member) i [`delete-own-account`](supabase/functions/delete-own-account) ze wspólną logiką w [`_shared/accountDeletion.ts`](supabase/functions/_shared/accountDeletion.ts), SPA w [`members/deletion.ts`](apps/web/src/members/deletion.ts), [`DeleteMemberDialog`](apps/web/src/members/DeleteMemberDialog.tsx) i [`DeleteAccountDialog`](apps/web/src/profile/DeleteAccountDialog.tsx).

- **Usuń członka** (MEM-4, tylko admin): przycisk w nagłówku profilu aktywnego gracza otwiera potwierdzenie `?p=profile/<id>/delete`. Po usunięciu profil pod spodem pokazuje stan „(usunięty)” tylko do odczytu, a członek znika z listy i widżetu (MEM-5). Profilu administratora, usuniętego członka i nieistniejącego nie da się usunąć także z linku („Nie znaleziono”).
- **Usuń konto** (USR-6, gracz): w ustawieniach, sekcja Konto. Dialog `?p=settings/delete` wymaga obecnego hasła; funkcja sprawdza je logowaniem w Auth (te same limity prób, 429 → „Zbyt wiele prób…”). Po usunięciu aplikacja kończy sesję i wraca do logowania z komunikatem „Twoje konto zostało usunięte”. Administrator nie widzi tej opcji, a funkcja odrzuca jego żądanie (403).
- **Kolejność kroków** w obu funkcjach: najpierw `profiles.deleted_at` (od tej chwili RLS nie daje danych, hook `custom_access_token_hook` nie wyda tokenu, a wyzwalacz `profiles_after_soft_delete` w tej samej transakcji usuwa członka z zaplanowanych spotkań razem z głosami i oddaje adminowi prowadzenie niezakończonych spotkań, MEM-6, Q22), potem miękkie usunięcie konta Auth (`auth.admin.deleteUser(id, true)`: Auth zaciera techniczny e-mail i usuwa sesje). Wiersz `auth.users` i profil zostają, więc historia, karteczki i statystyki nie tracą gracza. W spotkaniu w trakcie uczestnictwo i szkice zostają; zakończone spotkania zachowują prowadzącego.
- **Istniejące tokeny:** token dostępu bywa ważny jeszcze do godziny, ale RLS wymaga aktywnego profilu, więc nic nie zwraca i niczego nie zapisze; odświeżenie sesji i ponowne logowanie są odrzucane.
- **Usuniętego nie da się dodać do spotkania** (MEM-6): wyzwalacz `meeting_participants_validate` odrzuca go przy każdym zapisie, także z klucza service role.
- **Administratora nie da się usunąć żadną ścieżką:** funkcje odpowiadają 409/403, a w bazie pilnuje tego `CHECK profiles_admin_not_deleted` (także przy usuwaniu w panelu Supabase).
- **Ponowienie jest bezpieczne:** usunięcie już usuniętego członka kończy tylko usuwanie konta Auth (gdyby wcześniej się nie udało) i nie przesuwa daty usunięcia.
- Kody błędów funkcji: README w [`supabase/functions`](supabase/functions/README.md).

## Kolekcja gier

Wymagania: PRD GAME-1…GAME-6, GAME-8, GAME-9; wygląd DS §6, §7, §14. Kod: [`apps/web/src/games`](apps/web/src/games), migracja `20261113000700_game_collection.sql`.

- **Widżet** (GAME-1, Q11) pokazuje 5 gier z widoku `game_collection`: najpierw gry z zapisanymi partiami według daty ostatniej partii malejąco, potem pozostałe według daty dodania malejąco (remis: `id`). Szkice partii się nie liczą, więc przed pierwszą zapisaną partią widżet pokazuje ostatnio dodane. Pierwsza gra ma dużą okładkę, kolejne są wierszami z miniaturą; licznik w nagłówku liczy całą kolekcję. Pusta kolekcja ma pusty stan, a admin przycisk **Dodaj grę**.
- **Popup kolekcji** (GAME-2, `?p=games`) to siatka okładek z wyszukiwarką filtrowaną na bieżąco. Porównanie robi baza: RPC `search_games(query)` szuka fragmentu w `title_search` (`search_text` = `unaccent` + `lower`, indeks `pg_trgm`), więc „zolw” znajdzie „Żółwie Wyścigi”, a `%` i `_` są znakami dosłownymi. Widok i RPC działają z uprawnieniami wołającego (RLS tabel `games` i `plays`).
- **Dodaj / Edytuj grę** (GAME-3…GAME-5, `?p=games/new`, `?p=game/<uuid>/edit`, tylko admin; gracz dostaje „Nie znaleziono”) otwierają się w tym samym stosie popupów, ze strzałką „wstecz”. Admin otwiera edycję i usuwanie z menu ⋯ na okładce. Formularz ma:
  - **okładkę** (GAME-6, opcjonalna): przeglądarka zmniejsza obraz do 800 px po dłuższym boku i koduje do WebP, obniżając jakość, aż plik zmieści się w ok. 100 KB (NFR-7; bez kodera WebP JPEG na białym tle). Plik trafia do bucketu `covers` pod nową nazwą `games/<id gry>-<uuid>.webp`. Bez okładki gra ma kafelek w kolorze palety (stały, z `id` gry) z monogramem tytułu;
  - **tytuł** (wymagany, do 120 znaków);
  - **min. i max. liczbę graczy**: `1 ≤ min ≤ max` bez górnego limitu (GAME-4); błąd zakresu pokazuje się przy „max”;
  - **punkty za miejsca 1…max** (GAME-5): liczby całkowite ≥ 0; zmiana „max” dodaje puste pola na końcu albo usuwa ostatnie. Gdy niższe miejsce ma więcej punktów niż wyższe, formularz pokazuje ostrzeżenie, ale pozwala zapisać.
- **Usuń grę** (GAME-8, `?p=game/<uuid>/delete`) jest miękkie i nieodwracalne: `deleted_at` ustawia baza (`now()`), a wyzwalacz `games_guard_update` blokuje dalszą edycję i przywrócenie. Gra znika z kolekcji, wyszukiwania, głosów i list gier **zaplanowanych** spotkań (wyzwalacz `games_after_soft_delete`); spotkania w trakcie i zakończone zachowują historię. Partie, karteczki, punkty i okładka zostają (historia pokaże „(usunięta z kolekcji)”). Usunięcie jest idempotentne.
- **Edycja punktacji nie zmienia historii** (GAME-9): partia ma snapshot `points_snapshot` ustawiany w bazie przy rozpoczęciu (migracja [003]); formularz edycji przypomina, że zmiana dotyczy tylko kolejnych partii.
- Testy: SQL `100_game_collection` (uprawnienia, wyszukiwanie, kolejność widżetu, skutki usunięcia, snapshot), Vitest (`games/form.test.ts`, `games/Collection.test.tsx`, `club/image.test.ts`), E2E `e2e/games.spec.ts`.

## Notes i edytor notesu

Wymagania: PRD §8.4–8.5, PAD-1, EDT-8. Kod: [`packages/score-pad`](packages/score-pad) (źródła POC 2.4.0, commit `e6b7dd2`; pochodzenie, licencje i lista zmian w [README pakietu](packages/score-pad/README.md)) i adaptery React w [`apps/web/src/score-pad`](apps/web/src/score-pad).

- **Leniwe ładowanie** (NFR-2): `ScorePadView` i `ScorePadEditorView` pobierają `@bg-club/score-pad/pad` albo `/editor` przez `import()` dopiero przy pierwszym pokazaniu. Three.js 0.149 (npm, nie CDN) i fonty kartki (npm, nie Google Fonts) są tylko w tych chunkach. Błąd pobrania pokazuje komunikat z „Spróbuj ponownie”.
- **Tryb klubowy** (PAD-1): adapter zawsze ustawia `club: true`. Notes nie czyta i nie zapisuje lokalnej biblioteki szablonów (IndexedDB) ani stanu i historii POC (`localStorage`) i nie dokłada notesów wbudowanych. Pliki notesu v2 nadal się wczytują (`config`, „Wczytaj notes z pliku…”), tylko do pamięci.
- **Bez limitu graczy** (EDT-8): `MAX_PLAYERS = 8` usunięte z notesu, edytora i walidacji pliku.
- **Motyw i zdarzenia**: rozwiązany motyw aplikacji trafia do atrybutu `theme` obu elementów i zmienia się na żywo; `scorepad:save`, `scorepad:ready` i `scorepad-editor:export` są propsami `onSave`, `onReady`, `onExport`. Zamknięcie widoku usuwa element, co wywołuje `destroy()` (animacja, WebGL).
- **Podgląd:** galeria `/design-system`, sekcja „Notes i edytor” (przykładowy notes z 10 miejscami). Zapis notesów w bazie opisuje sekcja „Notesy gry”. Kreator edytora opisuje sekcja „Kreator edytora notesu”. Partie (PAD-2…PAD-9) i pełne kroki kreatora (EDT-2…EDT-14) dochodzą w kolejnych zadaniach.
- Testy: Vitest w pakiecie (`src/club.test.ts`) i aplikacji (`score-pad/ScorePadView.test.tsx`), E2E `e2e/score-pad.spec.ts` (leniwe chunki, brak żądań poza aplikację, brak wpisów w `localStorage` i IndexedDB, 10 miejsc, motyw, brak błędów konsoli).

## Notesy gry: wersje, import i eksport

Wymagania: PRD GAME-7, GAME-9, EDT-1, EDT-6…EDT-8, NFR-7. Kod: [`apps/web/src/score-pad`](apps/web/src/score-pad) (`scorepads.ts`, `ScorepadsPopup`, `ScorepadEditorPopup`, `ScorepadDialogs`), moduł `@bg-club/score-pad/template` (walidacja pliku, liczba miejsc), migracja `20261113000900_scorepad_versions.sql`.

- **Lista notesów** (GAME-7, `?p=game/<uuid>/scorepads`; admin otwiera ją z menu ⋯ gry w kolekcji, docelowo ze szczegółów gry, GAME-10): nazwa, miniatura kartki (zdjęcie aktualnej wersji z podpisanego URL), liczba miejsc dla graczy i numer wersji. Notes z mniejszą liczbą miejsc niż max. graczy gry ma ostrzeżenie „Tylko partie do N graczy” (EDT-6), tak samo po zapisie i imporcie. Gracz widzi listę bez akcji.
- **Admin**: **Dodaj notes** (`?p=game/<uuid>/scorepads/new`) i **Edytuj** (`?p=scorepad/<uuid>/edit`) otwierają kreator edytora (sekcja niżej) z przyciskiem **Zapisz notes** w ostatnim kroku; **Importuj plik** przyjmuje plik `.json`; menu ⋯ ma **Zmień nazwę** (`/rename`), **Eksportuj do pliku** i **Usuń** (`/delete`). Liczba notesów gry jest dowolna.
- **Każdy zapis to nowa, niezmienna wersja** (GAME-9). Klient sprawdza szablon (format v2, kształt i miejsca dla graczy, kategorie i reguła miejsc przez `validateScoring`; błędnej reguły nie naprawia po cichu), wysyła zdjęcie kartki do bucketu `scorepads` pod nową nazwą `<id gry>/<id notesu>-<uuid>.<rozszerzenie>`, a potem RPC `save_scorepad(game_id, scorepad_id, name, template, image_path, player_slots)` w jednej transakcji: dodaje notes, gdy go nie ma, dopisuje wersję (numer nadaje baza) i przestawia `current_version_id`. To jedyna droga zapisu notesów i wersji: RPC jest `security definer` ze strażnikiem `private.require_admin()`, a `authenticated` nie ma bezpośredniego `INSERT` na `scorepads` i `scorepad_versions`. RPC odrzuca szablon spoza v2, brak zdjęcia, ścieżkę obrazu, którego nie ma w Storage (nieudany upload nie opublikuje wersji), usuniętą grę i usunięty notes. Gdy baza odrzuci zapis, klient usuwa wysłany plik (po błędzie sieci zostawia go, bo wersja mogła powstać). Edycja bez zmiany zdjęcia nie wysyła go ponownie: nowa wersja wskazuje ten sam plik (edytor oddaje wczytane zdjęcie bez ponownej kompresji).
- **Zdjęcie jest w Storage, nie w JSON-ie** (EDT-1, NFR-7): ograniczenie `scorepad_versions_template_no_image` odrzuca szablon z polem `image`. Aplikacja wstawia zdjęcie (data URL) przed osadzeniem w edytorze i przy **eksporcie**, więc plik `notes-<nazwa>.json` jest przenośny: wczytuje go edytor, notes POC i import aplikacji. Import przyjmuje `template` albo aktywny notes z `templates` i przenosi data URL do Storage.
- **Historia zostaje czytelna**: pliku wskazanego przez którąkolwiek wersję nie da się usunąć ani nadpisać (polityki Storage `bg_club_admin_assets_update`/`_delete`), a zmiana nazwy i usunięcie notesu nie ruszają wersji. Usunięcie notesu jest miękkie i nieodwracalne (`deleted_at` nadaje baza, wyzwalacz `scorepads_guard_update` blokuje dalsze zmiany); nowe partie nie mogą go wybrać (strażnik partii z [003]).
- Testy: SQL `120_scorepads` (uprawnienia, numeracja i niezmienność wersji, odrzucenia, trwałe pliki, zmiana nazwy, usunięcie), Vitest (`packages/score-pad/src/template-tools.test.ts`, `score-pad/scorepads.test.ts`, `score-pad/Scorepads.test.tsx`, `popups/routes.test.ts`).

## Kreator edytora notesu

Wymagania: PRD §5.5.2, EDT-1…EDT-4, EDT-6…EDT-13; DS §18. Kod: [`apps/web/src/score-pad`](apps/web/src/score-pad) (`ScorepadWizard`, `PhotoStep`, `CameraCapture`, `AreaStep`, `MappingStep`, `CategoriesStep`, `area.ts`, `camera.ts`, `categories.ts`, `wizard.ts`, `wizard.css`), tryb kreatora `<score-pad-editor>` (`wizard`, `status()`, `loadPhoto`, `loadTemplate`, `goStep`, `setArea`, `rotatePhoto`, `undoArea`, `editMapping`, `editCategories`, zdarzenie `scorepad-editor:change`), geometria obszaru [`packages/score-pad/src/editor/area.ts`](packages/score-pad/src/editor/area.ts), mapowanie pól [`packages/score-pad/src/editor/fields.ts`](packages/score-pad/src/editor/fields.ts) i ochrona popupu `popups/useLeaveGuard.ts`.

- **Pięć kroków nad jednym edytorem**: Zdjęcie, Obszar kartki, Mapowanie pól, Kategorie, Test i zapis. Edytor zostaje zamontowany przez cały czas, więc powrót do wcześniejszego kroku nie gubi danych. Krok 1 prowadzi aplikacja, kroki 2–4 to scena edytora z panelem aplikacji. Krok 5 jest na razie podsumowaniem: kartka, liczby, ostrzeżenie EDT-6 i **Zapisz notes**; test notesu 3D doda zadanie [022].
- **Przejścia**: „Dalej” jest wyłączone, dopóki bieżący krok nie jest poprawny (zdjęcie, obszar kartki, pola, poprawne kategorie). Wstecz działa zawsze; pigułki odwiedzonych kroków są klikalne, do przodu najwyżej o krok za najdalszym odwiedzonym. Edycja notesu i import `.json` otwierają kreator z wykonanymi krokami. Nowe zdjęcie po zmapowaniu pól wymaga potwierdzenia i zaczyna kroki 2–5 od nowa.
- **Krok 1: Zdjęcie** (EDT-9): wybór pliku, przeciągnięcie na scenę, wklejenie ze schowka (Ctrl+V w dowolnym miejscu poza polami tekstowymi) albo **Zrób zdjęcie**. Na urządzeniu z dotykiem (`pointer: coarse`) to aparat systemowy (`capture="environment"`, tylny aparat), na komputerze kamera internetowa z podglądem (`getUserMedia`, tylny aparat i najwyższa rozdzielczość, zdjęcie JPEG 0,92). Brak kamery, odmowa dostępu albo przeglądarka bez `mediaDevices` dają komunikat z przyciskiem **Wybierz plik**. Link **Importuj plik .json** (także przeciągnięty plik `.json`) wczytuje notes do edycji po tej samej walidacji co import listy.
- **Krok 2: Obszar kartki** (EDT-10): obszar to wielokąt na zdjęciu. Po wczytaniu zdjęcia edytor wykrywa go sam (`detectArea`): kartkę na jednolitym albo ciemniejszym tle, a w jej obrębie zaokrąglone rogi, wycięcia, otwory i kształty nieprostokątne (do 48 punktów). Tryby w panelu: **Całe zdjęcie** (np. skan), **Wykryj automatycznie** (wykrywa ponownie) i **Ręcznie**. Punkty się przeciąga (lupa 88 px, na telefonie 72 px), kliknięcie lub dotknięcie krawędzi wstawia punkt (od razu do przeciągnięcia), dwuklik (wykrywany przez edytor, bo nakładka jest przebudowywana przy każdym wciśnięciu) albo przytrzymanie punktu na ekranie dotykowym (550 ms) go usuwa (zostają co najmniej 3), a punkt z fokusem przesuwają strzałki (Shift: dalej) i usuwa Delete. Każda zmiana przełącza na **Ręcznie**, więc wynik wykrycia można poprawiać. Prostowanie perspektywy opiera się na czterech narożnikach wyznaczonych z obszaru: czworokąt opisany na otoczce wypukłej (przecięcia przedłużonych boków), więc zaokrąglone rogi i wycięcia ich nie przesuwają; narożniki przy rogach zdjęcia (do 1,5% przekątnej) to całe zdjęcie. **Wygładź krawędzie** (przełącznik i siła 0–10) dodaje punkty pośrednie metodą Chaikina. Panel ma też nazwę notesu (wymaganą do przejścia dalej), kolor grzbietu (paleta DS §3 i #161A2B; kolor spoza palety, np. z importu, jest pierwszą próbką), rozmiar kartki w cm (3–60, przecinek albo kropka) i grzbiet **U góry / Z lewej**. Pływający pasek sceny: obrót o 90° w lewo i w prawo (obszar i historia obracają się razem ze zdjęciem) i **Cofnij** (także Ctrl+Z na scenie i w panelu poza polami tekstowymi). Różdżkę i lasso z POC usunięto. Notes otwarty do edycji ma już wyprostowaną kartkę: obszar to zapisany kształt, a narożniki zostają na całym zdjęciu.
- **Krok 3: Mapowanie pól** (EDT-11, EDT-6, EDT-8): dwa **wykluczające się** sposoby. Kartka, na której edytor wykrył wyraźną tabelę, zaczyna od **Wykryj tabelę**, inna od **Prostokątów ręcznych**.
  - **Prostokąty ręczne**: przeciągnięcie na kartce rysuje pole (dotknięcie bez ruchu stawia pole o rozmiarze poprzedniego). Pierwsze pole kategorii ją tworzy („Kategoria N”), a po każdym polu edytor przechodzi do następnej kategorii tego samego miejsca, której to miejsce jeszcze nie ma (gdy ma wszystkie: nowa kategoria). Panel: wybór miejsca (dowolna liczba, zawijane w wiersze) i **Dodaj miejsce**, nawigator „Kategoria 2 z 5” / „Nowa kategoria”, **Powiel dla miejsca N** (kopiuje pola bieżącego miejsca obok: w prawo, a bez miejsca na kartce w dół; kopie są zaznaczone, a ich przesunięcie poprawia też położenie kolejnych kopii), usuwanie zaznaczonych pól, bieżącej kategorii (numery „Kategoria N” idą za kolejnością) i ostatniego miejsca. Na kartce pole zaznacza kliknięcie (Shift: kilka), przesuwa przeciągnięcie albo strzałki, rozmiar zmienia uchwyt w rogu, Delete usuwa. Notes zapisuje się bez tabeli, z `players` i polami.
  - **Wykryj tabelę**: linie z kartki (`detectLines`), **Gracze są w Kolumnach / Wierszach** (te same linie, zamienione role), liczba miejsc, kategorii i kolumn opisu, **Wykryj tabelę ponownie**. Linie przeciąga się (także za uchwyty 10 px przy górnej i lewej krawędzi, pod palcem większa strefa), a kliknięcie znacznika miejsca nad tabelą je pomija. Gdy nic nie wykryto, panel to mówi, a tabela domyślna czeka na poprawę.
  - Zmiana sposobu, gdy są pola lub kategorie, otwiera popup „Zmienić sposób mapowania?”; **Usuń i zmień** je kasuje, **Anuluj** i Esc niczego nie zmieniają. Starszy notes z tabelą i polami dowolnymi zachowuje pola do zmiany sposobu.
  - Panel pokazuje kafelki liczby miejsc i kategorii oraz ostrzeżenie EDT-6 (mniej miejsc niż max. graczy gry). „Dalej” czeka, aż każde miejsce i każda kategoria mają pola (komunikat w panelu). Kategorie mają tu tylko numer i automatyczną nazwę; nazwy, typy i zakresy ustawia krok 4.
  - Pasek sceny: **Cofnij** (także Ctrl+Z na scenie i w panelu; zmiana sposobu też się cofa) i **Dopasuj widok**. Kartkę powiększa szczypanie dwoma palcami (drugi palec przerywa rysowanie bez zmian), Ctrl + kółko albo gest gładzika i klawisze + / − (0 dopasowuje); kółko w powiększeniu przesuwa widok.
- **Krok 4: Kategorie** (EDT-13, EDT-2…EDT-4, EDT-7): scena to kartka z numerem przy każdej kategorii (wiersz tabeli albo pierwsze pole), a kliknięcie pola wybiera jego kategorię (kartka jest listą kategorii; panel ma tylko nawigator „Kategoria 5 z 8”). Panel ma dwie zakładki:
  - **Kategorie**: nazwa, typ (**Nazwa gracza / Punktacja / Suma / Puste pole**; automatyczna nazwa idzie za typem), dla punktacji zakres **Dowolny / Min–max / Lista wartości** (min, max i krok albo liczby oddzielone przecinkami; do edytora trafiają tylko liczby całkowite, a krótki zakres zamieniony na listę daje jego wartości), dla sumy **Sumuje kategorie** (chipy z punktacjami i innymi sumami bez tych, które dałyby cykl) oraz opcjonalny opis (chmurka w notesie). Starsze typy `sum` i `bonus` zostają, dopóki typ się nie zmieni.
  - **Wygrana i remisy**: kategoria decydująca o miejscu (punktacja albo suma; domyślnie suma, której nie sumuje żadna inna), kierunek **Więcej = lepiej / Mniej = lepiej** i taca reguł remisów: wiersz to kategoria i kierunek (kliknięcie otwiera zmianę), przyciski przesuwają regułę wyżej lub niżej i ją usuwają, **Dodaj regułę** proponuje pierwszą nieużytą kategorię, a na końcu jest stałe „Wspólne miejsce”. Na kartce kategoria decydująca ma puchar, a kategorie reguł numer reguły. Notes bez sumy decyduje sumą wszystkich punktacji; kierunek i reguły są wtedy dostępne po wybraniu kategorii.
  - Każda zmiana trafia od razu do szablonu w formacie `template.ranking` (EDT-7; niejawne „wspólne miejsce” na końcu nie jest zapisywane). Kategoria decydująca, która przestaje być liczbowa, wraca do domyślnej sumy, a reguły na takich kategoriach znikają. Stan kroku (`status().categories`) ma problemy walidatora zapisu `validateScoring` (dokładnie jedna nazwa gracza, co najmniej jedna punktacja, zakresy, cykle sum, reguła miejsc) i pustą listę wartości; „Dalej” czeka, aż ich nie będzie, a panel pokazuje je po polsku. Zmiana kategorii albo reguły kończy historię cofania mapowania z kroku 3 (cofnięcie przywróciłoby stare nazwy, typy i regułę), a usunięcie kategorii w kroku 3 usuwa ją też z sum i z reguły. Każda kategoria może mieć najwyżej jedną regułę remisu. Reguła „rozstrzyga prowadzący” (EDT-5) to dodatek E8: z pliku jest pokazywana i można ją usunąć.
- **Pełna jakość obrazu** (EDT-12): zdjęcie źródłowe i wyprostowana kartka mają dłuższy bok do 4096 px (zamiast 2400 i 1600 px w POC), a kartka ma rozdzielczość obszaru na zdjęciu źródłowym, bez powiększania mniejszego zdjęcia. Zapis to WebP (albo JPEG, gdy przeglądarka nie koduje WebP) o jakości 0,92; plik większy niż 4,5 MB (limit bucketu `scorepads` to 5 MiB) jest zmniejszany o 15% na krok zamiast obniżania jakości. Zdjęcie notesu otwartego do edycji bez zmiany kadru jest zapisywane tym samym plikiem.
- **Wygląd** (DS §18): desktop to modal 1120 px o stałej wysokości z pigułkami kroków, scena 620×560 obok panelu i stopka „Wstecz | Dalej”. Telefon to arkusz z paskiem „Krok 2 z 5” i pięcioma segmentami postępu oraz stopką z dwoma przyciskami.
- **Ochrona przed utratą zmian**: dopóki edytor zgłasza zmiany (`dirty`), Esc, ←, ×, kliknięcie tła i Wstecz w przeglądarce otwierają dialog „Odrzucić zmiany?” (Esc w dialogu wraca do edycji), a zamknięcie karty pyta przeglądarkę (`beforeunload`). Wstecz w przeglądarce cofa historię od razu, więc router przywraca adres kreatora nowym wpisem i dopiero potwierdzenie go cofa. Po zapisie ochrona jest zdejmowana.
- Testy: Vitest (`score-pad/wizard.test.ts`, `score-pad/area.test.ts`, `score-pad/ScorepadWizard.test.tsx` z atrapą edytora, `popups/PopupStack.test.tsx`, `packages/score-pad/src/editor-wizard.test.ts`, `packages/score-pad/src/area.test.ts`: narożniki, kształt, wygładzanie, edycja punktów, rozdzielczość i kodowanie kartki; `packages/score-pad/src/mapping.test.ts`: prostokąty, powielanie dla 11 miejsc, tabela, oś graczy, tryby, cofanie, wczytany notes; `packages/score-pad/src/categories.test.ts`: typy, zakresy, sumy bez cykli, reguła miejsc w `template.ranking` i `readTemplate`, kartka kroku 4, cofanie; `score-pad/categories.test.ts`: liczby z pól i komunikaty walidatora), E2E `e2e/scorepad-wizard.spec.ts` (kroki, walidacja, powrót, ochrona zmian, przeciągnięcie, schowek, import, odmowa kamery, axe), `e2e/scorepad-area.spec.ts` (próbki rysowane w przeglądarce: zaokrąglone rogi, wycięcie i zdjęcie perspektywiczne; punkty z lupą, wstawianie, usuwanie, klawiatura, cofanie, obrót, tryby, kartka 4096 px w WebP 0,92 i małe zdjęcie bez powiększania, układ 360 px i desktop, axe) `e2e/scorepad-mapping.spec.ts` (krok 3: prostokąty rysowane dotykiem na telefonie i myszą na desktopie, powielanie do 10 miejsc, EDT-6, szczypanie i Ctrl + kółko, linie tabeli, oś graczy, popup zmiany sposobu, axe, 360 px), `e2e/scorepad-categories.spec.ts` (krok 4: wybór kategorii na kartce, nazwa, zakresy, lista wartości, suma, walidacja, kategoria decydująca, kierunek, reguły remisów z kolejnością i eksportem `ranking`, axe, 360 px) i `e2e/scorepad-camera.spec.ts` (sztuczna kamera Chromium na desktopie, aparat systemowy na telefonie).

## Wyniki: ranking, sumy i punkty

Wymagania: PRD §5.6, §8.3, EDT-2…EDT-4, EDT-7, EDT-13. Kod: [`packages/scoring`](packages/scoring/src/index.ts) i funkcja SQL `public.play_points` ([migracja `…0800_scoring.sql`](supabase/migrations/20261113000800_scoring.sql)).

**Kontrakt formatu notesu** (`ScorePadTemplate` w `@bg-club/score-pad`, część wyników: `ScoringTemplate`). Plik notesu v2 zostaje wstecznie zgodny i może mieć regułę miejsc:

```jsonc
"ranking": {
  "line": "total", // kategoria decydująca: punktacja (input) albo suma (total, sum, bonus)
  "dir": "desc", // "desc" = więcej lepiej, "asc" = mniej lepiej
  "tiebreak": [
    { "type": "line", "line": "a", "dir": "desc" }, // kolejne reguły tylko dla nadal zremisowanych
    { "type": "shared" }, // wspólne miejsce; { "type": "manual" } (EDT-5, poza MVP) działa tak samo
  ],
}
```

- **Starszy format bez `ranking`:** decyduje najwyższa suma końcowa (`total`, którego nie sumuje żadna inna suma), a bez sumy końcowej suma punktacji i premii, jak w POC.
- **Miejsca** (`rankPlayers`): sortowanie po kategorii decydującej, remisy rozstrzygane hierarchicznie, numeracja „1, 1, 3”. Puste pole jest za każdą liczbą, w obu kierunkach. Reguły po `shared`/`manual` nie działają: walidacja zgłasza `unreachable-rule`, a `parseRanking` zwraca regułę bez nich (to jedyny problem, który nie unieważnia reguły). NaN liczy się jak puste pole.
- **Sumy** (`computeTotals`): logika POC przeniesiona do pakietu i używana przez notes i edytor. Sumy mogą liczyć się z innych sum; suma na cyklu nie ma wartości (w POC dawała sumę częściową).
- **Punkty** (`placementPoints` i `public.play_points`): zremisowani na miejscach k…k+m−1 dostają `floor` ze średniej punktów tych miejsc; błędne miejsca albo za krótka punktacja to błąd (`RangeError`, w SQL `22023`). Funkcja SQL nie jest API klienta: wywoła ją RPC zapisu partii ([029]).
- **Walidacja** (`validateScoring`, `parseRanking`): kody problemów ze ścieżką w szablonie (np. `ranking.tiebreak[1].line`), także dla zniekształconego JSON-a (`invalid-line`): błędne referencje sum i reguł, kategorie bez wartości, cykle sum, zakresy i listy wartości punktacji, jedna kategoria imion, co najmniej jedna punktacja. Notes przy wczytaniu pomija błędną regułę (działa domyślna), edytor zachowuje regułę wczytanego notesu, dopóki wskazuje istniejące kategorie.
- **Notes**: zwycięzca zakreślony na kartce i `winners` w `scorepad:save` wynikają z reguły miejsc (także wspólne 1. miejsce). Na niepełnej kartce gracz bez wartości kategorii decydującej jest za graczami z wartością (w POC puste pole liczyło się jako 0). Gdy nikt nie ma tej wartości (np. suma na cyklu), nikt nie wygrywa.
- **Wspólne przypadki** (NFR-11): [`packages/scoring/src/cases/play-cases.json`](packages/scoring/src/cases/play-cases.json) (m.in. przykład 10/6/4/2/0 → 8/8/4/2/0, `floor`, ujemne wyniki, remisy wieloosobowe i w remisach, starszy format). Vitest liczy z nich miejsca i punkty, a test pgTAP `110_scoring.test.sql` jest z nich generowany: po zmianie przypadków `pnpm --filter @bg-club/scoring gen:sql` (test Vitest pilnuje, że plik SQL jest aktualny).

## Schemat bazy

Migracje w [`supabase/migrations/`](supabase/migrations) odtwarzają cały schemat od zera (`pnpm db:reset`). Model danych opisuje PRD §6; poniżej reguły, które wymusza sama baza.

| Tabela                             | Co przechowuje                                                                 | Najważniejsze reguły w bazie                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `club`                             | jedyny klub: nazwa, logo, strefa IANA                                          | jeden wiersz (`id = 1`), strefa sprawdzana z `pg_timezone_names`                                                                                                                                                                                                                                                                                                                         |
| `profiles`                         | gracze; `id` = `auth.users.id`; motyw i flaga propozycji zmiany hasła (AUTH-6) | powstaje razem z kontem Auth (wyzwalacz, sekcja „Konta i logowanie”); bez klucza obcego do Auth: usunięcie konta Auth tylko ustawia `deleted_at`; oznaczenie jako usunięty wypisuje z zaplanowanych spotkań (z głosami) i oddaje prowadzenie adminowi (MEM-6); jeden admin; admina nie da się usunąć; `hook` unikalny i niezmienny                                                       |
| `games`                            | kolekcja gier                                                                  | `1 ≤ min ≤ max`, bez górnego limitu; `placement_points` ma długość `max_players`, wartości ≥ 0; `title_search` do wyszukiwania bez polskich znaków (`unaccent` + `pg_trgm`); `deleted_at` nadaje baza, usunięta gra jest niezmienna i znika z głosów zaplanowanych spotkań; widok `game_collection` i RPC `search_games`                                                                 |
| `scorepads`, `scorepad_versions`   | notesy gry i ich wersje                                                        | wersje niezmienne i nieusuwalne, numerowane w bazie; `current_version_id` wskazuje wersję tego samego notesu                                                                                                                                                                                                                                                                             |
| `meetings`, `meeting_participants` | spotkania i uczestnicy                                                         | najwyżej jedno spotkanie `in_progress`; przejścia `planned → in_progress → finished` (oraz `finished → in_progress`); zakończenie wymaga braku szkiców; tytuł i termin zmienia się tylko w zaplanowanym, prowadzący zakończonego jest niezmienny, trwającego nie da się usunąć; prowadzący jest uczestnikiem innym niż admin (`NULL` = admin); usunięty członek nie dołączy do spotkania |
| `game_votes`, `meeting_games`      | głosy i opublikowane gry                                                       | jeden głos na grę; głosuje tylko uczestnik; usunięcie uczestnika kasuje jego głosy                                                                                                                                                                                                                                                                                                       |
| `plays`, `play_results`            | partie (szkic lub zapisana karteczka) i wyniki graczy                          | szkic tylko w spotkaniu w trakcie; snapshot punktacji i bieżącej wersji notesu ustawiany w bazie przy utworzeniu szkicu; jedna partia gracza na karteczce; najwyżej min(max gry, miejsca w notesie) graczy, przy zapisie co najmniej 2; `saved_at` nadaje baza; zapisana karteczka niezmienna                                                                                            |
| `achievement_unlocks`              | odblokowane osiągnięcia                                                        | identyfikator z katalogu w kodzie                                                                                                                                                                                                                                                                                                                                                        |

Znaczniki czasu to wyłącznie `timestamptz` (NFR-10). Gry i profile usuwa się miękko, a klucze obce do nich blokują twarde usunięcie, więc historia zostaje. Strażnicy czytający inne tabele są `security definer` z pustym `search_path`, więc polityki RLS ich nie omijają.

Kolejność zdarzeń (PRD §5.6.6): spotkania `starts_at, id`, partie w spotkaniu `saved_at, id`; obie mają indeksy.

### Uprawnienia (RLS, RPC, Storage)

Macierz uprawnień to PRD §2.1 i §6.1; wymusza ją migracja `20261113000400_access_control.sql`. Zasada: odmowa domyślna.

- **`anon`** nie ma żadnych praw do tabel i funkcji aplikacji. Wszystko wymaga zalogowania.
- **`authenticated`** ma `SELECT` na tabelach oraz `INSERT`/`UPDATE` tylko na wymienionych kolumnach (bez `TRUNCATE`). RLS zawęża to do wierszy: odczyt dla **aktywnych** kont, więc usunięte konto z wciąż ważnym tokenem nic nie widzi.
- **`service_role`** omija RLS i jest używany wyłącznie w Edge Functions i skrypcie bootstrapu. Tylko tam zmienia się `role`, `hook` i `deleted_at` profilu oraz tworzy i usuwa profile. Klucz `service_role` / `sb_secret_…` podany jako `VITE_SUPABASE_ANON_KEY` zatrzymuje `vite build` (zanim trafi do bundla), a test pilnuje, że kod SPA czyta tylko dwie publiczne zmienne.
- Nowe tabele i funkcje w `public` nie dostają praw automatycznie: migracja nadaje je jawnie, a funkcji odbiera `EXECUTE` od `PUBLIC` i `anon`. Kontrakt praw sprawdza test `050_access_control`.

| Tabela                                              | Odczyt  | Zapis przez API                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `club`                                              | aktywni | admin: `name`, `logo_path`, `timezone`                                                                                                                                                                                                                                      |
| `profiles`                                          | aktywni | właściciel: `first_name`, `last_name`, `avatar_path` (`<id>/<plik>`), `theme`, `password_change_suggested`; nikt nie edytuje cudzego (też admin)                                                                                                                            |
| `games`, `scorepads`, `scorepad_versions`           | aktywni | admin; usuwanie miękkie (`deleted_at`), wersje tylko dopisywane; notesy i wersje dodaje tylko RPC `save_scorepad`                                                                                                                                                           |
| `meetings`, `meeting_participants`, `meeting_games` | aktywni | admin; spotkanie i uczestników zapisuje tylko RPC `save_meeting` (`created_by` z tokenu), status `start_meeting` / `finish_meeting` (także prowadzący), opublikowane gry i flagę głosowania `publish_meeting_games` / `reopen_voting`; usunięcie spotkania: `DELETE` admina |
| `game_votes`                                        | aktywni | własny głos, uczestnik, tylko przy otwartym głosowaniu (wyzwalacz blokuje też wyścig z zamknięciem)                                                                                                                                                                         |
| `plays`, `play_results`                             | aktywni | tylko RPC (także usunięcie partii i porzucenie szkicu, z przeliczeniem statystyk)                                                                                                                                                                                           |
| `achievement_unlocks`                               | aktywni | tylko przeliczenie osiągnięć (RPC)                                                                                                                                                                                                                                          |

Funkcje sprawdzające role są w schemacie `private` (PostgREST go nie udostępnia): `is_active_member()`, `is_admin()`, `is_meeting_runner(meeting_id)` (admin albo `host_id` niezakończonego spotkania). Są `security definer` z pustym `search_path`. Każde RPC `security definer` z kolejnych zadań zaczyna od strażnika `private.require_admin()`, `private.require_meeting_runner(meeting_id)` albo `private.require_active_member()` (błąd `42501`), ma `set search_path = ''`, w pełni kwalifikowane nazwy i jawne `grant execute ... to authenticated`.

Buckety Storage są prywatne (odczyt dla aktywnych kont, pliki przez sesję lub podpisany URL), przyjmują WebP, JPEG i PNG:

| Bucket      | Limit | Ścieżka                            | Zapis                                                                                                                       |
| ----------- | ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `avatars`   | 1 MiB | `<profile_id>/<plik>`              | właściciel folderu (bez podfolderów)                                                                                        |
| `covers`    | 2 MiB | dowolna (okładki gier, logo klubu) | admin                                                                                                                       |
| `scorepads` | 5 MiB | `<game_id>/<scorepad_id>-<uuid>`   | admin; pliku wskazanego przez wersję notesu nie da się usunąć ani nadpisać                                                  |
| `sheets`    | 2 MiB | `<meeting_id>/<play_id>-<sufiks>`  | dodanie: admin lub prowadzący niezakończonego spotkania; bez nadpisywania (nowa nazwa przy każdej próbie); usunięcie: admin |

## Konta i logowanie

Wymagania: PRD AUTH-1…AUTH-5, AUTH-7. Kod: migracja [`20261113000500_accounts_and_login.sql`](supabase/migrations/20261113000500_accounts_and_login.sql), pakiet [`packages/accounts`](packages/accounts), logowanie w SPA w [`apps/web/src/auth`](apps/web/src/auth).

- **Login to hook.** Konto Supabase Auth ma techniczny e-mail `<hook>@users.bgclub.invalid` (domena `.invalid` nie przyjmuje poczty). Ekran logowania przyjmuje hook (bez spacji na brzegach i bez rozróżniania wielkości liter), zamienia go na ten e-mail i nigdy go nie pokazuje. E-maila nie da się zmienić (wyzwalacz na `auth.users`), bo hook jest niezmienny.
- **Konto i profil w jednej transakcji.** Profil zakłada wyzwalacz na `auth.users` z `app_metadata.bg_club` (`first_name`, `last_name`, `role`). Te metadane ustawia tylko klucz service role, więc konto utworzone inaczej (rejestracja, gdyby ktoś ją włączył, albo „Add user” w panelu Supabase) jest odrzucane w całości: nie zostaje ani konto Auth, ani profil.
- **Pierwszy jest administrator** (AUTH-3). Rola `admin` przechodzi tylko na pustej instalacji, a konto gracza dopiero wtedy, gdy administrator istnieje. Drugi administrator nie powstanie także przy równoległych próbach.
- **Bootstrap** to skrypt `pnpm bootstrap:admin` (lokalnie `pnpm bootstrap:admin:local`), a nie publiczny endpoint, więc nikt nie przejmie pustej instancji przed instalującym. Dane: `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`, opcjonalnie `BOOTSTRAP_ADMIN_PASSWORD` (min. 12 znaków; bez niego skrypt generuje losowe i wypisuje je raz). Tworzy wyłącznie konto administratora, bez klubu i danych demonstracyjnych. Ponowne uruchomienie niczego nie zmienia (także hasła) i wypisuje hook istniejącego administratora.
- **Sesja trwa do wylogowania** (AUTH-5): supabase-js trzyma ją w `localStorage` i sam odświeża token. Wylogowanie dotyczy tego urządzenia (`scope: 'local'`): sesja znika lokalnie także bez sieci, a serwer unieważnia jej token odświeżania. Zmiana użytkownika czyści cache zapytań.
- **Konto usunięte** (AUTH-7). Hook Auth `custom_access_token` (`public.custom_access_token_hook`) odmawia wydania i odświeżenia tokenu kontu bez aktywnego profilu (403 `account_inactive`). Token wydany wcześniej (do `jwt_expiry`, 1 h) nie daje danych, bo RLS wymaga aktywnego profilu; aplikacja kończy wtedy sesję i pokazuje komunikat. Złe hasło usuniętego konta daje zwykły błąd „Nieprawidłowy hook lub hasło”.
- **Błędy logowania** są po polsku (`t.auth.errors`): złe dane, konto usunięte, limit prób, brak połączenia.

## Edge Functions

Funkcje są w [`supabase/functions`](supabase/functions) (Deno). `pnpm db:start` uruchamia je razem z lokalnym Supabase pod `http://127.0.0.1:54321/functions/v1/<nazwa>`; nową funkcję lokalny stos widzi po `pnpm db:stop && pnpm db:start`. Kod wspólny z SPA i skryptami (hook, hasło, tworzenie członka) importują ścieżką względną z `packages/accounts/src` (moduły bez zależności).

```bash
cd supabase/functions
deno lint
deno check create-member/index.ts delete-member/index.ts delete-own-account/index.ts
deno test
```

`deno.json` w `supabase/functions` wyłącza lockfile i `node_modules`, żeby Deno nie modyfikował workspace'u pnpm. Formatowanie robi Prettier (`pnpm format`), jak w reszcie repozytorium.

## Testy (NFR-11)

- **Jednostkowe:** Vitest, pliki `*.test.ts(x)` obok kodu. Logika wyników w `packages/scoring`.
- **SQL:** pgTAP w `supabase/tests/database/*.test.sql` (profil i ustawienia: `090`, kolekcja gier: `100`, punkty za miejsca: `110`, generowany ze wspólnych przypadków, notesy i wersje: `120`, planowanie i statusy spotkań: `130`), uruchamiane przez `supabase test db`. Każdy plik działa w transakcji zakończonej `rollback` i używa wyłącznie fikcyjnych danych. Testy uprawnień (`050`, `060`) przełączają się na role `anon` i `authenticated` z tokenem w `request.jwt.claims`, tak jak PostgREST i Storage API.
- **Edge Functions:** `deno test` w `supabase/functions` (obsługa żądania z atrapami Auth i bazy: 401, 403 dla gracza, 400, brak hasła w logach). Logika hooka i hasła (polskie znaki, kolizje, wyczerpanie prób) ma testy Vitest w `packages/accounts`.
- **Integracyjne (Auth):** Vitest w `packages/accounts/integration/`, uruchamiane przez `pnpm test:auth` na lokalnym Supabase (Auth, PostgREST, Edge Functions). Idą przez prawdziwe API: bootstrap na pustej instalacji (także równoległy), ponowienie, zamknięta rejestracja, logowanie hookiem, odświeżenie i wylogowanie, konto usunięte, dodawanie członków przez `create-member` (logowanie nowym kontem, kolizje hooków przy równoległych żądaniach, odmowa dla gracza i bez sesji, brak konta po złych danych), usuwanie członka i własnego konta (`delete-member`, `delete-own-account`: odmowa dla gracza i dla konta admina, istniejąca sesja bez danych i odświeżenia, brak logowania, skutki MEM-6 w spotkaniach zaplanowanym, trwającym i zakończonym, zakaz dodania usuniętego do spotkania, ponowienie, hasło przy własnym koncie), równoległe zakładanie klubu i zmiana strefy, planowanie spotkania przez `save_meeting` i równoczesne starty spotkań z dwóch sesji (MTG-2), ustawienia profilu (flaga AUTH-6, zmiana hasła tylko z poprawnym obecnym hasłem i co najmniej 12 znakami, zdjęcie we własnym folderze, odmowa edycji cudzego profilu przez admina). Wymagają pustej bazy: przed kolejnym uruchomieniem `pnpm db:reset`. Zmienna `BG_CLUB_FUNCTIONS_URL` wskazuje funkcje uruchomione osobno (np. `deno run` w `supabase/functions`), domyślnie bramka lokalnego Supabase.
- **E2E:** Playwright w `apps/web/e2e/`. Każdy test przechodzi w czterech projektach: `mobile-light`, `mobile-dark` (360×740) oraz `desktop-light`, `desktop-dark` (1280×900). API Supabase jest w nich atrapą ([`e2e/support/supabaseMock.ts`](apps/web/e2e/support/supabaseMock.ts)); prawdziwe Auth sprawdza `pnpm test:auth`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) uruchamia się dla każdego PR i dla pushy do `master`. Cztery zadania:

1. **check:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
2. **e2e:** Playwright (Chromium), raport HTML jako artefakt przy błędzie,
3. **functions:** `deno lint`, `deno check`, `deno test` w `supabase/functions`,
4. **sql:** lokalny Supabase (Postgres, Auth, PostgREST, Storage, Edge Functions, bez pozostałych usług), migracje i seed, `pnpm test:sql`, `pnpm db:lint`, `pnpm test:auth`, potem `pnpm db:reset` (odtworzenie pustej bazy i ponowne zastosowanie migracji) i jeszcze raz `pnpm test:sql` i `pnpm test:auth` (ponowna instalacja od zera).

## Wdrożenie (zarys)

Pełna instrukcja wdrożenia od zera, kopii zapasowych i odtworzenia powstaje w zadaniu [042] (NFR-8, NFR-9). W skrócie:

- **Supabase:** projekt w panelu Supabase, potem `pnpm exec supabase link --project-ref <ref>` i `pnpm exec supabase db push` (migracje).
- **Auth w panelu Supabase** (`config.toml` działa tylko lokalnie):
  - Authentication → Sign In / Providers: wyłączyć „Allow new users to sign up” i „Allow anonymous sign-ins” (AUTH-2).
  - Authentication → Hooks: dodać „Customize Access Token (JWT) Claims”, typ Postgres, funkcja `public.custom_access_token_hook` (AUTH-7). Bez tego usunięte konto zaloguje się, choć nie zobaczy danych.
  - Authentication → Sign In / Providers → Email: minimalna długość hasła **12** i wymaganie obecnego hasła przy zmianie hasła (odpowiedniki `minimum_password_length` i `require_current_password` z `config.toml`, w GoTrue `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`). Bez tego Auth przyjmie zmianę hasła bez obecnego hasła, choć formularz o nie pyta (USR-5).
- **Edge Functions:** `pnpm exec supabase functions deploy create-member delete-member delete-own-account` (po `supabase link`; CLI przenosi `verify_jwt = false` z `config.toml`, bo token sprawdza sama funkcja). Funkcje dostają `SUPABASE_URL`, `SUPABASE_ANON_KEY` i `SUPABASE_SERVICE_ROLE_KEY` od Supabase; nie trzeba ustawiać sekretów. Bez wdrożonych funkcji „Dodaj członka”, „Usuń członka” i „Usuń konto” kończą się komunikatem o błędzie.
- **Pierwszy administrator:** na komputerze instalującego, z adresem projektu i kluczem service role z panelu (Project Settings → API Keys). Klucz nie trafia do repozytorium ani do Cloudflare.

  ```bash
  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<klucz> \
  BOOTSTRAP_ADMIN_FIRST_NAME=<imię> BOOTSTRAP_ADMIN_LAST_NAME=<nazwisko> \
  pnpm bootstrap:admin
  ```

  Zmienne można też zapisać w `supabase/seed/.env`. Skrypt wypisuje hook i jednorazowo wygenerowane hasło; ponowne uruchomienie niczego nie zmienia.

- **Cloudflare Pages:** połączenie z repozytorium, gałąź produkcyjna `master` (PRD Q20), preview dla PR.
  - Build command: `pnpm build`
  - Build output directory: `apps/web/dist`
  - Zmienne środowiskowe: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (osobno dla Production i Preview).
  - Wersję Node.js Cloudflare odczytuje z `.nvmrc`. Bez pliku `404.html` Pages serwuje `index.html` dla każdej ścieżki SPA.
