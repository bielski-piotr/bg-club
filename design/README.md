# Źródła projektów UI

Stan zweryfikowany 2026-11-12 podczas zadania [#4](https://github.com/bielski-piotr/bg-club/issues/4).

Źródłem opisanych projektów jest plik Paper `bg-club`, file id `01M75APESFSP8980YWVTY0EAXT`. Identyfikatory stron i artboardów zapisano w [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md), §1. Specyfikacja w tym pliku jest dostępną w repo podstawą implementacji.

| Materiał | Stan w repo | Docelowa lokalizacja |
|---|---|---|
| Eksporty JSX komponentów, w tym `jsx-h-components.txt` | Brak w śledzonych plikach bieżącej rewizji. | `design/reference-jsx/` |
| Generator Spotkań i HTML | Brak. | `design/meetings/_build.mjs`, `manifest.json`, `_PAPER-INSTRUCTIONS.md`, wygenerowane HTML |
| Generator kalendarza i timeline | Brak. | `design/calendar/_build.mjs` i wyniki generowania |
| Generator hubu | Brak. | `design/hub/_build.mjs` i wyniki generowania |
| Generator edytora | Brak. | `design/editor/_build.mjs` i wyniki generowania |

Nie odnaleziono tych materiałów także w lokalnym głównym checkoutcie `bg-club`, katalogu repozytoriów POC ani w sprawdzonych katalogach Documents i Downloads. Nie ustalono lokalizacji oryginalnych generatorów. Nie ma podstaw, by traktować ścieżki przytoczone w DS jako istniejące pliki lub działające polecenia. Nie zastępujemy ich pustymi generatorami ani odtworzonym kodem opisanym jako oryginał.

Eksporty należy pozyskać z wymienionego pliku Paper przy realizacji komponentów w [#9](https://github.com/bielski-piotr/bg-club/issues/9). Zapisywać je w `design/reference-jsx/` wraz z file id, stroną, artboardem i datą odczytu. Jeśli oryginalne generatory zostaną odzyskane, trafią do powyższych katalogów z opisem pochodzenia i poleceniem budowania. Jeśli będą odtwarzane, oznaczyć je jako nowe implementacje na podstawie DS, a nie odzyskane źródła. Brak generatorów nie blokuje budowania UI z DS.

Projekty opisują motyw jasny. Ciemny oraz odbiór na szerokości 360 px, desktopie i z polskimi komunikatami pozostają wymaganiami #9 i kolejnych zadań UI. Pierwszeństwo rozbieżnych zapisów ustala [decyzja 001](../docs/decisions/001-project-foundations.md).
