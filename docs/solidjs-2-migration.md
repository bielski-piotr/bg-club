# Migracja na SolidJS 2.0

Plan przejścia `apps/web` z React 19 + TanStack Query na Solid 2.0 (`solid-js` 2.x, `@solidjs/web`).
Migrujemy **obszar za obszarem**: w jednym kroku widżet huba i wszystkie popupy, które do niego należą.
Po każdym kroku `pnpm check` i `pnpm test:e2e` przechodzą, a aplikacja jest wdrażalna.

Źródła prawdy o API (zawsze przed pisaniem kodu Solid):

- `.claude/skills/solid-2.0/SKILL.md` – trzy zasady i tabela poprawek 1.x → 2.0,
- `.claude/skills/solid-2.0-cheatsheet/SKILL.md` – dokładne sygnatury,
- `.claude/skills/reactivity-diagnostics/SKILL.md` – co znaczy kod `[CODE]` z konsoli dev i jak go naprawić.

Zasada: kod diagnostyki naprawiamy u przyczyny, nigdy go nie wyciszamy (`untrack` nie jest poprawką
`STRICT_READ_UNTRACKED`).

## Stan wyjściowy

- React 19 (`StrictMode`), `@tanstack/react-query` (54 importy), `@testing-library/react`, `eslint-plugin-react-hooks`.
- Pakiety `@bg-club/score-pad`, `scoring`, `accounts` nie zależą od Reacta (notes to custom elements + Three.js) – zostają bez zmian.
- Hub (`hub/Hub.tsx`) renderuje 5 widżetów z `hub/widgets.tsx` i stos popupów z adresu (`popups/PopupRouter`, `PopupHost`).
  Popupy są w leniwym fragmencie `hub/HubPopup.tsx` (switch po `route.kind`).
- Wspólne konteksty: `AuthContext` (client, signOut), `PopupContext` / `PopupLevelContext` / `PopupOpenersContext` / `PopupGuardsContext`, Toast, motyw.
- Style to zwykłe klasy CSS – przechodzą bez zmian. `Modal` nie używa portalu, więc popup renderuje się w miejscu.
- Siatka bezpieczeństwa: 37 specyfikacji Playwright (niezależnych od frameworka), testy Vitest + jsdom, limit bundla 215 KB gzip (`scripts/check-bundle.mjs`).

## Strategia: wyspy Solid w hoście React (strangler)

Do końca migracji React pozostaje hostem (`main.tsx`, auth, `PopupRouter`, `PopupHost`, `Hub`).
Zmigrowany widżet lub popup jest wyspą Solid montowaną przez jeden mostek:

```tsx
// React: hub/Hub.tsx, hub/HubPopup.tsx
<SolidIsland component={MembersWidget} props={{ me }} />
```

Mostek (`src/bridge/SolidIsland.tsx`, React):

1. Renderuje `<div>` i w `useLayoutEffect` wywołuje `render(() => <Bridge><C {...props} /></Bridge>, el)` z `@solidjs/web`; przy odmontowaniu `dispose()`.
2. Propsy trzyma w store Solid (`createStore`); przy każdym renderze Reacta zapisuje je przez draft (`setStore(s => { Object.assign(s, next); })`) i woła `flush()`, żeby DOM wyspy był aktualny jeszcze w tej samej fazie layoutu (od tego zależy fokus w `PopupHost` i masonry).
3. `Bridge` dostarcza konteksty Solid (`<AuthCtx value>`, `<PopupsCtx value>`, `<PopupLevelCtx value>`, `<ToastCtx value>`) z wartości odczytanych w React (`useAuth`, `usePopups`, `usePopupLevel`…). Wartości zmienne (np. `stack`, `covered`) idą przez ten sam store, więc w Solid są reaktywne.
4. Wyspa w slocie huba to zwykły blokowy `div` – `useMasonry` mierzy `firstElementChild` slotu, więc host wyspy nie może mieć `display: contents`.

Kierunek odwrotny (komponent React w Solid) nie jest potrzebny: kolejność obszarów gwarantuje, że Solid
zależy tylko od kodu już zmigrowanego. Na koniec (etap 8) host przechodzi na Solid, a mostek znika.

## Dane: jeden QueryClient dla obu światów

Cache musi być wspólny (prefetch w `SignedInScreen`, `invalidateQueries` po mutacjach w jednym obszarze
odświeża widżety drugiego). Dlatego w czasie migracji zostaje `@tanstack/query-core`, a po stronie Solid
piszemy cienki adapter (`src/lib/solidQuery.ts`, ~100 linii) zamiast `@tanstack/solid-query` (wsparcie dla 2.0 do potwierdzenia w etapie 0):

- `createQuery(() => options)` – `QueryObserver` + `from()`: `createMemo(() => from(subscribe))`, opcje jako akcesor (`createQuery(() => gameQuery(client, props.id))`), zmiana opcji = `observer.setOptions`.
  Zwraca akcesor wyniku z `status`, `data`, `isPending`, `isError`, `refetch` – port 1:1 obecnych gałęzi `isPending / isError / data` (`QueryStatus`, `Skeleton`, `Banner`).
