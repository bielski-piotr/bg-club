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
- **Ochrona przed uszkodzonym plikiem:** `SEAT_SANITY_LIMIT = 200` odrzuca notes z absurdalną liczbą miejsc (np. `players: 100000000` zamroziłoby kartę). To nie jest limit produktu: żaden notes nie ma tylu miejsc.
- **Sprzątanie po zamknięciu.** `destroy()` notesu zwalnia kontekst WebGL (`forceContextLoss`), zamyka kontekst audio i odpina nasłuch fontów, a notes zamknięty w trakcie wczytywania nie rejestruje się już jako gotowy. `<score-pad-editor>` po usunięciu ze strony odpina nasłuch wklejania i obserwatora rozmiaru. W POC elementy nie były wielokrotnie montowane, w aplikacji są (popupy).
- **Tryb klubowy (PAD-1)**: opcja `club` (`ScorePadOptions`, atrybut `club`). Notes:
  - nie otwiera IndexedDB (`TemplateStore(ns, false)` trzyma szablony w pamięci) i nie czyta ani nie zapisuje stanu kartek i historii w `localStorage`;
  - nie prowadzi historii partii (licznik i lista „Zapisane partie” znikają) i nie pokazuje „Usuń ten notes”;
  - domyślnie nie dołącza notesów wbudowanych (Generał, Kolonie);
  - nadal wczytuje pliki notesu v2 (`config`, „Wczytaj notes z pliku…”, `importConfig`), ale tylko do pamięci osadzenia.
- **Motyw**: atrybut `theme="light|dark"` na `<score-pad>` (kolor otoczenia stołu i winieta; nakładki notesu zostają ciemne, bo leżą na stole) i na `<score-pad-editor>` (był w POC).
- **Opcje obiektem**: `element.options` (notes) i `element.template` (edytor) ustawione przed dołączeniem elementu do strony mają pierwszeństwo przed atrybutami. Atrybuty `controls`, `help`, `sound` i `builtins` bez wartości nie nadpisują już domyślnych.
- **Reguła miejsc (EDT-7, zadanie [014])**: `PadTemplate.ranking` (kategoria decydująca, kierunek, remisy). `validateTemplate` zachowuje poprawną regułę i pomija błędną, edytor przenosi regułę wczytanego notesu do eksportu. Sumy (`computePlayer`, `effectiveOf`, `finalTotalIndex`) liczy `@bg-club/scoring`; suma na cyklu jest pusta. Zwycięzca zakreślony na kartce i `winners` w `scorepad:save` to wszyscy gracze na 1. miejscu według reguły notesu.
- **Tryb kreatora edytora (EDT-9, zadanie [016])**: `element.wizard = true` przed dołączeniem do strony. Edytor nie pokazuje wtedy własnego paska kroków, przycisków nawigacji ani pola zdjęcia i nie słucha wklejania; kroki prowadzi aplikacja: `loadPhoto(blob)`, `loadTemplate(template)` (import `.json`), `goStep(1|2|3)` i `status()` (`ScorePadEditorStatus`: zdjęcie, obszar, problem pól, kartka, miejsca, kategorie, `dirty`). Zmiany stanu, najwyżej raz na klatkę, idą w zdarzeniu `scorepad-editor:change`. Zły plik w tym trybie odrzuca obietnicę (`reason: 'type' | 'image'`) zamiast pokazywać komunikat w edytorze. Esc obsłużony przez edytor (przeciąganie punktu obszaru, zaznaczenie pól) ma `preventDefault`, więc nie zamyka popupu.
- **Obszar kartki (EDT-10, zadanie [017])**: krok 2 (w samodzielnym edytorze „Obszar”) zamiast czterech narożników i różdżki z lassem ma obszar jako wielokąt na zdjęciu (`editor/area.ts`): wykrycie automatyczne z nieregularnym kształtem (`detectArea` w `editor/shape-tools.ts`, także w `ScorePadEditor.tools`), całe zdjęcie albo punkty ustawiane ręcznie (przeciąganie z lupą, wstawianie na krawędzi, usuwanie dwuklikiem, przytrzymaniem albo Delete, strzałki), cztery narożniki do prostowania wyznaczone z obszaru, wygładzanie Chaikina 0–10 i cofanie. Różdżka, lasso, `wandRegion`, `paintPoly`, `paintBox` i rastrowe `smoothShape` są usunięte, a `findOnPlainBackground` zwraca czworokąt opisany na kartce (nie wpisany), więc zaokrąglone rogi nie przesuwają narożników. W trybie kreatora krok 2 nie ma paska ani panelu edytora: ustawienia są w `status().settings` (`ScorePadEditorArea`), a zmienia je aplikacja przez `setArea(patch)`, `rotatePhoto(dir)` i `undoArea()`. Domyślny kolor grzbietu nowego notesu to #161A2B (DS §18).
- **Mapowanie pól (EDT-11, zadanie [018])**: krok 3 ma dwa wykluczające się tryby (`MappingMode`): `table` (notes z `grid`, bez pól dowolnych) i `rects` (notes bez `grid`, z `players` i `fields`). Zamiast trybów „Tabela” i „Pola dowolne” z POC, które się mieszały. Pierwsze wejście w krok wybiera tabelę, gdy `detectLines` znajdzie wyraźną tabelę, a inaczej prostokąty. Zmiana trybu kasuje pola i kategorie (samodzielny edytor pyta `confirm`, w kreatorze pyta aplikacja). W prostokątach pierwsze pole kategorii ją tworzy, po polu edytor przechodzi do następnej brakującej kategorii tego miejsca, a „Powiel dla następnego miejsca” kopiuje pola miejsca z wyuczonym przesunięciem. Cofanie (Ctrl+Z, 60 kroków) obejmuje całe mapowanie. Widok kartki w kroku 3 można powiększać (szczypanie, Ctrl + kółko, + / − / 0). W trybie kreatora krok 3 nie ma paska ani panelu edytora: stan jest w `status().mapping` (`ScorePadEditorMapping`), a zmiany idą przez `editMapping(action)`. Starszy notes z tabelą i polami dowolnymi zachowuje pola, dopóki tryb się nie zmieni.
- **Pełna jakość obrazu (EDT-12)**: `MAX_SHEET_SIDE = 4096` zamiast `MAX_SRC = 2400` i kartki 1600 px. Kartka ma rozdzielczość obszaru na zdjęciu źródłowym (`sheetSize`, bez powiększania), a zapis (`encodeSheet`, `Editor.sheetImage()`) to WebP albo JPEG o jakości 0,92 (zamiast JPEG 0,86), zmniejszany tylko wtedy, gdy plik przekroczyłby 4,5 MB. Piksele zdjęcia źródłowego są czytane raz na płótno (`pixelsOf`). Tekstura notesu (PAD-16, `core/print.ts`) to osobne zadanie.
- **Zdarzenie `scorepad:save`** ma dodatkowo `sheet`: pełne wpisy z oderwanej kartki (format `sheet` z pliku notesu). Pełny wynik z miejscami (PAD-7) dojdzie w późniejszych zadaniach.
- Kod sformatowany Prettierem i poprawiony pod ESLint repozytorium (`import type`, kilka drobnych reguł), bez zmian zachowania.

