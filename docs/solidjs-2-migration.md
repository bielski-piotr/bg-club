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
  190,5 → 213,2 KB przy limicie 215 KB). Pierwszy widżet w Solid (etap 2) przekroczy limit. Do decyzji przed etapem 2:
  tymczasowo podnieść `JS_LIMIT_KB` (np. do 240 z notatką i powrotem po etapie 8, gdy zniknie React ≈ 60 KB gzip)
  albo najpierw migrować obszary bez widżetu (popupy są w leniwym fragmencie `HubPopup`).

### Etap 1 – wspólne UI w Solid

`ui/` (Button, Card, Icon, Badge, Avatar, Feedback/Banner/Skeleton/Spinner/EmptyState, Field, Select, Choice,
Controls, Menu, Modal, Tabs, ShowMore, Toast-API) + `popups/` po stronie wyspy (`PopupLink`, `PopupModal`,
`PopupDialog`, `QueryStatus`, `useLeaveGuard` → `createLeaveGuard`, `InvalidPopup`).

- Ten sam DOM i klasy CSS co wersja React – porównanie przez `ui/components.test.tsx` uruchomione dla obu wersji (te same asercje, dwa renderery) i `design-system.spec.ts`.
- Szczególna uwaga: `Field`/`Select`/`Choice` (zasada draft signal), `Menu` (fokus, klawiatura, `onFlush` przy zamykaniu przed `onSelect`), `Modal` (`data-popup-level`, fokus, `inert`).
- Wersje React zostają, dopóki mają konsumentów (usuwane w etapie 8).

### Etap 2 – Członkowie (pilotaż)

- Widżet: `MembersWidget` (+ `MembersStack`) przeniesiony z `hub/widgets.tsx` do `members/`.
- Popupy: `members`, `add-member`, `delete-member` (`MembersPopup`, `AddMemberPopup`, `DeleteMemberDialog`).
- Współdzielone do Solid: `ProfileAvatar`, `ProfileLink`, `profiles.ts` (fabryki zapytań bez Reacta).
- Testy: `members/*.test.ts`; e2e `members.spec.ts`, `deletion.spec.ts`, `hub.spec.ts`.
- Po pilotażu: retrospektywa mostka i konwencji, poprawki w tym dokumencie.

### Etap 3 – Profil i ustawienia (obszar bez widżetu)

- Popupy: `profile`, `settings`, `change-password`, `delete-account`, `first-login` (`ProfilePopup`, `PlayerStats`, `PlayerRecords`, `SettingsPopup`, `PasswordPopup`, `DeleteAccountDialog`, `AvatarCropper`).
- Ryzyka: `AvatarCropper` (gesty, pomiary → `onSettled`, refy), formularze ustawień i motyw (`useProfileTheme` – motyw ustawia host, wyspa tylko zapisuje).
- Testy: `ProfileSettings.test.tsx`, `settings.test.ts`, `playerStats.test.ts`; e2e `profile.spec.ts`, `player-stats.spec.ts`.

### Etap 4 – Ranking

- Widżet: `RankingWidget`.
- Popupy: `leaderboard`, `leaderboard-ties` (`LeaderboardPopup`, `LeaderboardBoard`, `FilterBar`, `FilterPopover`, `GameFilter`, `DateRangeCalendar`, `BoardStatus`, `TiesPopup`).
- Ryzyka: filtry w adresie/stanie (store zamiast kilku `useState`), podium (`fix(leaderboard)` – stałe wysokości), kalendarz zakresu.
- Testy: `LeaderboardBoard.test.tsx`, `DateRangeCalendar.test.tsx`, `leaderboard.test.ts`; e2e `leaderboard.spec.ts`.

### Etap 5 – Kolekcja, gry, arkusze i notesy

Największy obszar techniczny (≈11 tys. linii z `score-pad/` i `sheets/`), więc dwa PR-y:

- 5a: widżet `CollectionWidget`; popupy `games`, `game`, `add-game`, `add-expansion`, `edit-game`, `delete-game`, `sheet` (`CollectionPopup`, `GameDetailsPopup`, `GameFormPopup`, `CoverEditor`, `GameStats`, `DeleteGameDialog`, `SheetPopup`, `SheetZoom`); współdzielone `GameCover`.
- 5b: `scorepads`, `add-scorepad`, `edit-scorepad`, `rename-scorepad`, `move-scorepad`, `delete-scorepad` (`ScorepadsPopup`, `ScorepadEditorPopup`, `ScorepadWizard` i kroki, `ScorepadDialogs`, `ZoomButtons`).
  `useScorePadElement` → `createScorePadElement(part, theme, create)`: element tworzony w efekcie, którego compute czyta wejście, a apply montuje/niszczy element (cleanup = usunięcie z DOM → `destroy()`); zmiana motywu osobnym efektem przez atrybut. `useDraft` → store.
- `ScorePadView` (notes partii) zostaje w React do etapu 6, ale jako komponent współdzielony dostaje wersję Solid już w 5b.
- Testy: `Collection.test.tsx`, `Scorepads.test.tsx`, `ScorepadWizard.test.tsx`, `ScorePadView.test.tsx`; e2e `games.spec.ts`, `game-stats.spec.ts`, `game-vote-totals.spec.ts`, `sheet-history.spec.ts`, wszystkie `scorepad-*.spec.ts` i `score-pad*.spec.ts`.

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