- `createMutation(options)` – `MutationObserver` w ten sam sposób; alternatywnie `action(function* …)` z `queryClient.invalidateQueries`, tam gdzie przydają się optymistyczne zapisy.
- `QueryClient` przekazany z Reacta przez `Bridge` (`<QueryClientCtx value>`).
- Fabryki zapytań (`collectionWidgetQuery`, `queryOptions(...)`) są niezależne od frameworka: przenosimy je do plików bez Reacta i importujemy `queryOptions` z `@tanstack/query-core`, hooki `useX` zostają w React do czasu usunięcia ostatniego konsumenta.

Docelowe `createMemo(() => fetchX(id()))` z `<Loading>` / `<Errored>` i `refresh()` rozważamy dopiero po etapie 8
(osobna decyzja; wymaga przemyślenia staleTime, prefetchu i inwalidacji).

## Konwencje portowania (React → Solid 2.0)

Zasady ze skilla `solid-2.0`, w tym repo szczególnie:

| W kodzie React                                              | W Solid 2.0                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `function W({ me }: {...})` (wszędzie)                      | `function W(props: {...})` i `props.me` – bez destrukturyzacji                                    |
| `const x = data ? … : …` na górze komponentu                | `createMemo` albo odczyt w JSX (ciało komponentu działa raz)                                      |
| wczesny `return` (np. `MeetingStateTray`)                   | `<Switch>` / `<Match>` / `<Show>`                                                                 |
| `list.map(x => <li key=…>)`                                 | `<For each={list()}>` (`keyed={x => x.id}` gdy elementy to świeże obiekty z zapytania)            |
| `useState` / `useMemo` / `useCallback`                      | `createSignal` / `createMemo` / zwykła funkcja                                                    |
| `useEffect(fn, deps)`                                       | `createEffect(() => deps, v => { …; return cleanup })`                                            |
| `useEffect(…, [])`, `useLayoutEffect` z nasłuchami          | `onSettled(() => { setup(); return cleanup; })`                                                   |
| `useRef<HTMLElement>`                                       | `ref={el => …}`; pomiary układu w `onSettled`                                                     |
| `Ctx.Provider value`                                        | `<Ctx value>`; `createContext<T>()` bez domyślnej wartości i bez wrappera `useX` rzucającego błąd |
| `className={cx('a', b && 'b')}`                             | `class={['a', { b }]}` (`cx.ts` znika z kodu Solid)                                               |
| `tabIndex`, `htmlFor`, `inert={open}`                       | `tabindex`, `for`, `inert={open()}` (atrybuty małymi literami)                                    |
| kontrolowane `<input value onChange>`                       | draft signal z `onInput`, zatwierdzenie na `onChange`/submit (`UNCOMMITTED_INPUT_OVERWRITTEN`)    |
| `onClick={cond ? a : b}`                                    | `onClick={e => (cond() ? a : b)(e)}`                                                              |
| zapis stanu w efekcie (np. `open({ kind: 'first-login' })`) | `onSettled` albo handler; nigdy w ciele/memo (`REACTIVE_WRITE_IN_OWNED_SCOPE`)                    |
| `ErrorBoundary` / `Suspense` / `lazy`                       | `<Errored>` / `<Loading>` / `lazy` z `solid-js`                                                   |
| guardy na podwójny efekt StrictMode (`opened` ref)          | usuwamy – Solid nie uruchamia efektów dwa razy                                                    |
| `menu trigger={(props) => <button {...props}>}`             | render prop zostaje; spread propsów działa                                                        |
| `setX(v); x()` w teście                                     | `flush()` przed asercją                                                                           |
| kilka `return <PopupModal …>` dla stanów popupu             | jeden `PopupModal`, przełączana treść, tytuł i stopka (fokus zostaje na oknie)                    |
| `draggable={false}`, `spellCheck={false}`                   | `draggable="false"`, `spellcheck="false"` (atrybuty wyliczeniowe tekstem)                         |

Układ plików: kod Solid obszaru leży obok dzisiejszego (`members/MembersPopup.tsx` zostaje nazwą).
Które katalogi `apps/web/src` są już w Solid, mówi jedna lista `SOLID_DIRS` w `apps/web/solid-files.js`:
z niej korzystają `vite.config.ts` (`solid({ include })`, `react({ exclude })`) i `eslint.config.js`
(`eslint-plugin-solid/configs/v2` zamiast `react-hooks`). TypeScript zostaje jednym projektem
(`jsx: react-jsx`), a każdy plik `.tsx` Solid zaczyna się od `/** @jsxImportSource @solidjs/web */`; zgodność
dyrektywy z listą katalogów sprawdza `src/config/solid-files.test.ts`. Przeniesienie obszaru = przepisanie plików,
dyrektywa w plikach `.tsx` i dopisanie katalogu do `SOLID_DIRS`. Komponenty współdzielone, które istnieją
w obu wersjach w czasie migracji, mają wersję Solid w `src/solid/ui/` – patrz etap 1.

## Etapy

