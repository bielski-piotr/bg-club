# BG Club — instrukcje dla agentów

PWA jednego klubu planszówkowego: spotkania, głosowanie na gry, partie w notesie 3D, rankingi, statystyki i osiągnięcia. Interfejs i komentarze w kodzie są po polsku.

## Stos

- **Monorepo:** pnpm 10 (workspace `apps/*`, `packages/*`), Node ≥ 22.18 (`.nvmrc`: 22), TypeScript strict.
- **Frontend (`apps/web`):** React 19, Vite 8, TanStack Query 5, supabase-js 2, bez routera; adresy popupów są w parametrach `p`.
- **Backend:** Supabase (Postgres z RLS, Auth, Storage, Edge Functions w Deno). Logika chroniona jest w SQL (RPC `security definer`), a nie w kliencie.
- **Testy:**
  - Vitest z jsdom i Testing Library;
  - Playwright z axe, z API Supabase jako atrapą;
  - pgTAP dla bazy;
  - `deno test` dla Edge Functions.
- **Hosting:** Cloudflare (statyczne assety `apps/web/dist`, tryb SPA, `wrangler.jsonc`).

## Struktura

| Ścieżka                   | Zawartość                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/<obszar>`   | Moduły funkcji: `auth`, `club`, `hub`, `members`, `profile`, `games`, `score-pad`, `sheets`, `meetings`, `leaderboard`, `popups`, `pwa`, `theme`. Zwykle `<x>.ts` (dane, zapytania, błędy, czysta logika) + `<X>Popup.tsx` / `<X>Dialog.tsx` + `<x>.css` + testy obok. |
| `apps/web/src/ui`         | Komponenty design systemu (Button, Field, Modal/Dialog, Menu, Tabs, Avatar, Badge, Toast…).                                                                                                                                                                            |
| `apps/web/src/styles`     | `tokens.css` (kolory, typografia, odstępy, oba motywy), `base.css`.                                                                                                                                                                                                    |
| `apps/web/src/i18n/pl.ts` | Wszystkie teksty interfejsu; `format` i `plural` z `src/i18n`.                                                                                                                                                                                                         |
| `apps/web/src/popups`     | Stos popupów i ich adresy (`routes.ts`: `PopupRoute`, `parseRoute`, `serializeRoute`).                                                                                                                                                                                 |
| `apps/web/e2e`            | Testy Playwright; `support/supabaseMock.ts` to atrapa API.                                                                                                                                                                                                             |
| `packages/scoring`        | Czysta logika wyników: miejsca, remisy, punkty, wzór skomplikowania, osiągnięcia. Wspólne przypadki TS/SQL w `src/cases`.                                                                                                                                              |
| `packages/score-pad`      | Web componenty `<score-pad>` i `<score-pad-editor>` (Three.js), ładowane leniwie. `src/core` i `src/editor` to źródła przeniesione z POC.                                                                                                                              |
| `packages/accounts`       | Hook, techniczny e-mail, generowanie haseł, bootstrap administratora (`pnpm bootstrap:admin`).                                                                                                                                                                         |
| `supabase/migrations`     | Schemat, RLS, RPC, wyzwalacze. Każda migracja zaczyna się blokiem „Zasady”.                                                                                                                                                                                            |
| `supabase/functions`      | Edge Functions: `create-member`, `delete-member`, `delete-own-account` (`index.ts` w Deno + `handler.ts` testowalny bez Deno, `_shared`).                                                                                                                              |
| `supabase/tests/database` | Testy pgTAP, numerowane `NNN_<obszar>.test.sql`.                                                                                                                                                                                                                       |
| `scripts/backup`          | Eksport, weryfikacja, odtworzenie i ćwiczenie odtworzenia instancji.                                                                                                                                                                                                   |

## Komendy

```powershell
pnpm install
pnpm db:start                  # lokalny Supabase (wymaga Dockera)
pnpm bootstrap:admin:local     # pierwszy administrator lokalnie
pnpm dev                       # apps/web na Vite
pnpm check                     # typecheck + lint + test + build
pnpm test:e2e                  # Playwright, 4 projekty: mobile/desktop × light/dark
pnpm test:sql                  # pgTAP (po pnpm db:reset)
pnpm test:auth                 # integracja Auth na lokalnym Supabase
pnpm db:lint                   # lint schematu
pnpm --filter @bg-club/scoring gen:sql   # regeneracja testów SQL ze wspólnych przypadków
```

- **Plik `apps/web/.env.local`** (wzór `apps/web/.env.example`) zawiera `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`. Klucz `service_role` nigdy nie trafia do frontendu, a build go odrzuca.
- **Na Windows `gen:sql` nie działa przez pnpm**, bo skrypt ustawia zmienną środowiskową w stylu POSIX. Uruchom w `packages/scoring`: `$env:SCORING_WRITE_SQL='1'; npx vitest run src/sql.test.ts`.
- **CI** uruchamia typecheck, lint, test, build, e2e, Deno (lint, check, test), pgTAP, `db:lint`, `test:auth` i `test:restore`.

## Zasady architektury

- **Serwer jest źródłem prawdy.** Punkty, remisy, wygrane, rankingi, statystyki i osiągnięcia liczy baza. Klient wysyła tylko miejsca i wartości z kartki, a baza sprawdza ich zgodność z regułą notesu.
- **Zapisy wielotabelowe idą przez RPC** (`save_meeting`, `start_play`, `save_play_draft`, `save_play`, `delete_play`, `save_scorepad`, `publish_meeting_games`…).
  - Każde RPC zaczyna od `private.require_admin()` albo `private.require_meeting_runner(meeting_id)`.
  - Bezpośredni INSERT/UPDATE na tych tabelach jest odebrany roli `authenticated`.
- **RLS:**
  - odmowa domyślna;
  - `anon` nie ma żadnych praw;
  - każdy odczyt wymaga aktywnego profilu (`private.is_active_member()`);
  - funkcje statystyk są `security invoker`, żeby obowiązywało RLS.
- **Błędy reguł** mają SQLSTATE 23514 (konflikt szkicu PT409, brak wiersza P0002) i nazwę reguły w `HINT`. Moduł obszaru w `apps/web` mapuje HINT na komunikat z `pl.ts`, a każdy nowy HINT wymaga takiego mapowania.
- **Idempotencja:** identyfikatory partii nadaje klient. Ponowienie `start_play` i `save_play` z tą samą treścią zwraca istniejący wiersz, a inna treść pod tym samym id daje błąd.
- **Historia jest nienaruszalna:**
  - profile, gry i notesy usuwamy miękko (`deleted_at`), a klucze obce do nich są RESTRICT;
  - wersje notesów są niezmienne;
  - partia ma własny snapshot punktacji (`points_snapshot`) i wskazuje wersję notesu.
- **Przeliczenia** liczą się z `play_results` przy odczycie. Osiągnięcia przelicza w całości `private.recalculate_achievements()` w transakcji zmiany, a równoległe przeliczenia szereguje blokada doradcza.
- **Kolejność zdarzeń jest wszędzie ta sama:** spotkania po `starts_at`, potem `id`; partie po `saved_at`, potem `id`.
- **Spójność TS/SQL:** logika obecna w obu miejscach (`play_points`, miejsca, osiągnięcia) musi przejść wspólne przypadki z `packages/scoring/src/cases`. Po zmianie przypadków regeneruj testy SQL przez `gen:sql`.
- **Migracje:** zmiana schematu to zawsze nowy plik `supabase/migrations/<YYYYMMDDHHMMSS>_<nazwa>.sql`. Nie zmieniaj logiki istniejących migracji.

## Konwencje frontendu

- **Teksty:** komponenty nie zawierają literałów tekstowych. Nowe teksty trafiają do `pl.ts` z formami `one` / `few` / `many`.
- **UI:**
  - używaj komponentów z `src/ui` i tokenów z `tokens.css`; nowy wzorzec UI najpierw dodaj do `src/ui`;
  - kolory wyłącznie przez zmienne CSS, w obu motywach.
- **Popup:** nowy popup to nowy wariant `PopupRoute` z parsowaniem i serializacją adresu oraz testem w `routes.test.ts`. Akcje, do których użytkownik nie ma prawa, nie są renderowane, a wejście z adresem pokazuje czytelny stan.
- **Dane:**
  - TanStack Query, klucze per obszar;
  - mutacja zmieniająca partie unieważnia `PLAY_DEPENDENT_KEYS` (ranking, statystyki, gablota, spotkania).
- **Obrazy** skalujemy w przeglądarce przed wysłaniem do Storage (WebP, z fallbackiem JPEG/PNG).
- **Notes i edytor:** ładuj je tylko przez dynamiczny `import()`, bo pilnuje tego budżet bundla (`apps/web/scripts/check-bundle.mjs`: JS ≤ 215 KB gzip, CSS ≤ 30 KB). Źródeł `packages/score-pad/src/core` i `src/editor` nie przeformatowuj.
- **Responsywność i dostępność:** wszystko działa od 360 px, z klawiatury i z czytnikiem ekranu. Każdy test e2e przechodzi w 4 projektach Playwright.

## Styl kodu

- Prettier: pojedyncze cudzysłowy, średniki, `trailingComma: all`, szerokość 100. ESLint bez ostrzeżeń.
- **Komentarze** są po polsku, zwięzłe i wyjaśniają „dlaczego” albo regułę domenową.
  - Nie odwołuj się w nich do dokumentów, sekcji, identyfikatorów wymagań ani numerów zadań.
  - Każda migracja i każdy plik testów pgTAP zaczyna się opisem obszaru.
- **Dane testowe** są fikcyjne.

## Przepływ pracy

- Zmiana funkcji obejmuje: migrację (gdy trzeba), test pgTAP, logikę i test jednostkowy, test e2e oraz teksty w `pl.ts`.
- Przed commitem uruchom `pnpm check`. Przy zmianach bazy dodatkowo `pnpm db:reset` i `pnpm test:sql`.
- **Gałęzie:** praca na gałęzi i PR do `master`.
- **Pierwsze wdrożenie Supabase** wymaga w panelu:
  - wyłączonej rejestracji;
  - hooka `custom_access_token_hook`;
  - `require_current_password`.
