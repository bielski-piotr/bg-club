# BG Club

Aplikacja webowa dla jednego klubu planszówkowego: spotkania, głosowanie na gry, notes punktacji 3D, historia partii, leaderboardy i osiągnięcia.

- Wymagania produktowe: [PRD.md](PRD.md)
- Wygląd: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)

Stos (PRD §8.1): Vite + TypeScript + React + TanStack Query, Supabase (Postgres, Auth, Storage, Edge Functions), hosting statyczny na Cloudflare Pages.

## Struktura repozytorium

```
apps/web/              SPA (React). Teksty interfejsu: apps/web/src/i18n/pl.ts
packages/score-pad/    web componenty <score-pad> i <score-pad-editor> (źródła z POC, zadanie [013])
packages/scoring/      czysta logika wyników: miejsca, remisy, punkty, serie (+ testy)
supabase/config.toml   konfiguracja lokalnego Supabase (CLI)
supabase/migrations/   schemat, RLS i funkcje SQL
supabase/functions/    Edge Functions (Deno)
supabase/seed/         pliki seed ładowane przez `supabase db reset`
supabase/tests/        testy SQL (pgTAP)
.github/workflows/     CI
```

## Wymagania

- **Node.js 22** (wersja w `.nvmrc`).
- **pnpm 10**. Najprościej przez Corepack: `corepack enable` (wersję wskazuje pole `packageManager` w `package.json`).
- **Docker** (Docker Desktop, OrbStack, Colima itp.), potrzebny do lokalnego Supabase i testów SQL. Supabase CLI instaluje się razem z zależnościami (`pnpm exec supabase`), nie trzeba go instalować globalnie.

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

# Konfiguracja frontendu.
cp apps/web/.env.example apps/web/.env.local
# W apps/web/.env.local wpisz:
#   VITE_SUPABASE_URL      = API URL z `supabase status` (domyślnie http://127.0.0.1:54321)
#   VITE_SUPABASE_ANON_KEY = klucz anon / publishable z `supabase status`

pnpm dev
```

Aplikacja działa pod <http://localhost:5173>. Bez uzupełnionych zmiennych pokazuje komunikat „Brak konfiguracji aplikacji” z listą brakujących wartości.

Studio Supabase (podgląd bazy) jest pod <http://127.0.0.1:54323>. Zatrzymanie: `pnpm db:stop`.

## Komendy

Uruchamiane w katalogu głównym repozytorium.

| Komenda                          | Co robi                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`                       | serwer deweloperski aplikacji (port 5173)                                                      |
| `pnpm build`                     | build produkcyjny do `apps/web/dist`                                                           |
| `pnpm preview`                   | podgląd buildu (port 4173)                                                                     |
| `pnpm typecheck`                 | sprawdzenie typów we wszystkich pakietach                                                      |
| `pnpm lint`                      | ESLint i Prettier (`--check`)                                                                  |
| `pnpm format`                    | formatowanie Prettierem                                                                        |
| `pnpm test`                      | testy jednostkowe (Vitest) we wszystkich pakietach                                             |
| `pnpm test:e2e`                  | testy E2E (Playwright): telefon 360 px i desktop, motyw jasny i ciemny                         |
| `pnpm check`                     | typy, lint, testy jednostkowe i build naraz                                                    |
| `pnpm db:start` / `pnpm db:stop` | start i stop lokalnego Supabase                                                                |
| `pnpm db:reset`                  | odtworzenie lokalnej bazy z migracji i seeda                                                   |
| `pnpm db:lint`                   | lint schematu bazy (`supabase db lint`)                                                        |
| `pnpm test:sql`                  | testy SQL (pgTAP) na lokalnej bazie; wymaga `pnpm db:start` albo `pnpm exec supabase db start` |

Pierwsze uruchomienie E2E na nowym komputerze wymaga przeglądarki Playwright:

```bash
pnpm --filter @bg-club/web exec playwright install chromium
```

`pnpm test:e2e` sam buduje aplikację i uruchamia `vite preview`. Bez zmiennych środowiskowych używa lokalnego adresu Supabase i klucza zastępczego.

## Konfiguracja i sekrety

Repozytorium jest przygotowane do upublicznienia (PRD §1.1, NFR-9): nie zawiera sekretów ani danych klubu.

- Frontend czyta wyłącznie `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` (NFR-1). Wzór: [`apps/web/.env.example`](apps/web/.env.example). Klucz anon jest publiczny z założenia; dostęp chroni RLS.
- Klucz `service_role` jest używany tylko w Edge Functions i nigdy nie trafia do frontendu ani do repozytorium. Lokalne sekrety funkcji: `supabase/functions/.env` (wzór: [`supabase/functions/.env.example`](supabase/functions/.env.example)).
- Pliki `.env` i `.env.*` (poza `.env.example`) są w `.gitignore`.
- Rejestracja samodzielna jest wyłączona (`enable_signup = false`, PRD §1.2). Konta tworzy administrator.