Każdy etap to osobny PR z gałęzi od `feature/solidjs-2-migration`. Kolejność: od najmniejszych i najmniej
powiązanych obszarów (walidacja mostka) do największego (spotkania), na końcu powłoka.

### Etap 0 – fundament (bez zmian w UI) ✅

Zrobione (bez zmian w zachowaniu aplikacji; żaden kod Solid nie trafia jeszcze do buildu):

- Zależności: `solid-js` 2.0.4, `@solidjs/web` 2.0.4, `@tanstack/query-core` 5.107.1 (ta sama wersja co `react-query`);
  dev: `@solidjs/vite-plugin` 3.0.1, `@solidjs/testing-library` 1.0.0-rc.2 (pierwsza linia dla Solid 2.0),
  `@solidjs/diagnostics` 2.0.4 (plugin sam włącza `/__solid/diagnostics` w `vite dev`), `eslint-plugin-solid` 0.20.1 (`configs/v2`).
  `@tanstack/solid-query` 5.x wymaga `solid-js@^1.6`, więc zostaje własny adapter.
- `apps/web/solid-files.js`: lista katalogów Solid (na razie `src/solid`) dla Vite i ESLint; dyrektywa typów JSX w plikach `.tsx` (wyżej).
- `src/solid/context.ts`: konteksty bez wartości domyślnej (`QueryClientContext`, `AuthContext`, `PopupsContext`,
  `PopupLevelContext`, `ToastContext`) – w Solid `useContext(PopupsContext)` zamiast `usePopups()`.
- `src/bridge/SolidIsland.tsx` (React) + `src/solid/island.tsx` + `src/solid/Bridge.tsx`: wyspa w hoście React.
  Propsy i wartości kontekstów są w store; React zapisuje je w `useLayoutEffect` i woła `flush()`.
  Dostawca kontekstu czyta wartość raz, więc konteksty dostają stałe fasady, których pola czytają store przy
  każdym dostępie (bez tego dev zgłaszał `STRICT_READ_UNTRACKED` w `Bridge`). Zestaw dostawców ustala host przy montowaniu.
  Instancje klas (`QueryClient`, `SupabaseClient`) są `markRaw`: przez proxy store'a ich prywatne pola (`#x`) nie działają.
- `src/solid/query.ts`: `createQuery(() => opcje)` (jeden `QueryObserver` + `from()`, wynik od razu bez `<Loading>`,
  `keepPreviousData` działa) i `createMutation(opcje)` (`MutationObserver`).
- `src/solid/testing.tsx`: `renderSolid(() => <X />, host)`; `src/test/setup.ts` sprząta też wyspy Solid.
- Testy: `src/bridge/SolidIsland.test.tsx` (propsy, stan, odmontowanie, wspólny cache, **popup Solid na stosie
  `PopupRouter`/`PopupHost`: fokus po otwarciu, `inert` niższego poziomu, Esc i `back` oddają fokus otwierającemu**),
  `src/solid/query.test.tsx`, `src/solid/island.test.tsx` (`captureArtifact` + `expectNoDiagnostics` – bramka sprawdzona
  celowym błędem), `src/config/solid-files.test.ts`.

Ustalenia na kolejne etapy:

- Próba wykonana na komponencie testowym (`src/solid/__tests__/fixtures.tsx`), nie na `InvalidPopup`: ten wymaga
  `Modal`, `EmptyState` i `Button` w Solid, czyli etapu 1.
- DOM wyspy po zdarzeniu w Solid zmienia się w mikrozadaniu: w testach `findBy…`/`waitFor` (albo `flush()` w teście Solid),
  nie `getBy…` od razu po `fireEvent`. Zmiany z Reacta (propsy) są widoczne synchronicznie.
- Toasty z Solid: komunikat tekstowy (`ToastApi` przyjmuje `ReactNode`, Solid nie wyrenderuje elementu Reacta).
- **Bundle:** runtime Solid w początkowym pakiecie to **+22,7 KB gzip** (pomiar z tymczasową wyspą w hubie:
  190,5 → 213,2 KB przy limicie 215 KB). Decyzja: `JS_LIMIT_KB` tymczasowo 240 (`scripts/check-bundle.mjs`);
  w etapie 8, po usunięciu Reacta, wraca do 215 albo niżej.

### Etap 1 – wspólne UI w Solid ✅

Zrobione (`src/solid/ui/`, `src/solid/popups/`; nadal bez kodu Solid w buildzie):

- `ui/`: Avatar, AvatarStack, Badge, StatusChip, MetaChip, Button, IconButton, TextLink, Card, Tray, ListRow, Checkbox,
  RadioGroup, SegmentedControl, ChipGroup, ColorSwatches, Switch, Slider, Banner, EmptyState, Skeleton, FieldFrame,
  TextField, PasswordField, SearchField, Stepper, Icon (ikony jako funkcje: w Solid JSX tworzy węzły od razu), Menu, Modal,
  Dialog, Select, ShowMore, Spinner, Tabs, `createChunks`. Pliki bez JSX (`avatarUtils`, `search`, `fieldIds`, `focusable`)
  i CSS są wspólne z Reactem. `Toast`/`ToastProvider` zostają w React do etapu 8: wyspy pokazują toasty przez `ToastContext`.
