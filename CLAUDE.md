# BG Club 2.0 — instrukcje dla agentów

PWA jednego klubu planszówkowego: spotkania, głosowanie na gry, partie w notesie 3D, rankingi, statystyki i osiągnięcia. Wersja 2.0 powstaje od nowa na Solid 2.0 i przenosi funkcje z wersji 1 (`../bg-club`, React).

- **Wymagania:** `PRD.md`.
- **Wzorce UI:** `DESIGN-SYSTEM.html`.
- **Język:** interfejs, komentarze w kodzie i dokumentacja są po polsku.

## Stan

- Repozytorium ma szkielet bez funkcji.
- Funkcje przenosimy z wersji 1 pojedynczo, według `PRD.md`.
- **Backend: Supabase.** Dane instancji wersji 1 (baza, konta Auth z hasłami, pliki Storage) muszą dać się przenieść do wersji 2.0.

## Stos

| Obszar   | Wybór                                                                                |
| -------- | ------------------------------------------------------------------------------------ |
| Monorepo | pnpm 12, workspace `apps/*` i `packages/*`, Node ≥ 22.12                             |
| Język    | TypeScript 7, `strict` i `exactOptionalPropertyTypes` (`tsconfig.base.json`)         |
| Frontend | `apps/web`: Solid 2.0 (`solid-js`, `@solidjs/web`), Vite 8, `@solidjs/vite-plugin` 3 |
| Backend  | Supabase: Postgres z RLS, Auth, Storage, Edge Functions                              |
| Testy    | Vitest, jsdom, `@solidjs/testing-library`                                            |
| Lint     | oxlint z `eslint-plugin-solid/configs/v2`, formatowanie Prettierem                   |
| Hosting  | Cloudflare: statyczne assety z `apps/web/dist/client`, tryb SPA (`wrangler.jsonc`)   |

Tryb `start: true` wtyczki Vite:

- nie ma `index.html` ani pliku startowego;
- `src/App.tsx` to korzeń aplikacji;
- `src/Document.tsx` to powłoka HTML, prerenderowana przy buildzie i bez JS klienta.

## Komendy

```powershell
pnpm install
pnpm dev      # apps/web, http://localhost:5173
pnpm check    # typecheck, lint, test, build z kontrolą budżetu bundla
pnpm format
```

## Solid 2.0

API Solid 2.0 różni się od Reacta i od Solid 1.x. Skille pochodzą z pakietów Solid; `pnpm install` linkuje je do `.claude/skills`.

- **Przed pisaniem lub przeglądem kodu Solid** wczytaj skill `solid-2.0`.
- **Sygnatury API** sprawdzaj w skillu `solid-2.0-cheatsheet`.
- **Kody ostrzeżeń z konsoli** (`[CODE]`) wyjaśnia skill `reactivity-diagnostics`.

## Konwencje

- **Teksty:** komponenty nie zawierają literałów tekstowych.
  - Wszystkie teksty są w `apps/web/src/i18n/pl.ts`.
  - Liczbę mnogą obsługuje `plural` (formy `one` / `few` / `many`), a parametry podstawia `format`.
- **Style:**
  - kolory wyłącznie przez zmienne z `src/styles/tokens.css`, w obu motywach;
  - nowy wzorzec UI trafia najpierw do `src/ui`.
- **Budżet bundla:** pilnuje go `apps/web/scripts/check-bundle.mjs`.
  - Początkowy JS ≤ 215 KB, a CSS ≤ 30 KB po gzip.
  - Notes i edytor 3D wyłącznie przez `import()`.
- **Responsywność i dostępność:** od 360 px, pełna obsługa klawiaturą i czytnikiem ekranu.
- **Format kodu:** Prettier (pojedyncze cudzysłowy, średniki, `trailingComma: all`, szerokość 100). Lint bez ostrzeżeń.
- **Komentarze:** zwięzłe i po polsku.
  - Wyjaśniają „dlaczego” albo regułę domenową.
  - Nie odwołują się do dokumentów, sekcji ani numerów zadań.
- **Testy:** piszemy je tylko wtedy, gdy mają uzasadnienie biznesowe, a nie po to, żeby były.
  - Każdy test chroni zachowanie, na którym polega użytkownik albo reguła domenowa.
  - Warunki brzegowe pokrywamy tylko te, które realnie wystąpią w danych lub w użyciu (np. polskie znaki w nazwiskach), a nie wszystkie teoretycznie możliwe (np. pusty napis, którego nie przepuści baza).
  - Nie testujemy oczywistości: samego renderu tekstu, determinizmu czystych funkcji ani tego, co sprawdza już TypeScript.
- **Dane testowe:** wyłącznie fikcyjne.

## Przepływ pracy

- Przed commitem: `pnpm check`.
- Praca na gałęzi, PR do `develop`.