## Użycie w aplikacji

```ts
import type { ScorePadFile } from '@bg-club/score-pad'; // lekkie typy i stałe
await import('@bg-club/score-pad/pad'); // rejestruje <score-pad> (osobny chunk z Three.js)
await import('@bg-club/score-pad/editor'); // rejestruje <score-pad-editor>
const { readTemplate, readScorePadFile } = await import('@bg-club/score-pad/template'); // walidacja pliku notesu
```

`@bg-club/score-pad/template` (zadanie [015]) sprawdza szablon albo plik notesu v2 przed zapisem w bazie: format v2, kształt (`validateTemplate`), kategorie i regułę miejsc (`validateScoring`, błędna reguła odrzuca szablon zamiast po cichu go naprawiać) oraz zwraca liczbę miejsc dla graczy (`playerCount`). Moduł ładuje kod modelu notesu, więc aplikacja pobiera go leniwie.

Aplikacja osadza elementy przez adaptery React w `apps/web/src/score-pad/` (`ScorePadView`, `ScorePadEditorView`): leniwe ładowanie (NFR-2), tryb klubowy, motyw aplikacji, zdarzenia jako propsy i usunięcie elementu przy zamknięciu (wywołuje `destroy()`). Podgląd: galeria `/design-system`, sekcja „Notes i edytor” (przykładowy notes z 10 miejscami).

## Typy

Źródła POC kompilują się w `tsconfig.json` pakietu bez `noUncheckedIndexedAccess` i `exactOptionalPropertyTypes` (pisane bez nich, przeniesione bez przepisywania). Aplikacja ich nie kompiluje: widzi tylko `src/index.ts` (publiczne typy) i `src/register.d.ts` (deklaracje modułów `./pad` i `./editor`, warunek `types` w `exports`). `src/contract.ts` sprawdza przy `pnpm typecheck`, że publiczne typy zgadzają się z implementacją.

## Testy

`pnpm --filter @bg-club/score-pad test` (Vitest, jsdom): notesy z ponad ośmioma miejscami (tabela i pola dowolne), odczyt i zapis pliku v2 z kartką dla 10 graczy, wbudowane notesy przez JSON, tryb klubowy bez IndexedDB i `localStorage`, opcje i motyw elementu, tryb kreatora edytora i ustawienia kroku 2 (`src/editor-wizard.test.ts`), geometria obszaru kartki i zapis kartki (`src/area.test.ts`), mapowanie pól (`src/mapping.test.ts`). Notes w przeglądarce (WebGL): `apps/web/e2e/score-pad.spec.ts`.