- `popups/`: `PopupLink` (+ `isPlainClick`), `PopupModal`, `PopupDialog`, `QueryStatus`, `InvalidPopup`, `createLeaveGuard`,
  `createMounted`; mostek przekazuje też `PopupGuardsContext`.
- Różnice API względem `src/ui`: `class` zamiast `className` (tablica/obiekt); pola tekstowe `value` + `onInput`;
  `readonly`, `tabindex`, `autocomplete` małymi literami; `Menu.trigger(props, open)` dostaje `open` jako akcesor, a `props`
  z getterami (rozłożyć na przycisku); `Tabs` – funkcja treści; `Skeleton` – szerokość/wysokość jako liczba (px) albo tekst.
- Testy: `src/solid/ui/parity.test.tsx` – ten sam znormalizowany DOM w React i Solid dla 23 zestawów (w tym otwarty `Select`
  z wyszukiwarką i bez, otwarte `Menu`) i 41 ikon; `src/solid/ui/components.test.tsx` – przypadki z `src/ui/components.test.tsx`
  i `chunks.test.tsx` plus sterowanie polami, `ref`, pułapka fokusu w `Modal`, zamknięcie `Menu` w trakcie `action` i bramka
  `expectNoDiagnostics`; `src/bridge/solidPopups.test.tsx` – popupy Solid na stosie Reacta (←, ×, linki, ochrona wyjścia, fokus).

Ustalenia:

- Opcjonalne elementy z propsów (`action`, `footer`, `lead`…) rozwiązuje `createSlot` (`src/solid/ui/dom.ts`): każdy odczyt
  `props.action` tworzy węzły od nowa, więc `<Show when={props.action}>{props.action}</Show>` zbudowałby je dwa razy.
- Pola wyboru są sterowane propsem: po kliknięciu natywny stan wraca do propsa (`event.currentTarget.checked = props.checked`).
- Atrybuty ARIA z wartością logiczną zapisujemy tekstem (`ariaBool`): Solid usuwa atrybut dla `false`.
- `Menu` zamyka się przez `onFlush`, nie zwykłym zapisem: zapis z tej samej klatki co akcja z `onSelect` zostałby wstrzymany
  razem z nią (sprawdzone testem). Zamknięcie ląduje w mikrozadaniu – w testach `await` przed asercją.
- Efekty (nasłuchy klawiatury, fokus) startują po pierwszym flushu: test bez interakcji wywołuje `flush()` po renderze.
- `Collection.test.tsx` („admin ustawia grę jako niedostępną…”) bywa niestabilny już przed migracją: na `55ec68b` trwa ≈ 5,0 s
  przy limicie 5 s. Do naprawy osobno (poza migracją).

### Etap 2 – Członkowie (pilotaż) ✅

Zrobione:

- `src/members/` w Solid (`SOLID_DIRS`): `MembersWidget` (przeniesiony z `hub/widgets.tsx`), `MembersPopup`, `AddMemberPopup`,
  `DeleteMemberDialog`; `Hub.tsx` i `HubPopup.tsx` montują je przez `SolidIsland`.
- `profile/profileQueries.ts`: typy, klucze i zapytania profili bez frameworka; `profile/profiles.ts` re-eksportuje je i zostawia
  hooki React. Wersje Solid: `src/solid/profile/` (`ProfileAvatar`, `ProfileLink`, `createMembers`, `createProfile`,
  `createAllProfiles`, `createAvatarUrl`).
- Testy: `src/hub/Hub.test.tsx` sprawdza obszar w prawdziwym hoście React (zmiana tylko w sposobie wpisywania: `fireEvent.input`
  zamiast `change`, i `waitFor` po zmianie listy); `src/members/members.test.tsx` – bramka bez diagnostyki Solid.
  E2e members, deletion, hub, profile, a11y-audit, smoke: zielone.

Ustalenia:

- Formularz czyta sygnały w `submit`: wpis z tego samego zadania (autouzupełnianie + Enter) widać dopiero po flushu, więc
  `submit` zaczyna od `flush()`. Ten sam wzorzec w kolejnych formularzach.
- Pośrednie importy `react-query` z modułów bez JSX (`profile/settings.ts` → `auth/useOwnProfile`, `games/gameVoteTotal.ts`)
  zostają do etapów 3 i 5 (obszar używa z nich tylko stałych i walidacji).
