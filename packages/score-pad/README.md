# @bg-club/score-pad

Web componenty `<score-pad>` (notes 3D) i `<score-pad-editor>` (edytor notesu) w trybie klubowym (PRD §5.5, §8.5).

## Pochodzenie kodu

| Źródło                        | Wersja / commit                                             | Co przeniesiono                                                                                                    |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `digital-scorepad-poc`        | POC 2.4.0, commit `e6b7dd2` (2026-11-03)                    | `example/score-pad/score-pad/src/core/` → `src/core/`, `src/editor/` → `src/editor/` (wszystkie pliki `.ts`)       |
| `digital-scorepad-editor-poc` | commit `7e6d379` (2026-11-03)                               | nic: zawiera tylko bundle identyczny bajt w bajt z `dist/score-pad-editor.js` z pierwszego repo (sprawdzone `cmp`) |
| Three.js                      | `three` 0.149.0 z npm (ta sama wersja r149 co CDN w POC)    | zależność npm, licencja MIT; typy `@types/three` 0.149.0 (MIT)                                                     |
| Fonty kartki                  | `@fontsource/caveat`, `alegreya-sc`, `archivo-narrow` 5.3.0 | zależności npm, licencja OFL-1.1; zastępują Google Fonts z POC                                                     |

Repozytoria POC nie mają pliku licencji. Należą do tego samego właściciela co BG Club, a kod jest przeniesiony zgodnie z PRD §8.5 (zadanie [013]).

Nie przeniesiono: `dist/`, `build.mjs` (esbuild, IIFE), stron pokazowych `demo.html` i `editor.html` ani `przyklad-osadzenia.html`. Bundlem jest Vite aplikacji.

## Zmiany względem POC

- **Three.js z npm.** Pliki używające `THREE` importują `three` (`import * as THREE from 'three'`), zamiast globalnego skryptu z jsDelivr. `ensureThree()` zostało dla zgodności API i nic nie pobiera.
- **Fonty z npm** (`src/fonts.ts`), bez żądań do Google Fonts (DS §4).
- **Brak limitu graczy (EDT-8).** Usunięte `MAX_PLAYERS = 8` z `core/util.ts` i jego użycia w `core/templates.ts` (`playerCount`, `validateTemplate`) oraz `editor/fields.ts` (wykrywanie tabeli, wczytanie notesu, przycisk „Gracze +”, zmiana osi graczy). Karteczka z wynikiem przewija listę graczy.
- **Tryb klubowy (PAD-1)**: opcja `club` (`ScorePadOptions`, atrybut `club`). Notes:
  - nie otwiera IndexedDB (`TemplateStore(ns, false)` trzyma szablony w pamięci) i nie czyta ani nie zapisuje stanu kartek i historii w `localStorage`;
  - nie prowadzi historii partii (licznik i lista „Zapisane partie” znikają) i nie pokazuje „Usuń ten notes”;
  - domyślnie nie dołącza notesów wbudowanych (Generał, Kolonie);
  - nadal wczytuje pliki notesu v2 (`config`, „Wczytaj notes z pliku…”, `importConfig`), ale tylko do pamięci osadzenia.
- **Motyw**: atrybut `theme="light|dark"` na `<score-pad>` (kolor otoczenia stołu i winieta; nakładki notesu zostają ciemne, bo leżą na stole) i na `<score-pad-editor>` (był w POC).
- **Opcje obiektem**: `element.options` (notes) i `element.template` (edytor) ustawione przed dołączeniem elementu do strony mają pierwszeństwo przed atrybutami. Atrybuty `controls`, `help`, `sound` i `builtins` bez wartości nie nadpisują już domyślnych.
- **Zdarzenie `scorepad:save`** ma dodatkowo `sheet`: pełne wpisy z oderwanej kartki (format `sheet` z pliku notesu). Pełny wynik z miejscami (PAD-7) dojdzie w późniejszych zadaniach.
- Kod sformatowany Prettierem i poprawiony pod ESLint repozytorium (`import type`, kilka drobnych reguł), bez zmian zachowania.

## Użycie w aplikacji

```ts
import type { ScorePadFile } from '@bg-club/score-pad'; // lekkie typy i stałe
await import('@bg-club/score-pad/pad'); // rejestruje <score-pad> (osobny chunk z Three.js)
await import('@bg-club/score-pad/editor'); // rejestruje <score-pad-editor>
```

Aplikacja osadza elementy przez adaptery React w `apps/web/src/score-pad/` (`ScorePadView`, `ScorePadEditorView`): leniwe ładowanie (NFR-2), tryb klubowy, motyw aplikacji, zdarzenia jako propsy i usunięcie elementu przy zamknięciu (wywołuje `destroy()`). Podgląd: galeria `/design-system`, sekcja „Notes i edytor” (przykładowy notes z 10 miejscami).

## Typy

Źródła POC kompilują się w `tsconfig.json` pakietu bez `noUncheckedIndexedAccess` i `exactOptionalPropertyTypes` (pisane bez nich, przeniesione bez przepisywania). Aplikacja ich nie kompiluje: widzi tylko `src/index.ts` (publiczne typy) i `src/register.d.ts` (deklaracje modułów `./pad` i `./editor`, warunek `types` w `exports`). `src/contract.ts` sprawdza przy `pnpm typecheck`, że publiczne typy zgadzają się z implementacją.

## Testy

`pnpm --filter @bg-club/score-pad test` (Vitest, jsdom): notesy z ponad ośmioma miejscami (tabela i pola dowolne), odczyt i zapis pliku v2 z kartką dla 10 graczy, wbudowane notesy przez JSON, tryb klubowy bez IndexedDB i `localStorage`, opcje i motyw elementu. Notes w przeglądarce (WebGL): `apps/web/e2e/score-pad.spec.ts`.
