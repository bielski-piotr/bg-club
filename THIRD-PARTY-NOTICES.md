# Pochodzenie kodu, fonty i licencje

## Notes i edytor z POC

Notes i edytor są w pakiecie `packages/score-pad`.
Źródłem TypeScript jest `bielski-piotr/digital-scorepad-poc`, commit
`e6b7dd29c05ca63c0b0dae5f3eceb1db8037cf10`, katalog `example/score-pad/score-pad/src`.
Repo `digital-scorepad-editor-poc`, commit `7e6d3792686b6a6228fc168b7d4f201ff632bd56`,
zawiera zbudowany kod, nie jest drugim źródłem importu.

Sprawdzenie drzew tych commitów 2026-11-16 nie znalazło plików LICENSE, COPYING ani NOTICE.
Oba repozytoria są prywatne i mają tego samego właściciela GitHub co BG Club.
Jest to dowód pochodzenia importu, **nie dowód kompletu praw autorskich**.
Nie nadano tutaj licencji open source kodowi POC ani całemu BG Club. Przed publiczną
redystrybucją właściciel powinien udokumentować autorstwo/uprawnienia i wybrać licencję.
Ta praca nie deklaruje brakujących praw jako zweryfikowanych i nie zmienia widoczności repo.

## Fonty i Three.js

Fonty są hostowane z aplikacją, bez Google Fonts ani jsDelivr. Nie modyfikujemy plików fontów.
Poniżej pakiety faktycznie importowane w `apps/web/src/main.tsx` i `packages/score-pad/src/fonts.ts`.
Pełne teksty licencji z zachowanymi copyrightami są kopiami z zainstalowanych wersji lockfile.
Vite kopiuje je z `apps/web/public/licenses` do `/licenses/` w każdym buildzie.

| Pakiet                                     | Wersja sprawdzona | Licencja / tekst dołączony do dystrybucji                              |
| ------------------------------------------ | ----------------- | ---------------------------------------------------------------------- |
| `@fontsource-variable/bricolage-grotesque` | 5.3.0             | SIL OFL 1.1, [tekst](apps/web/public/licenses/bricolage-grotesque.txt) |
| `@fontsource-variable/instrument-sans`     | 5.3.0             | SIL OFL 1.1, [tekst](apps/web/public/licenses/instrument-sans.txt)     |
| `@fontsource/dm-mono`                      | 5.3.0             | SIL OFL 1.1, [tekst](apps/web/public/licenses/dm-mono.txt)             |
| `@fontsource/caveat`                       | 5.3.0             | SIL OFL 1.1, [tekst](apps/web/public/licenses/caveat.txt)              |
| `@fontsource/alegreya-sc`                  | 5.3.0             | SIL OFL 1.1, [tekst](apps/web/public/licenses/alegreya-sc.txt)         |
| `@fontsource/archivo-narrow`               | 5.3.0             | SIL OFL 1.1, [tekst](apps/web/public/licenses/archivo-narrow.txt)      |
| `three`                                    | 0.149.0           | MIT, [tekst](apps/web/public/licenses/three.txt)                       |

Przy aktualizacji wersji porównaj licencje z nowymi paczkami i zaktualizuj te kopie.
Nie usuwaj tekstów OFL/copyright z dystrybucji fontów. Powyższy wykaz dotyczy importu POC,
fontów i Three.js; pozostałe zależności zachowują własne licencje z paczek npm.
Prawa do przyszłych zdjęć planszówek, okładek, logo i awatarów zapewnia operator klubu;
ich sprawdzenie nie zostało wykonane na nieistniejących jeszcze danych produkcyjnych.
