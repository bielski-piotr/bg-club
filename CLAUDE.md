# CLAUDE.md

Wskazówki dla agentów pracujących w tym repozytorium (Boardgame Club, `bg-club`).

## Projekt w skrócie

- Monorepo pnpm: `apps/web` (aplikacja Solid 2.0 + Vite, PWA), `packages/accounts`, `packages/score-pad`, `packages/scoring`, `supabase/` (migracje SQL, Edge Functions w Deno), `scripts/backup`.
- Frontend: `solid-js` 2.x i `@solidjs/web`, dane przez `@tanstack/query-core` opakowane w `apps/web/src/lib/query.ts` (`createQuery` jako async memo), backend Supabase.
- Weryfikacja przed zakończeniem pracy: `pnpm check` (typecheck + lint z `--max-warnings 0` + prettier + build). CI uruchamia to samo, plus `deno lint`/`deno check` dla funkcji i `supabase db lint`.
- Kod źródłowy i komentarze piszemy po angielsku (identyfikatory, komentarze, JSDoc, komunikaty w logach i wyjątkach). Po polsku są tylko teksty widoczne dla użytkownika, wyłącznie przez `t` z `apps/web/src/i18n` (`format`, `plural`), nigdy na sztywno w JSX.
- Komponenty bazowe bierz z `apps/web/src/ui` (barrel `../ui`), zanim napiszesz własne.

## Git: branche i commity

- Nazwy branchy po angielsku, krótkie (2–4 słowa w kebab-case), z prefiksem zależnym od rodzaju zmiany:
  - `feature/` — nowa funkcjonalność lub rozbudowa istniejącej, np. `feature/meeting-reminders`;
  - `bugfix/` — naprawa błędu, np. `bugfix/leaderboard-ties`.
- Commit message po angielsku: krótkie (do ~60 znaków), opisowe, w trybie rozkazującym, bez kropki na końcu, np. `Add date filter to leaderboard`, `Fix tie order in game ranking`. Opisz, co zmiana daje, a nie „update files” czy „fixes”.
- Jeden commit to jedna spójna zmiana. Szczegóły i uzasadnienie, jeśli są potrzebne, w treści commita po pustej linii.
- **Operacje git wykonuje Sonnet 5.5.** Tworzenie i nazywanie branchy, commity wraz z treścią commit message, push i tworzenie PR zlecaj subagentowi narzędziem Agent z `model: "sonnet"`. Przekaż mu: rodzaj zmiany (feature czy bugfix), krótki opis tego, co zostało zrobione, listę plików do commita i zasady z tej sekcji. Główny agent nie wykonuje tych operacji sam; po zakończeniu sprawdza wynik (`git log`, `git status`) i raportuje go użytkownikowi.

## Skille Solid 2.0 — kiedy i jak z nich korzystać

Solid 2.0 różni się od Solid 1.x i od Reacta; dopasowywanie wzorców z nich to główne źródło błędów. W `.claude/skills/` są trzy skille — ładuj je narzędziem Skill (`solid-2.0`, `solid-2.0-cheatsheet`, `reactivity-diagnostics`).

| Sytuacja                                                                                                                                                                                                                         | Skill                    | Jak                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zanim napiszesz, zrecenzujesz lub przerobisz jakikolwiek kod Solid (komponent, hook, store, akcja)                                                                                                                               | `solid-2.0`              | Załaduj raz na początku zadania. Krótki primer: trzy główne zasady, tabela 1.x → 2.0, prymitywy.                                                               |
| Nie znasz dokładnej sygnatury lub formy API (opcje `createMemo`, `createProjection`, `<For keyed>`, `<Loading on>`, `merge`/`omit`, refy, atrybuty, typy komponentów) albo używasz nazwy, której nie widziałeś w kodzie projektu | `solid-2.0-cheatsheet`   | Sprawdź przed użyciem; nie zgaduj API z pamięci. Sekcja „What changed from 1.x” zawiera pełną listę usuniętych API i ich zamienników.                          |
| W konsoli, w wyniku builda lub w zgłoszeniu pojawia się kod `[CODE]` (np. `STRICT_READ_UNTRACKED`, `REACTIVE_WRITE_IN_OWNED_SCOPE`, `ASYNC_OUTSIDE_LOADING_BOUNDARY`, `UNCOMMITTED_INPUT_OVERWRITTEN`, `HOT_SCOPE_*`)            | `reactivity-diagnostics` | Znajdź sekcję o nazwie kodu i zastosuj opisaną naprawę przyczyny. Nigdy nie wyciszaj diagnostyki (`untrack`, `ownedWrite` bez uzasadnienia, `eslint-disable`). |

