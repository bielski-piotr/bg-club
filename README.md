# BG Club

Aplikacja webowa dla jednego klubu planszówkowego: spotkania, głosowanie na gry, notes punktacji 3D, historia partii, leaderboardy i osiągnięcia.

- Wymagania produktowe: [PRD.md](PRD.md)
- Wygląd: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)

Stos (PRD §8.1): Vite + TypeScript + React + TanStack Query, Supabase (Postgres, Auth, Storage, Edge Functions), hosting statyczny na Cloudflare Pages.

## Struktura repozytorium

```
apps/web/              SPA (React). Teksty interfejsu: apps/web/src/i18n/pl.ts; hub: src/hub; klub: src/club; członkowie: src/members; popupy: src/popups
packages/accounts/     konta: hook, techniczny e-mail, hasła, tworzenie członka, skrypt bootstrapu admina (+ testy)
packages/score-pad/    web componenty <score-pad> i <score-pad-editor> (źródła z POC, zadanie [013])
packages/scoring/      czysta logika wyników: miejsca, remisy, punkty, serie (+ testy)
supabase/config.toml   konfiguracja lokalnego Supabase (CLI)
supabase/migrations/   schemat, RLS i funkcje SQL
supabase/functions/    Edge Functions (Deno): create-member (+ testy deno)
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

- **Tokeny i motywy:** [`apps/web/src/styles/tokens.css`](apps/web/src/styles/tokens.css). Motyw jasny, ciemny albo systemowy wybiera atrybut `data-theme` na `<html>` (`src/theme`); wybór jest na razie w `localStorage`, w zadaniu [010] trafi do profilu. Test `tokens.test.ts` sprawdza kontrast WCAG AA wszystkich par tekst/tło w obu motywach.
- **Fonty:** Bricolage Grotesque, Instrument Sans i DM Mono z pakietów `@fontsource*` (bez zewnętrznego CDN).
- **Komponenty:** [`apps/web/src/ui`](apps/web/src/ui), import z `src/ui`: przyciski, pola, wyszukiwarka, stepper, lista rozwijana (opcjonalnie z wyszukiwarką, `searchLabel`), checkbox, radio, pigułki wyboru, chipy, próbki kolorów, awatary i stosy, karta widżetu z tacą i wierszami, zakładki, badge i chipy statusu, toasty (`ToastProvider` + `useToast`), banery, puste stany, spinner, szkielety, switch, slider i popup (`Modal`: okno 560/880 na desktopie, pełnoekranowy arkusz na telefonie; opcjonalna stopka formularza `footer`). Teksty wbudowane w komponenty są w `t.ui`.
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
  - **logo** (opcjonalne): przeglądarka zmniejsza obraz do 800 px po dłuższym boku i koduje do WebP (`club/image.ts`, jak okładki GAME-6), plik trafia do bucketu `covers` pod nową nazwą `club/logo-<uuid>.webp`. Bez logo kafelek pokazuje monogram nazwy. Po zapisie poprzedni plik jest usuwany, a przy nieudanym zapisie wiersza usuwany jest nowy;
  - **nazwa** (wymagana, do 80 znaków, bez spacji na brzegach);
  - **strefa czasowa**: lista stref IANA z przesunięciem UTC i wyszukiwarką (po nazwie bez `_` i `/`, bez polskich znaków albo po przesunięciu, np. „utc-05”). Domyślnie strefa przeglądarki, a gdy jej nie ma lub jest nieznana, `Europe/Warsaw`. Bazę sprawdza dodatkowo wyzwalacz `club_validate` (`pg_timezone_names`).
- **Drugi klub nie powstanie.** Klucz główny `id = 1` odrzuca drugi wiersz (`23505`), także przy równoległych próbach. Formularz traktuje to jako „Klub został już założony”, zamyka się i pokazuje istniejący klub.
- **Strefa a terminy** (NFR-10). Terminy spotkań są `timestamptz`, więc zmiana strefy klubu zmienia tylko sposób wyświetlania dat i granice roku, a nie zapisane chwile. Sprawdzają to test SQL `080_club` i `pnpm test:auth`.
- **Logo w nagłówku** jest pobierane z prywatnego bucketu przez podpisany URL (ważny godzinę, `useCoverUrl`).
- **Widżety po założeniu klubu** (CLUB-4) mają puste stany. Pusty widżet Członkowie ma dla admina „Dodaj członka” (sekcja „Członkowie”); „Zaplanuj spotkanie” i „Dodaj grę” dochodzą razem z planowaniem spotkań i kolekcją.

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
  - Po zapisie popup pokazuje **jednorazowo** hook i hasło z przyciskami „Kopiuj” i ostrzeżeniem, że hasła nie da się odczytać ponownie. Hasło jest tylko w stanie tego popupu: nie trafia do adresu, cache'u zapytań (mutacja ma `gcTime: 0`) ani `localStorage`, więc znika po zamknięciu okna. Gdy ktoś zgubi hasło, admin usuwa konto i dodaje członka ponownie (usuwanie członków: [011]).
  - Awatar przy dodawaniu (opcjonalny w MEM-3) dochodzi w [010] razem z uploadem i kadrowaniem awatara (USR-3); do tego czasu nowy członek ma monogram.

## Schemat bazy

Migracje w [`supabase/migrations/`](supabase/migrations) odtwarzają cały schemat od zera (`pnpm db:reset`). Model danych opisuje PRD §6; poniżej reguły, które wymusza sama baza.

| Tabela                             | Co przechowuje                                        | Najważniejsze reguły w bazie                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `club`                             | jedyny klub: nazwa, logo, strefa IANA                 | jeden wiersz (`id = 1`), strefa sprawdzana z `pg_timezone_names`                                                                                                                                                                                                                                                                   |
| `profiles`                         | gracze; `id` = `auth.users.id`                        | powstaje razem z kontem Auth (wyzwalacz, sekcja „Konta i logowanie”); bez klucza obcego do Auth: usunięcie konta Auth tylko ustawia `deleted_at`; oznaczenie jako usunięty wypisuje z zaplanowanych spotkań (z głosami) i oddaje prowadzenie adminowi (MEM-6); jeden admin; admina nie da się usunąć; `hook` unikalny i niezmienny |
| `games`                            | kolekcja gier                                         | `1 ≤ min ≤ max`, bez górnego limitu; `placement_points` ma długość `max_players`, wartości ≥ 0; `title_search` do wyszukiwania bez polskich znaków (`unaccent` + `pg_trgm`)                                                                                                                                                        |
| `scorepads`, `scorepad_versions`   | notesy gry i ich wersje                               | wersje niezmienne i nieusuwalne, numerowane w bazie; `current_version_id` wskazuje wersję tego samego notesu                                                                                                                                                                                                                       |
| `meetings`, `meeting_participants` | spotkania i uczestnicy                                | najwyżej jedno spotkanie `in_progress`; przejścia `planned → in_progress → finished` (oraz `finished → in_progress`); zakończenie wymaga braku szkiców; prowadzący jest uczestnikiem innym niż admin (`NULL` = admin); usunięty członek nie dołączy do spotkania                                                                   |
| `game_votes`, `meeting_games`      | głosy i opublikowane gry                              | jeden głos na grę; głosuje tylko uczestnik; usunięcie uczestnika kasuje jego głosy                                                                                                                                                                                                                                                 |
| `plays`, `play_results`            | partie (szkic lub zapisana karteczka) i wyniki graczy | szkic tylko w spotkaniu w trakcie; snapshot punktacji i bieżącej wersji notesu ustawiany w bazie przy utworzeniu szkicu; jedna partia gracza na karteczce; najwyżej min(max gry, miejsca w notesie) graczy, przy zapisie co najmniej 2; `saved_at` nadaje baza; zapisana karteczka niezmienna                                      |
| `achievement_unlocks`              | odblokowane osiągnięcia                               | identyfikator z katalogu w kodzie                                                                                                                                                                                                                                                                                                  |

Znaczniki czasu to wyłącznie `timestamptz` (NFR-10). Gry i profile usuwa się miękko, a klucze obce do nich blokują twarde usunięcie, więc historia zostaje. Strażnicy czytający inne tabele są `security definer` z pustym `search_path`, więc polityki RLS ich nie omijają.

Kolejność zdarzeń (PRD §5.6.6): spotkania `starts_at, id`, partie w spotkaniu `saved_at, id`; obie mają indeksy.

### Uprawnienia (RLS, RPC, Storage)

Macierz uprawnień to PRD §2.1 i §6.1; wymusza ją migracja `20261113000400_access_control.sql`. Zasada: odmowa domyślna.

- **`anon`** nie ma żadnych praw do tabel i funkcji aplikacji. Wszystko wymaga zalogowania.
- **`authenticated`** ma `SELECT` na tabelach oraz `INSERT`/`UPDATE` tylko na wymienionych kolumnach (bez `TRUNCATE`). RLS zawęża to do wierszy: odczyt dla **aktywnych** kont, więc usunięte konto z wciąż ważnym tokenem nic nie widzi.
- **`service_role`** omija RLS i jest używany wyłącznie w Edge Functions i skrypcie bootstrapu. Tylko tam zmienia się `role`, `hook` i `deleted_at` profilu oraz tworzy i usuwa profile. Klucz `service_role` / `sb_secret_…` podany jako `VITE_SUPABASE_ANON_KEY` zatrzymuje `vite build` (zanim trafi do bundla), a test pilnuje, że kod SPA czyta tylko dwie publiczne zmienne.
- Nowe tabele i funkcje w `public` nie dostają praw automatycznie: migracja nadaje je jawnie, a funkcji odbiera `EXECUTE` od `PUBLIC` i `anon`. Kontrakt praw sprawdza test `050_access_control`.

| Tabela                                              | Odczyt  | Zapis przez API                                                                                                       |
| --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `club`                                              | aktywni | admin: `name`, `logo_path`, `timezone`                                                                                |
| `profiles`                                          | aktywni | właściciel: `first_name`, `last_name`, `avatar_path` (`<id>/<plik>`), `theme`; nikt nie edytuje cudzego (też admin)   |
| `games`, `scorepads`, `scorepad_versions`           | aktywni | admin; usuwanie miękkie (`deleted_at`), wersje tylko dopisywane                                                       |
| `meetings`, `meeting_participants`, `meeting_games` | aktywni | admin; `created_by` z tokenu; uczestnicy tylko przed zakończeniem; status zmienia RPC (start i koniec też prowadzący) |
| `game_votes`                                        | aktywni | własny głos, uczestnik, tylko przy otwartym głosowaniu (wyzwalacz blokuje też wyścig z zamknięciem)                   |
| `plays`, `play_results`                             | aktywni | tylko RPC (także usunięcie partii i porzucenie szkicu, z przeliczeniem statystyk)                                     |
| `achievement_unlocks`                               | aktywni | tylko przeliczenie osiągnięć (RPC)                                                                                    |

Funkcje sprawdzające role są w schemacie `private` (PostgREST go nie udostępnia): `is_active_member()`, `is_admin()`, `is_meeting_runner(meeting_id)` (admin albo `host_id` niezakończonego spotkania). Są `security definer` z pustym `search_path`. Każde RPC `security definer` z kolejnych zadań zaczyna od strażnika `private.require_admin()`, `private.require_meeting_runner(meeting_id)` albo `private.require_active_member()` (błąd `42501`), ma `set search_path = ''`, w pełni kwalifikowane nazwy i jawne `grant execute ... to authenticated`.

Buckety Storage są prywatne (odczyt dla aktywnych kont, pliki przez sesję lub podpisany URL), przyjmują WebP, JPEG i PNG:

| Bucket      | Limit | Ścieżka                            | Zapis                                                                                                                       |
| ----------- | ----- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `avatars`   | 1 MiB | `<profile_id>/<plik>`              | właściciel folderu (bez podfolderów)                                                                                        |
| `covers`    | 2 MiB | dowolna (okładki gier, logo klubu) | admin                                                                                                                       |
| `scorepads` | 5 MiB | dowolna (zdjęcia szablonów)        | admin                                                                                                                       |
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
deno check create-member/index.ts
deno test
```

