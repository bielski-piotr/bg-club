import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, onSettled } from 'solid-js';
import {
  PopupGuardsContext,
  PopupOpenersContext,
  PopupsContext,
  type LeaveGuard,
  type PopupApi,
  type PopupGuards,
  type PopupOpeners,
} from './popupContext';
import { parseStack, routeKey, stackSearch, type PopupRoute } from './routes';

/** Ile wpisów historii nad wpisem startowym dołożyła aplikacja, otwierając popupy. */
interface PopupHistoryState {
  readonly bgPopupDepth: number;
}

function currentDepth(): number {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object' && 'bgPopupDepth' in state) {
    const depth = (state as PopupHistoryState).bgPopupDepth;
    if (Number.isInteger(depth) && depth > 0) return depth;
  }
  return 0;
}

function urlWith(stack: readonly PopupRoute[]): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${stackSearch(search, stack)}${hash}`;
}

function sameStack(a: readonly PopupRoute[], b: readonly PopupRoute[]): boolean {
  return (
    a.length === b.length &&
    a.every((route, level) => routeKey(route, level) === routeKey(b[level] as PopupRoute, level))
  );
}

/** Najwyższy poziom z ochroną, którego popup znika (albo zmienia się) przy przejściu `before` → `after`. */
function lostGuardLevel(
  guards: ReadonlyMap<number, LeaveGuard>,
  before: readonly PopupRoute[],
  after: readonly PopupRoute[],
): number | undefined {
  for (let level = before.length - 1; level >= 0; level--) {
    if (!guards.has(level)) continue;
    const kept = after[level];
    if (!kept || routeKey(kept, level) !== routeKey(before[level] as PopupRoute, level))
      return level;
  }
  return undefined;
}

/**
 * Stos popupów zapisany w adresie (`routes.ts`).
 *
 * - Otwarcie popupu dodaje wpis historii, więc Wstecz (przeglądarka, gest na telefonie) zamyka
 *   górny popup, a Dalej otwiera go ponownie.
 * - Zamknięcie z aplikacji (Esc, ←) cofa historię, jeśli popup otworzyła ta karta; przy popupie
 *   z linku albo po odświeżeniu nie ma czego cofać, więc wpis jest podmieniany (Wstecz nie
 *   wyprowadza wtedy z aplikacji ani nie otwiera popupu ponownie).
 * - × zamyka cały stos: cofa wszystkie wpisy dodane przez aplikację i czyści resztę z adresu.
 * - Popup z ochroną (`createLeaveGuard`, np. niezapisane zmiany) sam decyduje o zamknięciu przez
 *   Esc, ←, × i tło. Wstecz w przeglądarce cofa się od razu, więc router przywraca adres popupu
 *   (nowy wpis historii) i pyta ochronę; potwierdzenie cofa ten wpis.
 *
 * Decyzje zapadają na bieżącym adresie (`window.location`), nie na sygnale: zapis sygnału
 * widać dopiero po flushu, a adres zmienia się od razu.
 */
export function PopupRouter(props: { readonly children: JSX.Element }) {
  const [search, setSearch] = createSignal(window.location.search);
  const stack = createMemo(() => parseStack(search()));
  /** Po `history.go(-n)` z „zamknij wszystko”: wyczyść popupy z wpisu, na który wrócimy. */
  let clearAfterPop = false;
  /**
   * Trwa cofanie historii zlecone przez aplikację (`history.back` / `go` są asynchroniczne).
   * Do zdarzenia `popstate` adres jest jeszcze stary, więc kolejne Esc, ← albo × byłyby liczone
   * od złego wpisu i mogłyby wyjść poza aplikację; do tego czasu są ignorowane.
   */
  let navigating = false;
  const openerList: (Element | null)[] = [];
  const guardMap = new Map<number, LeaveGuard>();
  /** Adres (część `search`) ostatnio pokazanego stosu: do przywrócenia po Wstecz z ochroną. */
  let shownSearch = window.location.search;

  /** Nowy adres jako stan routera. */
  const sync = () => {
    shownSearch = window.location.search;
    setSearch(shownSearch);
  };

  const guards: PopupGuards = {
    set: (level, guard) => {
      if (guard) guardMap.set(level, guard);
      else guardMap.delete(level);
    },
  };

  const openers: PopupOpeners = {
    remember: (level, opener) => {
      openerList[level] = opener;
    },
    take: (level) => {
      const opener = openerList[level] ?? null;
      openerList.length = Math.min(openerList.length, level);
      return opener;
    },
  };

  onSettled(() => {
    const onPopState = () => {
      const fromApp = navigating;
      navigating = false;
      if (!fromApp) {
        const before = shownSearch;
        const level = lostGuardLevel(
          guardMap,
          parseStack(before),
          parseStack(window.location.search),
        );
        const guard = level === undefined ? undefined : guardMap.get(level);
        if (guard) {
          const { pathname, hash } = window.location;
          const state: PopupHistoryState = { bgPopupDepth: currentDepth() + 1 };
          window.history.pushState(state, '', `${pathname}${before}${hash}`);
          guard(() => {
            if (navigating) return;
            navigating = true;
            window.history.back();
          });
          return;
        }
      }
      if (clearAfterPop) {
        clearAfterPop = false;
        if (parseStack(window.location.search).length > 0) {
          window.history.replaceState({ bgPopupDepth: 0 }, '', urlWith([]));
        }
      }
      sync();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });

  const open = (route: PopupRoute) => {
    if (navigating) return;
    const current = parseStack(window.location.search);
    openers.remember(current.length, document.activeElement);
    const state: PopupHistoryState = { bgPopupDepth: currentDepth() + 1 };
    window.history.pushState(state, '', urlWith([...current, route]));
    sync();
  };

  /**
   * Pyta po kolei ochrony poziomów `levels` (od góry); `done` dopiero po zgodzie wszystkich.
   * Ochrony zostają zarejestrowane: anulowanie albo nieudana nawigacja nie zostawia popupu
   * ze zmianami bez ochrony.
   */
  const askGuards = (levels: readonly number[], done: () => void) => {
    const ask = (index: number) => {
      const level = levels[index];
      const guard = level === undefined ? undefined : guardMap.get(level);
      if (!guard) {
        if (index >= levels.length) done();
        else ask(index + 1);
        return;
      }
      guard(() => ask(index + 1));
    };
    ask(0);
  };

  const backBy = (count: number) => {
    if (navigating) return;
    const current = parseStack(window.location.search);
    const n = Math.min(Number.isInteger(count) && count > 1 ? count : 1, current.length);
    if (current.length === 0) return;
    const levels = current
      .map((_, level) => level)
      .slice(-n)
      .reverse();
    askGuards(levels, () => {
      // Stos mógł się zmienić, gdy ochrona czekała na odpowiedź.
      if (navigating || !sameStack(parseStack(window.location.search), current)) return;
      const depth = currentDepth();
      if (depth >= n) {
        navigating = true;
        if (n === 1) window.history.back();
        else window.history.go(-n);
        return;
      }
      // Część popupów nie ma własnych wpisów historii (link, odświeżenie): cofamy te, które
      // mają, a resztę zdejmujemy z adresu po powrocie.
      if (depth > 0) {
        navigating = true;
        const rest = urlWith(current.slice(0, -n));
        const onPop = () => {
          window.history.replaceState({ bgPopupDepth: 0 }, '', rest);
          sync();
        };
        window.addEventListener('popstate', onPop, { once: true });
        window.history.go(-depth);
        return;
      }
      window.history.replaceState({ bgPopupDepth: 0 }, '', urlWith(current.slice(0, -n)));
      sync();
    });
  };

  const api: PopupApi = {
    get stack() {
      return stack();
    },
    open,
    back: () => backBy(1),
    backBy,
    replace: (route) => {
      if (navigating) return;
      const current = parseStack(window.location.search);
      if (current.length === 0) return;
      const state: PopupHistoryState = { bgPopupDepth: currentDepth() };
      window.history.replaceState(state, '', urlWith([...current.slice(0, -1), route]));
      sync();
    },
    closeAll: () => {
      const current = parseStack(window.location.search);
      if (navigating || current.length === 0) return;
      const levels = current.map((_, level) => level).reverse();
      askGuards(levels, () => {
        if (navigating || !sameStack(parseStack(window.location.search), current)) return;
        const depth = currentDepth();
        if (depth > 0) {
          navigating = true;
          clearAfterPop = true;
          window.history.go(-depth);
          return;
        }
        window.history.replaceState({ bgPopupDepth: 0 }, '', urlWith([]));
        sync();
      });
    },
    hrefFor: (route) => `${window.location.pathname}${stackSearch(search(), [...stack(), route])}`,
  };

  return (
    <PopupOpenersContext value={openers}>
      <PopupGuardsContext value={guards}>
        <PopupsContext value={api}>{props.children}</PopupsContext>
      </PopupGuardsContext>
    </PopupOpenersContext>
  );
}