Gdy wzorzec w istniejącym kodzie projektu jest sprzeczny ze skillem, ufaj skillowi i zgłoś niezgodność użytkownikowi, zamiast ją kopiować.

## Zasady pisania kodu w Solid 2.0

### Importy i konfiguracja

- Wszystkie prymitywy (także `createStore`, `createProjection`, `action`, `Loading`, `Errored`) importuj z `solid-js`. API DOM (`render`, `Portal`, `Dynamic`, `dynamic`) z `@solidjs/web`. Ścieżki `solid-js/web`, `solid-js/store` nie istnieją.
- Importy typów przez `import type` / `type X` (wymaga tego ESLint).

### Komponenty i propsy

- Komponent to funkcja wykonywana **raz**. Nie ma ponownego renderowania: reaktywne są tylko odczyty w JSX, memo i obliczeniach efektów.
- **Nie destrukturyzuj propsów.** Czytaj `props.x` w miejscu użycia. Do domyślnych wartości i podziału używaj `merge` i `omit` (nie `mergeProps`/`splitProps`).
- **Przekazuj wartości, nie akcesory:** `<Counter value={count()} />`, a nie `value={count}`. Getter przekazuj tylko świadomie (render props), z nazwą, która to mówi.
- Typuj propsy jawnie i jako `readonly` (`props: { readonly me: Profile }`); używaj `Component`, `ParentComponent`, `VoidComponent`, `FlowComponent` tam, gdzie to coś daje.
- **Brak reaktywnych odczytów na górze ciała komponentu** (`const name = props.name` zamraża wartość — `STRICT_READ_UNTRACKED`). Wartość pochodną zapisz jako funkcję (`const isAdmin = () => props.me.role === 'admin'`) lub `createMemo`. Lokalny stan inicjowany z propsa: `createSignal(() => props.initial)`.
- Hooki i adaptery przyjmują **akcesory** (`createQuery(() => options)`, `useThing(() => props.id)`) i czytają je we własnych memo/efektach.
- `children(() => props.children)` tylko gdy musisz rozwiązać dzieci (np. policzyć je); w innym wypadku wstaw `{props.children}`.

### Stan i wartości pochodne

- Kolejność wyboru: zwykła funkcja (tani odczyt) → `createMemo` (kosztowne lub współdzielone obliczenie, potrzebna równość) → `createSignal` → `createStore` (zagnieżdżone obiekty i listy).
- Nie duplikuj stanu, który da się wyliczyć. Nie synchronizuj sygnałów efektem — to jest memo (`EFFECT_WRITES_OWN_SOURCE`).
- Zapis do store'a **wyłącznie przez draft**: `setStore(s => { s.user.name = 'B'; })`. Bez ścieżek (`setStore('user', 'name', …)`), bez `produce`, bez kopiowania całych obiektów spreadem (`IMMUTABLE_UPDATE_IN_STORE`).
- Kopia do serializacji: `snapshot(store)`. Odczyt pochodny ze store'a z kluczowaniem: `createProjection` (zamiast `createSelector`).
- **Odczyt jest opóźniony względem zapisu:** po `setX(1)` funkcja `x()` zwraca starą wartość do końca mikrozadania lub `flush()`. Nie licz na nowy odczyt w tej samej funkcji — użyj wartości, którą właśnie zapisałeś.
- Stan aplikacyjny trzymaj w kontekście tworzonym w providerze, nie w zmiennych modułu (moduł tylko na stałe i `createContext`).

### Efekty i cykl życia