`deno.json` w `supabase/functions` wyłącza lockfile i `node_modules`, żeby Deno nie modyfikował workspace'u pnpm. Formatowanie robi Prettier (`pnpm format`), jak w reszcie repozytorium.

## Testy (NFR-11)

- **Jednostkowe:** Vitest, pliki `*.test.ts(x)` obok kodu. Logika wyników w `packages/scoring`.
- **SQL:** pgTAP w `supabase/tests/database/*.test.sql`, uruchamiane przez `supabase test db`. Każdy plik działa w transakcji zakończonej `rollback` i używa wyłącznie fikcyjnych danych. Testy uprawnień (`050`, `060`) przełączają się na role `anon` i `authenticated` z tokenem w `request.jwt.claims`, tak jak PostgREST i Storage API.
- **Edge Functions:** `deno test` w `supabase/functions` (obsługa żądania z atrapami Auth i bazy: 401, 403 dla gracza, 400, brak hasła w logach). Logika hooka i hasła (polskie znaki, kolizje, wyczerpanie prób) ma testy Vitest w `packages/accounts`.
- **Integracyjne (Auth):** Vitest w `packages/accounts/integration/`, uruchamiane przez `pnpm test:auth` na lokalnym Supabase (Auth, PostgREST, Edge Functions). Idą przez prawdziwe API: bootstrap na pustej instalacji (także równoległy), ponowienie, zamknięta rejestracja, logowanie hookiem, odświeżenie i wylogowanie, konto usunięte, dodawanie członków przez `create-member` (logowanie nowym kontem, kolizje hooków przy równoległych żądaniach, odmowa dla gracza i bez sesji, brak konta po złych danych), równoległe zakładanie klubu i zmiana strefy. Wymagają pustej bazy: przed kolejnym uruchomieniem `pnpm db:reset`. Zmienna `BG_CLUB_FUNCTIONS_URL` wskazuje funkcje uruchomione osobno (np. `deno run` w `supabase/functions`), domyślnie bramka lokalnego Supabase.
- **E2E:** Playwright w `apps/web/e2e/`. Każdy test przechodzi w czterech projektach: `mobile-light`, `mobile-dark` (360×740) oraz `desktop-light`, `desktop-dark` (1280×900). API Supabase jest w nich atrapą ([`e2e/support/supabaseMock.ts`](apps/web/e2e/support/supabaseMock.ts)); prawdziwe Auth sprawdza `pnpm test:auth`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) uruchamia się dla każdego PR i dla pushy do `master`. Cztery zadania:

1. **check:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
2. **e2e:** Playwright (Chromium), raport HTML jako artefakt przy błędzie,
3. **functions:** `deno lint`, `deno check`, `deno test` w `supabase/functions`,
4. **sql:** lokalny Supabase (Postgres, Auth, PostgREST, Edge Functions, bez pozostałych usług), migracje i seed, `pnpm test:sql`, `pnpm db:lint`, `pnpm test:auth`, potem `pnpm db:reset` (odtworzenie pustej bazy i ponowne zastosowanie migracji) i jeszcze raz `pnpm test:sql` i `pnpm test:auth` (ponowna instalacja od zera).

## Wdrożenie (zarys)

Pełna instrukcja wdrożenia od zera, kopii zapasowych i odtworzenia powstaje w zadaniu [042] (NFR-8, NFR-9). W skrócie:

- **Supabase:** projekt w panelu Supabase, potem `pnpm exec supabase link --project-ref <ref>` i `pnpm exec supabase db push` (migracje).
- **Auth w panelu Supabase** (`config.toml` działa tylko lokalnie):
  - Authentication → Sign In / Providers: wyłączyć „Allow new users to sign up” i „Allow anonymous sign-ins” (AUTH-2).
  - Authentication → Hooks: dodać „Customize Access Token (JWT) Claims”, typ Postgres, funkcja `public.custom_access_token_hook` (AUTH-7). Bez tego usunięte konto zaloguje się, choć nie zobaczy danych.
- **Edge Functions:** `pnpm exec supabase functions deploy create-member` (po `supabase link`; CLI przenosi `verify_jwt = false` z `config.toml`, bo token sprawdza sama funkcja). Funkcja dostaje `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` od Supabase; nie trzeba ustawiać sekretów. Bez wdrożonej funkcji „Dodaj członka” kończy się komunikatem o błędzie.
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