- **Bundle i start (decyzja: zostajemy przy kolejności „widżet + popupy”, koszt przyjęty do etapu 8):** początkowy JS
  190,5 → 227,8 KB gzip (wspólny fragment z runtime'em Solid i UI ≈ 36 KB). `perf.spec.ts` (mobile, 4G + CPU ×4):
  gotowość huba 2,50–2,64 s przed etapem → 2,85–3,24 s po nim (+0,4–0,6 s). Test NFR-2 (< 2 s) nie przechodził na
  maszynie dewelopera już przed migracją; jeśli zacznie padać na CI, tymczasowo podnosimy próg z notatką. Optymalizacja
  startu po usunięciu Reacta (etap 8) i przy przebudowie UI.

### Etap 3 – Profil i ustawienia ✅

Zrobione:

- `src/profile/` w Solid (`SOLID_DIRS`): `ProfilePopup`, `PlayerStats`, `PlayerRecords`, `SettingsPopup`, `PasswordPopup`
  (`change` i `first`), `DeleteAccountDialog`, `AvatarCropper`; `HubPopup` montuje je przez `SolidIsland`.
  `playerStatsData.ts` / `playerRecordsData.ts` dają opcje zapytań (`playerStatsQuery`, `playerRecordsQuery`) zamiast hooków.
- **`src/react-shared/`** (React, znika w etapie 8): `ProfileAvatar`, `ProfileLink`, `AvatarCropper` (edytor okładek gier)
  i hooki `profiles.ts` dla obszarów jeszcze w React. Obszar w katalogu Solid nie może mieć plików React, więc wspólne
  komponenty React z takiego obszaru przenosimy tutaj.
- Wspólne wersje Solid elementów z obszarów jeszcze w React (bo Solid nie osadza Reacta): `src/solid/leaderboard/`
  (`FilterBar`, `FilterPopover`, `DateRangeCalendar`, `GameFilterPanel` – w etapie 4 przechodzą do `leaderboard/`),
  `src/solid/games/` (`GameCover`, `createGameSearch`), `src/solid/club.ts` (`createClub`, `createCoverUrl`),
  `src/solid/theme.ts` (`createTheme` nad `theme/themeStore.ts`, wspólnym z `useTheme`). `games.ts` ma `gameSearchQuery`.
- Testy: `src/hub/ProfileSettings.test.tsx` (przeniesiony z `profile/`: test React nie może leżeć w katalogu Solid; zmiany
  tylko w sposobie wpisywania i czekaniu na DOM), `src/hub/Hub.test.tsx`, `src/solid/shared-parity.test.tsx` (zgodność DOM
  `GameCover`, `FilterBar` zamknięty i otwarty, `DateRangeCalendar`, `AvatarCropper`), `src/profile/profile.test.tsx` (bramka
  bez diagnostyki). E2e profile, player-stats, deletion, hub, members, leaderboard, games, a11y-audit, smoke: zielone.

Ustalenia (reguły na kolejne etapy):

- **Jedno okno na wszystkie stany popupu.** React zachowuje element DOM, gdy na tym samym miejscu jest ten sam komponent
  (`PopupModal` wczytywania i `PopupModal` z danymi); `<Switch>`/`<Show>` w Solid tworzą nowe okno, więc fokus ustawiony
  przez `PopupHost` przepada (NFR-6). Komponent popupu renderuje jeden `PopupModal` i przełącza jego tytuł, akcje, stopkę
  i treść (`ProfilePopup`, kadrowanie w `SettingsPopup`).
- **Atrybuty wyliczeniowe jako tekst:** `draggable="false"`, `spellcheck="false"` (Solid usuwa atrybut dla `false`, a brak
  `draggable` na `<img>` znaczy „auto” – obraz dałoby się przeciągać w kadrze). Wykrył to test zgodności DOM.
- Szkic formularza z propsa, który nie może się resetować przy odświeżeniu danych hosta (np. imię w ustawieniach, gdy zapis
  motywu odświeża własny profil): `createSignal(untrack(() => props.me.first_name))` – świadoma jednorazowa wartość.
- `createUniqueId` poza hydracją używa jednego licznika dla wszystkich korzeni, więc id z różnych wysp się nie powtarzają
  (sprawdza to `src/solid/island.test.tsx`).
- Bundle: początkowy JS 230,9 KB gzip (limit 240).

### Etap 4 – Ranking ✅

Zrobione:

- `src/leaderboard/` w Solid (`SOLID_DIRS`): `RankingWidget`, `LeaderboardPopup`, `LeaderboardBoard`, `TiesPopup`,
  `BoardStatus`; `FilterBar`, `FilterPopover`, `GameFilter`, `DateRangeCalendar` przeniesione z `src/solid/leaderboard/`.
  `Hub` i `HubPopup` montują obszar przez `SolidIsland`. Dane: `leaderboardQuery` (opcje bez frameworka) i
  `createBoardData(kind, filters)`; tytuły gier filtrów: `gameTitles.ts` (`createGameTitles`).
- `react-shared/FilterPopover.tsx`, `react-shared/GameFilter.tsx`: wersje React dla `MeetingSummary` (do etapu 6).
  React `FilterBar` i `DateRangeCalendar` usunięte (przypadki w `shared-parity.test.tsx` też).
- Testy: `LeaderboardBoard.test.tsx` i `DateRangeCalendar.test.tsx` na `renderSolid`/`render` Solid (te same asercje
  - sterowany zakres), `leaderboard-area.test.tsx` (bramka bez diagnostyki).

Ustalenia:

- **Błąd z etapu 3 naprawiony:** `DateRangeCalendar` trzymał miesiąc w pochodnym sygnale z `props.from`, więc każdy wybór
  dnia cofał widok do miesiąca początku zakresu (dzień z sąsiedniego miesiąca nie przełączał kalendarza – także w profilu).
  Wartość startowa stanu lokalnego z propsa = `createSignal(untrack(() => …))`, nie `createSignal(() => …)`. Test jednostkowy
  ze statycznymi propsami tego nie łapał; nowy przypadek steruje zakresem sygnałem.
- Bundle: początkowy JS 232,7 KB gzip (limit 240).
- E2e po poprawce kalendarza (sprawdzone w etapie 5a): `leaderboard.spec.ts:171` padał dalej, bo siatka dni
  w Solid tworzyła nowe przyciski przy zmianie miesiąca (fokus wypadał z panelu i Esc go nie zamykał). Naprawione
  w 5a: `<For keyed>` po dacie, jak `key` w React.

### Etap 5 – Kolekcja, gry, arkusze i notesy

Największy obszar techniczny (≈11 tys. linii z `score-pad/` i `sheets/`), więc dwa PR-y.

#### 5a – Kolekcja, gry i karteczki ✅

Zrobione:

- `src/games/` i `src/sheets/` w Solid (`SOLID_DIRS`): `CollectionWidget` (przeniesiony z `hub/widgets.tsx`),
  `CollectionPopup`, `GameDetailsPopup`, `GameFormPopup` (`AddGamePopup`, `AddExpansionPopup`, `EditGamePopup`),
  `CoverEditor`, `GameStats`, `DeleteGameDialog`, `SheetPopup`, `SheetZoom`; `GameCover` przeniesiony z `src/solid/games/`.
  `Hub` i `HubPopup` montują obszar przez `SolidIsland`.
- Dane bez frameworka: `games.ts` (`gameQuery`, `expansionsQuery`, `allExpansionsQuery`, `gameTitlesQuery`,
  `collectionWidgetQuery`, `gameSearchQuery`), `gameStatsQuery`, `gameVoteTotalQuery`, `sheets.ts` (`savedSheetQuery`,
  `gameSheetsQuery`, `sheetImageUrlQuery`), `meetings/records.ts` (`meetingRecordsQuery`); `queryOptions` z React zastąpione
  zwykłymi obiektami (`query-core` go nie eksportuje). Wersje Solid: `games/gameData.ts` (`createGame`, `createGameSearch`…),
  `sheets/sheetData.ts`, `solid/meetings/records.ts`.
- `react-shared/`: `GameCover`, `games.ts` (`useGameSearch`, `useGame`, `useAllExpansions`, `useGameTitles`) i `sheets.ts`
  (`useSheetImageUrl`) dla spotkań i notesów (etapy 5b, 6). React `AvatarCropper` usunięty (edytor okładek używa
  `profile/AvatarCropper`).
- `src/solid/meetings/MeetingParts.tsx`: wersje Solid `SheetThumbnail`, `PlayResultRows`, `RecordBadge`, `PlayTimes`
  (spotkania zostają w React do etapu 6); zgodność DOM z React w `solid/shared-parity.test.tsx`.
- Testy: `src/hub/Collection.test.tsx` (przeniesiony z `games/`; zmiany tylko w sposobie wpisywania – `fireEvent.input` –
  i czekaniu na DOM), `src/games/games-area.test.tsx` (bramka bez diagnostyki). E2e games, game-stats, game-vote-totals,
  sheet-history, hub, smoke, a11y-audit, leaderboard, player-stats, profile, meetings: zielone.

Ustalenia:

- **Formularz z danymi z zapytania w jednym oknie:** `GameFormPopup` renderuje jeden `PopupModal` dla wczytywania,
  formularza i „Nie znaleziono”. Stan formularza startuje z pierwszych wczytanych danych: `createMemo(() => (first ??= target()))`
  zamraża pierwszą wartość, a `createSignal(() => initial(ctx()))` daje szkic, który odświeżenie cache'u nie nadpisuje.
- **Odczyt w `blur`/`submit` po wpisie z tego samego zadania:** sygnał pokazuje wpis dopiero po flushu, więc `onBlur` czyta
  wartość z pola (`event.currentTarget.value`), a `submit` zaczyna od `flush()` (jak w etapie 2).
- **Listy z nowymi obiektami przy każdym obliczeniu** (siatka dni, wyniki): `keyed` po stabilnym id, inaczej przyciski powstają
  od nowa i tracą fokus (błąd kalendarza z etapu 4).
- Stan zdarzeń wskaźnika i kółka (`SheetZoom`, `CoverEditor`) trzymamy w zwykłych zmiennych obok sygnału: kilka zdarzeń
  przychodzi przed flushem (odpowiednik `useRef` z wartością bieżącą w React).
- `lint` przechodzi bez ostrzeżeń: test sterowanego zakresu w `DateRangeCalendar.test.tsx` nie czyta już sygnału poza
  śledzonym zasięgiem; `wrangler.jsonc` sformatowany (przecinki końcowe; `prettier --check` padał już na `master`).
- Bundle: początkowy JS 234,5 KB gzip (limit 240).

#### 5b – Notesy ✅

Zrobione:

- `src/score-pad/` w Solid (`SOLID_DIRS`): `ScorepadsPopup` (z `ScorepadThumb`), `ScorepadEditorPopup` (`AddScorepadPopup`,
  `EditScorepadPopup`), `ScorepadWizard` i kroki (`PhotoStep`, `CameraCapture`, `AreaStep`, `MappingStep`, `CategoriesStep`,
  `TestStep`), `ScorepadDialogs` (`RenameScorepadDialog`, `MoveScorepadPopup`, `DeleteScorepadDialog`), `ZoomButtons`,
  `ManualTieControls`, `ScorePadView`, `ScorePadEditorView`, `ScorePadStatus`. `HubPopup` montuje obszar przez `SolidIsland`.
- `useScorePadElement` → `createScorePadElement(part, theme, create, input)`: efekt, którego compute czyta wejście (zmiana =
  nowy element), a apply ładuje moduł, tworzy element i montuje go w kontenerze; cleanup usuwa element (→ `destroy()`). Motyw
  osobnym efektem przez atrybut. Uchwyt notesu i edytora idzie przez `ref` komponentu jako funkcja (`ref={(h) => (pad = h)}`).
- `useDraft` → `createDraft(() => wartość)`: memo przesuwa „widzianą” wartość tylko bez fokusu w polu, a szkic to sygnał
  pochodny od tego memo (bez zapisów w obliczeniach).
- Dane: `gameScorepadsQuery`, `activeScorepadsQuery`, `scorepadQuery`, `scorepadTemplateQuery` w `scorepads.ts`; wersje Solid
  w `score-pad/scorepadData.ts`.
- `react-shared/`: `ScorePadView`, `ScorePadEditorView`, `ScorePadStatus`, `useScorePadElement`, `ManualTieControls` i hook
  `useActiveScorepads` dla partii i podsumowania (spotkania, etap 6) oraz strony design systemu (etap 8).
- Jedno okno: `ScorepadWizard` dostaje stan wczytywania od popupu (`source`, `notFound`, `isError`) i renderuje jeden
  `PopupModal` dla wczytywania, kreatora i „Nie znaleziono”; `ScorepadsPopup` i `RenameScorepadDialog` tak samo.
- Testy: `src/hub/Scorepads.test.tsx` (przeniesiony; `fireEvent.input` w polach tekstowych, czekanie na odblokowany przycisk
  po wyborze w `Select`), `score-pad/ScorePadView.test.tsx` (wersja Solid; wersja React w `react-shared/`),
  `src/hub/ScorepadWizard.test.tsx` (przeniesiony: kreator w prawdziwym hoście React przez `SolidIsland`; atrapy edytora i notesu jako komponenty Solid; po każdym zdarzeniu `flush()`), `score-pad/scorepads-area.test.tsx` (bramka bez diagnostyki).
- **E2e nie były uruchamiane** w 5b (ani pełny przebieg po 5a poza obszarem 5a) – na prośbę, do zrobienia przed scaleniem:
  wszystkie `scorepad-*.spec.ts` i `score-pad*.spec.ts`, `new-play`, `play-*`, `meeting-run`, `voting`, `design-system`.

Ustalenia:

- **Apply efektu bez wartości zwracanej:** `createEffect(s, (v) => props.onX?.(v))` zwraca wynik callbacku (np. setter
  sygnału zwraca wartość), a Solid traktuje go jak cleanup i rzuca „invalid cleanup value”. Apply z wywołaniem zawsze w klamrach.
- **`autofocus` na wstawionym węźle nie działa:** fokus startowy w dialogu (React `autoFocus`) ustawiamy w `onSettled` przez `ref`.
- **Błąd w `solid/ui/Choice.tsx` naprawiony:** `RadioGroup`, `SegmentedControl` i `ColorSwatches` nie cofały natywnego
  zaznaczenia, gdy rodzic odrzucił zmianę (np. zmiana sposobu mapowania anulowana w potwierdzeniu). Po kliknięciu grupa wraca
  do `value` (`revertRadios`), jak `Checkbox`; nowy wybór pokazuje dopiero zmiana propsa. Wykrył to test kreatora.
- Bundle: początkowy JS 235,1 KB gzip (limit 240).
- `Show when` z pustym tekstem jest fałszywe: do „klucza” komponentu (React `key`) z wartością, która może być pusta,
  używamy krotki (`when={[path()] as const} keyed`).

### Etap 6 – Spotkania i Timeline

Największy obszar domenowy (≈10,5 tys. linii, 13 plików testów). Trzy PR-y:

- 6a: `TimelineWidget` + `calendar` (`CalendarPopup`), `add-meeting`, `edit-meeting`, `delete-meeting` (`MeetingFormPopup`, `DateVotingSection`, `DeleteMeetingDialog`).
- 6b: `MeetingWidget` (+ `MeetingBlock`, tace głosów/gier/partii) + `meeting` (`MeetingPopup`, `MeetingSummary`, `MeetingParts`), `publish-games`, `start-meeting`, `finish-meeting`, `reopen-meeting`.
- 6c: `new-play`, `play`, `discard-play`, `delete-play` (`NewPlayPopup`, `PlayPopup` z notesem i ochroną wyjścia, `PlaySummaryDialog`, `DeletePlayDialog`, `DiscardPlayDialog`).
- Ryzyka: `countdownLabel` (odliczanie – timer w `onSettled`), głosowanie i `useReopenVoting` (mutacje → `createMutation`/`action` z optymistycznym zapisem tam, gdzie dziś jest `onMutate`), szkice partii i `useLeaveGuard` w `PlayPopup`.
- Testy: wszystkie `meetings/*.test.ts`; e2e `meetings.spec.ts`, `meeting-run.spec.ts`, `calendar.spec.ts`, `date-voting.spec.ts`, `voting.spec.ts`, `new-play.spec.ts`, `play-*.spec.ts`.

### Etap 7 – Klub i nagłówek

- `AppHeader`, `ClubLogo`, `club` (`ClubPopup`), `FirstRun` (+ ilustracja).
- Po tym etapie wszystkie widżety i popupy są w Solid; React zostaje tylko w powłoce.
- e2e `club.spec.ts`, `smoke.spec.ts`.

### Etap 8 – powłoka i usunięcie Reacta

- `PopupRouter` → store Solid nad `history` (stos, `navigating`, opener-y, mapa ochron); `PopupHost` → `<For>` po stosie z `<PopupLevelCtx value>` i efektem fokusu; `HubPopup` → `<Switch>`/`<Match>` z `lazy`, `<Loading>` i `<Errored>` (w miejsce `Suspense`, `PopupErrorBoundary`, `FocusWhenLoaded`); `Hub`, `useMasonry` (ref + `onSettled`), `AuthProvider`, `SignedInScreen` (prefetch przez `queryClient.prefetchQuery`), `LoginScreen`, `App`, `Root`, `main.tsx` (`render` z `@solidjs/web`), `AppStatus`, `DesignSystemPage`, `theme/`.
- Usunąć `SolidIsland`/`Bridge`, wersje React z `ui/`, `react`, `react-dom`, `@tanstack/react-query`, `@testing-library/react`, `@vitejs/plugin-react`, `eslint-plugin-react-*`, `@types/react*`; `tsconfig.app.json` na `jsxImportSource: @solidjs/web`; jeden plugin JSX.
- Przywrócić / obniżyć limit bundla, `perf.spec.ts`, `pwa.spec.ts`, `a11y-audit.spec.ts`, `regression.spec.ts`.
- Decyzja o warstwie danych: zostać przy `query-core` + adapterze czy przejść na natywne async Solid (`createMemo` + `<Loading>` + `refresh`/`action`).

## Definicja ukończenia obszaru

1. Wszystkie pliki obszaru są w Solid; w obszarze nie ma importu z `react` ani `@tanstack/react-query`.
2. `HubPopup` i `Hub` renderują obszar przez `SolidIsland`; stare komponenty React obszaru są usunięte.
3. Testy jednostkowe obszaru przeniesione na `renderSolid` (te same asercje zachowania), e2e obszaru i `a11y-audit` zielone bez zmian w specyfikacjach (zmiana spec = sygnał zmiany zachowania, wymaga uzasadnienia).
4. W konsoli dev przy przejściu ścieżek e2e obszaru nie ma kodów diagnostyki Solid (sprawdzone pętlą `captureArtifact` z `@solidjs/diagnostics` albo ręcznie); każdy kod naprawiony u przyczyny według `reactivity-diagnostics`.
5. `pnpm check` zielone (w tym `check-bundle`), lint `eslint-plugin-solid` v2 bez ostrzeżeń.
6. Ręczny przegląd: fokus po otwarciu/zamknięciu popupu, Esc, Wstecz przeglądarki, telefon (arkusz, klawiatura ekranowa), motyw ciemny.

## Ryzyka

| Ryzyko                                                                                                                            | Ograniczenie                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Kolejność aktualizacji między React a Solid (odczyty Solid widzą zapis dopiero po mikrozadaniu) psuje fokus `PopupHost` i masonry | `flush()` w `useLayoutEffect` mostka; testy `PopupStack.test.tsx` z wyspą w etapie 0 |
| Dryf dwóch wersji komponentów `ui/`                                                                                               | wspólny zestaw testów dla obu rendererów; wersje React usuwane w etapie 8            |
| Ekosystem 2.0 (testing-library, solid-query, vite-plugin)                                                                         | etap 0 sprawdza; fallback to własne cienkie adaptery                                 |
| Większy początkowy bundle w okresie przejściowym                                                                                  | pomiar w etapie 0, jawny tymczasowy limit, powrót w etapie 8                         |
| Nawyki z Reacta (destrukturyzacja propsów, odczyty na górze komponentu, kontrolowane inputy)                                      | skill `solid-2.0` przed każdym obszarem, lint `v2`, diagnostyka dev jako bramka      |
| Długość migracji                                                                                                                  | każdy etap wdrażalny osobno; można zatrzymać się po dowolnym obszarze                |