- `createEffect` ma **dwie funkcje**: obliczenie (śledzi zależności, bez skutków ubocznych) i zastosowanie (skutki uboczne, nie śledzi, może zwrócić cleanup): `createEffect(() => count(), (v) => { el.title = String(v); })`.
- Efekt służy do synchronizacji ze światem zewnętrznym (DOM, API przeglądarki, biblioteki). Nie używaj go do liczenia stanu ani do reagowania na akcje użytkownika — to robi handler zdarzenia lub akcja.
- Efekty nie porównują wartości: by pominąć powtórzenie dla tej samej wartości, czytaj w obliczeniu memo.
- Pominięcie pierwszego uruchomienia: `{ defer: true }`. Zamiast `on(...)` — dwuczęściowy efekt.
- Konfiguracja i sprzątanie na poziomie komponentu: `onSettled(() => { setup(); return cleanup; })` (zamiast `onMount` + `onCleanup`). `onCleanup` tylko wewnątrz obliczeń i własnych prymitywów (jak w `lib/query.ts`).
- Praca zależna od layoutu (pomiary, focus, observery) w `onSettled` — ref działa przed podpięciem elementu do dokumentu.
- **Żadnych zapisów do sygnałów i store'ów w memo, obliczeniu efektu ani ciele komponentu.** Zapisuj w handlerach zdarzeń, `onSettled`, akcjach i funkcji `apply` efektu. `untrack` nie zwalnia z tej zasady.
- Zapis, który ma wylądować natychmiast, niezależnie od trwającej pracy asynchronicznej (np. zamknięcie menu przed nawigacją): `onFlush(() => setOpen(false))` w handlerze. Nie `setTimeout` ani `queueMicrotask`.
- `batch` nie istnieje i nie jest potrzebny — aktualizacje są grupowane per mikrozadanie.

### Asynchroniczność, dane i mutacje

- Dane asynchroniczne to memo zwracające Promise (w projekcie: `createQuery` z `lib/query.ts`). Każdy taki odczyt musi być pod granicą `<Loading>` (w projekcie zwykle `QueryBoundary` z `popups/QueryStatus.tsx`), błędy pod `<Errored fallback={(err, reset) => …}>`.
- Nie ma `createResource`, `.loading`, `.error`, `<Suspense>`, `<ErrorBoundary>`. Stan „odświeżania” sprawdzaj przez `isPending(() => data())`, podgląd wartości w toku przez `latest(x)`.
- `<Loading on={key()}>` gdy zmiana klucza ma ponownie pokazać zastępnik; bez `on` poprzednia wartość zostaje na ekranie.
- Mutacje jako `action(function* (...) { ...; yield api(); ...; })`. Wskaźnik „zapisywanie…” to współzapisywana flaga `createOptimistic(false)`, nie `isPending`. Zapisy optymistyczne (`createOptimistic`, `createOptimisticStore`) wracają automatycznie po zakończeniu przejścia.
- Po zapisie na serwerze odśwież źródło: w projekcie `queryClient.setQueryData` / `invalidateQueries` z kluczami z plików `*Data.ts`; dla zwykłych async memo `refresh(x)` (z `affects(x)`, jeśli przeładowanie ma być widoczne jako oczekujące).
- Nie wywołuj akcji w ciele komponentu ani w obliczeniach (`ACTION_CALLED_IN_OWNED_SCOPE`).
- Nie przechowuj w cache'u żyjącym dłużej niż obliczenie obietnic ani `import()` utworzonych w tym obliczeniu — cache'uj rozwiązane wartości.
- Unikaj wodospadów: niezależne zapytania startuj równolegle, nie w zagnieżdżonych granicach, gdzie jedno czeka na drugie.

### Przepływ sterowania i listy

- `<Show>`, `<Switch>/<Match>`, `<For>`, `<Repeat>`, `<Dynamic>` zamiast `&&`, operatora trójargumentowego z JSX-em czy `.map()` w szablonie (proste teksty mogą zostać wyrażeniem).
- `<For each={xs}>`: domyślnie element surowy i indeks jako akcesor. `keyed={false}` (zamiast `<Index>`): element jako akcesor, indeks jako liczba. Dla danych z bazy kluczuj po identyfikatorze: `keyed={(m) => m.id}` (element jest wtedy akcesorem).
- Callback `<For>`/`<Show>`/`<Match>` to właściciel, nie zakres śledzenia: akcesor czytaj w JSX lub memo, nie przypisuj go do zmiennej na górze callbacku.