## Teksty interfejsu

Interfejs jest po polsku, a wszystkie teksty są w jednym module: [`apps/web/src/i18n/pl.ts`](apps/web/src/i18n/pl.ts) (PRD §1.1). Komponenty importują `t` i `format` z `apps/web/src/i18n`. Nowy tekst dodaje się najpierw do słownika, nigdy jako literał w komponencie.

## Schemat bazy

Migracje w [`supabase/migrations/`](supabase/migrations) odtwarzają cały schemat od zera (`pnpm db:reset`). Model danych opisuje PRD §6; poniżej reguły, które wymusza sama baza.

| Tabela                             | Co przechowuje                                        | Najważniejsze reguły w bazie                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `club`                             | jedyny klub: nazwa, logo, strefa IANA                 | jeden wiersz (`id = 1`), strefa sprawdzana z `pg_timezone_names`                                                                                                                       |
| `profiles`                         | gracze; `id` = `auth.users.id`                        | bez klucza obcego do Auth: usunięcie konta Auth tylko ustawia `deleted_at`; jeden admin; admina nie da się usunąć; `hook` unikalny i niezmienny                                        |
| `games`                            | kolekcja gier                                         | `1 ≤ min ≤ max`, bez górnego limitu; `placement_points` ma długość `max_players`, wartości ≥ 0; `title_search` do wyszukiwania bez polskich znaków (`unaccent` + `pg_trgm`)            |
| `scorepads`, `scorepad_versions`   | notesy gry i ich wersje                               | wersje niezmienne, numerowane w bazie; `current_version_id` wskazuje wersję tego samego notesu                                                                                         |
| `meetings`, `meeting_participants` | spotkania i uczestnicy                                | najwyżej jedno spotkanie `in_progress`; prowadzący jest uczestnikiem innym niż admin (`NULL` = admin); usunięty członek nie dołączy do spotkania                                       |
| `game_votes`, `meeting_games`      | głosy i opublikowane gry                              | jeden głos na grę; głosuje tylko uczestnik; usunięcie uczestnika kasuje jego głosy                                                                                                     |
| `plays`, `play_results`            | partie (szkic lub zapisana karteczka) i wyniki graczy | snapshot punktacji i wersji notesu ustawiany w bazie przy utworzeniu szkicu; jedna partia gracza na karteczce; 2…min(max gry, miejsca w notesie) graczy; zapisana karteczka niezmienna |
| `achievement_unlocks`              | odblokowane osiągnięcia                               | identyfikator z katalogu w kodzie                                                                                                                                                      |

Znaczniki czasu to wyłącznie `timestamptz` (NFR-10). Gry i profile usuwa się miękko, a klucze obce do nich blokują twarde usunięcie, więc historia zostaje. RLS jest włączone na każdej tabeli; polityki dostępu, RPC i buckety Storage dochodzą w zadaniu [004].

Kolejność zdarzeń (PRD §5.6.6): spotkania `starts_at, id`, partie w spotkaniu `saved_at, id`; obie mają indeksy.

## Testy (NFR-11)

- **Jednostkowe:** Vitest, pliki `*.test.ts(x)` obok kodu. Logika wyników w `packages/scoring`.
- **SQL:** pgTAP w `supabase/tests/database/*.test.sql`, uruchamiane przez `supabase test db`. Każdy plik działa w transakcji zakończonej `rollback` i używa wyłącznie fikcyjnych danych.
- **E2E:** Playwright w `apps/web/e2e/`. Każdy test przechodzi w czterech projektach: `mobile-light`, `mobile-dark` (360×740) oraz `desktop-light`, `desktop-dark` (1280×900).

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) uruchamia się dla każdego PR i dla pushy do `master`. Trzy zadania:

1. **check:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
2. **e2e:** Playwright (Chromium), raport HTML jako artefakt przy błędzie,
3. **sql:** lokalny Postgres Supabase (`supabase db start`), migracje i seed, `pnpm test:sql`, `pnpm db:lint`, potem `pnpm db:reset` (odtworzenie pustej bazy i ponowne zastosowanie migracji) i jeszcze raz `pnpm test:sql`.

## Wdrożenie (zarys)

Pełna instrukcja wdrożenia od zera, kopii zapasowych i odtworzenia powstaje w zadaniu [042] (NFR-8, NFR-9). W skrócie:

- **Supabase:** projekt w panelu Supabase, potem `pnpm exec supabase link --project-ref <ref>` i `pnpm exec supabase db push` (migracje).
- **Cloudflare Pages:** połączenie z repozytorium, gałąź produkcyjna `master` (PRD Q20), preview dla PR.
  - Build command: `pnpm build`
  - Build output directory: `apps/web/dist`
  - Zmienne środowiskowe: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (osobno dla Production i Preview).
  - Wersję Node.js Cloudflare odczytuje z `.nvmrc`. Bez pliku `404.html` Pages serwuje `index.html` dla każdej ścieżki SPA.