### JSX i DOM

- Kontekst: `<Ctx value={v}>` (nie `.Provider`). Kontekst bez wartości domyślnej sam rzuca błąd przy braku providera — nie pisz wrapperów `useX` rzucających wyjątek. Kontekst opcjonalny: `createContext<T | null>(null)`.
- Klasy: `class={['base', props.class, { active: isActive() }]}`. Bez `classList`, bez sklejania stringów i `.filter(Boolean).join(' ')`.
- Atrybuty małymi literami (`tabindex`, `for`), handlery w camelCase (`onClick`). Brak `on:`, `attr:`, `bool:`, `use:` — dyrektywy to fabryki refów: `ref={[autofocus, tooltip(opts)]}`.
- `onClick={cond() ? a : b}` wiąże się raz — decyzję podejmuj wewnątrz stabilnego handlera.
- Pola formularzy: tekst wpisywany trzymaj w sygnale roboczym (`onInput`), zatwierdzaj w `onChange`/submit. Przy odrzucaniu znaków ustaw też `e.currentTarget.value`. Nie wiąż `value` z wartością zatwierdzoną, gdy wpisany tekst żyje tylko w DOM-ie.
- Dostępność: semantyczne elementy (`button`, `a`, `label`), etykiety dla ikon i kontrolek, poprawne zagnieżdżanie HTML.

### Ogólne dobre praktyki

- TypeScript w trybie strict; bez `any`, bez `!` i rzutowań tam, gdzie można zawęzić typ. Nieużywane argumenty z prefiksem `_`.
- Logikę domenową (obliczenia, walidacja, formatowanie) trzymaj w czystych funkcjach w plikach `.ts` (`board.ts`, `form.ts`, `packages/scoring`), a komponenty `.tsx` niech łączą dane z widokiem.
- Małe, jednozadaniowe komponenty i funkcje; nazwy opisujące intencję; bez martwego kodu i zakomentowanych fragmentów.
- Obsługuj błędy jawnie: komunikat dla użytkownika przez `t` i toast/baner, bez połykania wyjątków.
- Nie dodawaj zależności bez potrzeby; pilnuj rozmiaru paczki (`scripts/check-bundle.mjs` w buildzie), ciężkie widoki ładuj przez `lazy`.
- Trzymaj się istniejących konwencji katalogów (`<domena>/<Komponent>.tsx`, `<domena>Data.ts` z zapytaniami, `<domena>.css`).

## Wydajność i zużycie zasobów

Solid aktualizuje tylko te miejsca w DOM-ie, które czytają zmienioną wartość. Najszybszy kod to taki, w którym każda zmiana budzi jak najmniej obliczeń. Zasady poniżej stosuj od razu przy pisaniu kodu, nie dopiero przy optymalizacji.

### Precyzyjne zależności

- **Czytaj możliwie wąski wycinek danych.** W store'ach czytaj konkretne pole (`user.name`): śledzenie jest na poziomie właściwości. Z sygnału przechowującego obiekt wyciągnij potrzebne pole memo (`createMemo(() => user().name)`) i czytaj to memo.
- Odczyt umieszczaj jak najbliżej miejsca użycia (w JSX, w danym atrybucie), a nie w obliczeniu na poziomie rodzica, które przekazuje gotowe wyniki w dół. Duże obliczenie zależne od wielu źródeł podziel na mniejsze memo, każde śledzące tylko to, czego potrzebuje (`WIDE_SCOPE_DEPS`, `HUGE_FAN_IN`).
- `createMemo` stosuj tam, gdzie wynik jest kosztowny albo czyta go kilku odbiorców. Tani odczyt (`() => props.a + 1`) zostaw jako zwykłą funkcję: memo też ma koszt.
- Memo zwracające obiekt lub tablicę: zwracaj stabilne referencje albo podaj `equals`, inaczej każdy odbiorca uruchamia się przy każdej zmianie wejścia (`UNSTABLE_MEMO_OUTPUT`). Nie dodawaj `equals` do obliczenia, którego bramka i tak się zamyka; zatrzymaj powiadomienie u źródła (`WASTED_RECOMPUTE`).
- Wartość zmieniającą się bardzo często (scroll, wskaźnik, `requestAnimationFrame`, timer) odgrodź wolniejszą wartością pochodną (memo z bramką równości) i nie wpuszczaj jej do dużych zakresów (`HOT_SCOPE_RERUNS`). Obsługę takich zdarzeń, która nie zmienia UI, trzymaj poza grafem reaktywnym (zwykła zmienna, bezpośredni zapis do DOM-u w handlerze).
- `deep(store)` tylko wtedy, gdy efekt naprawdę musi reagować na dowolną zagnieżdżoną zmianę (np. zapis do `localStorage`).

### Listy i zaznaczenie

- Listy z danych z bazy zawsze kluczuj stabilnym identyfikatorem (`<For keyed={(x) => x.id}>`), żeby ponowne pobranie nie przebudowywało wierszy, DOM-u i stanu (`UNSTABLE_LIST_IDENTITY`).
- Zaznaczenie lub stan „per wiersz” trzymaj jako mapę po id (store lub `createProjection`), a nie porównanie `row.id === selectedId()` w każdym wierszu. Wtedy zmiana budzi tylko dwa wiersze zamiast wszystkich (`HUGE_FAN_OUT`).
- W store'ach mutuj draft (`push`, `splice`, przypisanie pola), zamiast podmieniać kontener spreadem lub `filter` (`IMMUTABLE_UPDATE_IN_STORE`). Dane z zewnątrz dla tych samych rekordów scalaj przez `reconcile(data, 'id')`.
- Długie listy pokazuj porcjami (`ShowMore`, paginacja w zapytaniu), zamiast renderować wszystko naraz.

### Efekty i graf reaktywny

- Każdy efekt i każde memo to koszt pamięci i pracy przy każdej zmianie. Nie twórz efektów do kopiowania stanu (`EFFECT_RELAY_TEAR`, `EFFECT_WRITES_OWN_SOURCE`): wartość wyliczalna to memo albo zwykła funkcja.
- Prymitywy twórz pod właścicielem (komponent, `onSettled`), żeby znikały razem z widokiem. Nasłuchiwacze, observery, timery i subskrypcje zawsze z cleanupem. Nie zostawiaj `createRoot` bez wywołania disposera (`GRAPH_GROWTH`).
- Cache'e trzymające dane po kluczu muszą mieć limit lub wygaszanie (w projekcie `gcTime` query-core); nie trzymaj referencji do dużych obiektów (zdjęcia, blob-y, `ObjectURL`) dłużej, niż ich potrzebujesz, a `URL.createObjectURL` zawsze paruj z `revokeObjectURL`.

### Dane i sieć

- Unikaj wodospadów: niezależne zapytania startuj równolegle, czytając wszystkie źródła asynchroniczne w zakresie, zanim użyjesz któregokolwiek (`ASYNC_WATERFALL`). Dane potrzebne po interakcji pobieraj z wyprzedzeniem (`prefetchQuery`, prefetch przy hover lub otwieraniu popupu).
- Korzystaj z cache'u query-core: po mutacji aktualizuj dane przez `setQueryData` zamiast pobierać wszystko od nowa, a `invalidateQueries` zawężaj do kluczy, których zmiana dotyczy. Pobieraj z Supabase tylko potrzebne kolumny i wiersze (`select` z listą kolumn, filtry i limity po stronie bazy).
- Dla kosztownych widoków zależnych od filtrów używaj `createDeferred`, żeby poprzedni wynik został na ekranie podczas przeliczania, zamiast migać zastępnikiem.

### Rozmiar paczki i renderowanie

- Ciężkie widoki, popupy i biblioteki ładuj przez `lazy` lub dynamiczny `import()`; nie importuj ich w ścieżce startowej. Pilnuj limitu w `scripts/check-bundle.mjs`.
- Importuj konkretne funkcje, nie całe przestrzenie nazw, i nie dodawaj zależności do rzeczy, które da się napisać w kilku linijkach lub dostać z platformy.
- Granice `<Loading>` umieszczaj blisko danych, których dotyczą, żeby reszta widoku renderowała się od razu. Nie owijaj całych ekranów jedną granicą.
- Obrazy skaluj przed wysłaniem i serwuj w rozmiarze, w jakim są wyświetlane (jak `scaleImage` w projekcie). Animacje opieraj na `transform` i `opacity` w CSS, nie na reaktywnych zapisach stylów w każdej klatce.

### Pomiar zamiast zgadywania

- Optymalizuj na podstawie pomiaru (DevTools Performance i Memory, diagnostyka Solid z `@solidjs/diagnostics`). Kody z grupy „Performance pathologies” i „Responsiveness” w skillu `reactivity-diagnostics` opisują przyczynę i naprawę.
- Optymalizacja nie może zmieniać działania biznesowego ani pogarszać czytelności bez zmierzonego zysku.

## Minimalny kod

- Każde rozwiązanie realizuj **najmniejszą ilością kodu**, która w pełni spełnia wymaganie, nie zmienia działania biznesowego aplikacji, nie wprowadza regresji i nie łamie zasad z tego pliku. Mniej kodu nie może oznaczać gorszej czytelności, typów, obsługi błędów ani dostępności.
- Nie pisz kodu „na zapas”: bez nieużywanych parametrów, opcji, abstrakcji, warstw pośrednich, wrapperów i uogólnień dla przypadków, których dziś nie ma.
- Zanim dopiszesz coś nowego, sprawdź, czy da się użyć istniejącej funkcji, komponentu z `ui`, helpera lub mechanizmu Solid albo query-core. Nie duplikuj logiki.
- Nie dodawaj obsługi sytuacji, które nie mogą wystąpić (gwarantują je typy, baza danych lub framework). Walidacja i obsługa błędów są potrzebne na granicach: dane z sieci, od użytkownika, z plików.
- Zmieniaj tylko to, czego wymaga zadanie. Bez refaktorów, przemianowań i zmian formatowania przy okazji, chyba że użytkownik o nie poprosi.
- Usuwaj kod, który twoja zmiana uczyniła zbędnym (nieużywane importy, funkcje, style, klucze i18n).

## Komentarze

- Dodawaj komentarz tylko wtedy, gdy wnosi informację, której nie widać z kodu: **dlaczego** coś jest zrobione tak, a nie inaczej, nieoczywiste ograniczenie, obejście błędu biblioteki, wymóg biznesowy, pułapkę reaktywności.
- Nie komentuj tego, **co** robi kod. Gdy kod wymaga objaśnienia, najpierw popraw nazwy lub strukturę.
- Bez komentarzy powtarzających nazwę funkcji lub typ, bez opisów zmian („added X”, „fixed Y”: to jest w historii gita), bez zakomentowanego kodu i bez TODO bez uzasadnienia.
- JSDoc tylko dla eksportowanych funkcji i komponentów, gdy kontrakt nie wynika z sygnatury (np. kiedy akcesor jest w toku, co znaczy `null`).
- Komentarze piszemy po angielsku, zwięźle, pełnymi zdaniami. Istniejące polskie komentarze tłumacz lub usuwaj tylko w kodzie, który i tak zmieniasz; nie rób osobnych zmian wyłącznie w celu tłumaczenia.

## Testy

- Testami pokrywaj **tylko rzeczywiste przypadki chroniące przed regresją**: kluczowe ścieżki użytkownika, logikę biznesową, której błąd byłby kosztowny (punktacja, ranking, zapis rozgrywki, uprawnienia), oraz naprawione błędy (test odtwarzający zgłoszony błąd).
- **Nie pisz testów dla każdego przypadku brzegowego**, trywialnych getterów, prostego renderowania ani zachowań gwarantowanych przez framework lub TypeScript. Jeden test sprawdzający zachowanie jest lepszy niż kilka sprawdzających szczegóły implementacji.
- Test ma sprawdzać obserwowalne zachowanie, nie strukturę wewnętrzną; nie może być kruchy na refaktor.
- W testach kodu reaktywnego wywołuj `flush()` przed asercją (odczyty są opóźnione względem zapisów).
- Nie dodawaj testów „na zapas” przy każdej zmianie — dodaj test, gdy chroni przed realnym ryzykiem regresji, i krótko uzasadnij to w opisie zmiany.
