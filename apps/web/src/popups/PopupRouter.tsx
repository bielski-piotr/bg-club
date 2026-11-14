import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PopupContext,
  PopupGuardsContext,
  PopupOpenersContext,
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
 * Stos popupów zapisany w adresie (PRD §4, `routes.ts`).
 *
 * - Otwarcie popupu dodaje wpis historii, więc Wstecz (przeglądarka, gest na telefonie) zamyka
 *   górny popup, a Dalej otwiera go ponownie.
 * - Zamknięcie z aplikacji (Esc, ←) cofa historię, jeśli popup otworzyła ta karta; przy popupie
 *   z linku albo po odświeżeniu nie ma czego cofać, więc wpis jest podmieniany (Wstecz nie
 *   wyprowadza wtedy z aplikacji ani nie otwiera popupu ponownie).
 * - × zamyka cały stos: cofa wszystkie wpisy dodane przez aplikację i czyści resztę z adresu.
 * - Popup z ochroną (`useLeaveGuard`, np. niezapisane zmiany) sam decyduje o zamknięciu przez
 *   Esc, ←, × i tło. Wstecz w przeglądarce cofa się od razu, więc router przywraca adres popupu
 *   (nowy wpis historii) i pyta ochronę; potwierdzenie cofa ten wpis.
 */
export function PopupRouter({ children }: { readonly children: ReactNode }) {
  const [search, setSearch] = useState(() => window.location.search);
  const stack = useMemo(() => parseStack(search), [search]);
  /** Po `history.go(-n)` z „zamknij wszystko”: wyczyść popupy z wpisu, na który wrócimy. */
  const clearAfterPop = useRef(false);
  /**
   * Trwa cofanie historii zlecone przez aplikację (`history.back` / `go` są asynchroniczne).
   * Do zdarzenia `popstate` adres jest jeszcze stary, więc kolejne Esc, ← albo × byłyby liczone
   * od złego wpisu i mogłyby wyjść poza aplikację; do tego czasu są ignorowane.
   */
  const navigating = useRef(false);
  const openerList = useRef<(Element | null)[]>([]);
  const guardMap = useRef(new Map<number, LeaveGuard>());
  /** Adres (część `search`) ostatnio pokazanego stosu: do przywrócenia po Wstecz z ochroną. */
  const shownSearch = useRef(search);
  const guards = useMemo<PopupGuards>(
    () => ({
      set: (level, guard) => {
        if (guard) guardMap.current.set(level, guard);
        else guardMap.current.delete(level);
      },
    }),
    [],
  );

  useEffect(() => {
    shownSearch.current = search;
  }, [search]);
  const openers = useMemo<PopupOpeners>(
    () => ({
      remember: (level, opener) => {
        openerList.current[level] = opener;
      },
      take: (level) => {
        const opener = openerList.current[level] ?? null;
        openerList.current.length = Math.min(openerList.current.length, level);
        return opener;
      },
    }),
    [],
  );

  useEffect(() => {
    const onPopState = () => {
      const fromApp = navigating.current;
      navigating.current = false;
      if (!fromApp) {
        const before = shownSearch.current;
        const level = lostGuardLevel(
          guardMap.current,
          parseStack(before),
          parseStack(window.location.search),
        );
        const guard = level === undefined ? undefined : guardMap.current.get(level);
        if (guard) {
          const { pathname, hash } = window.location;
          const state: PopupHistoryState = { bgPopupDepth: currentDepth() + 1 };
          window.history.pushState(state, '', `${pathname}${before}${hash}`);
          guard(() => {
            if (navigating.current) return;
            navigating.current = true;
            window.history.back();
          });
          return;
        }
      }
      if (clearAfterPop.current) {
        clearAfterPop.current = false;
        if (parseStack(window.location.search).length > 0) {
          window.history.replaceState({ bgPopupDepth: 0 }, '', urlWith([]));
        }
      }
      setSearch(window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const open = useCallback(
    (route: PopupRoute) => {
      if (navigating.current) return;
      const current = parseStack(window.location.search);
      openers.remember(current.length, document.activeElement);
      const state: PopupHistoryState = { bgPopupDepth: currentDepth() + 1 };
      window.history.pushState(state, '', urlWith([...current, route]));
      setSearch(window.location.search);
    },
    [openers],
  );

  const back = useCallback(function back() {
    if (navigating.current) return;
    const current = parseStack(window.location.search);
    if (current.length === 0) return;
    const guard = guardMap.current.get(current.length - 1);
    if (guard) {
      guard(() => {
        guardMap.current.delete(current.length - 1);
        back();
      });
      return;
    }
    if (currentDepth() > 0) {
      navigating.current = true;
      window.history.back();
      return;
    }
    window.history.replaceState({ bgPopupDepth: 0 }, '', urlWith(current.slice(0, -1)));
    setSearch(window.location.search);
  }, []);

  const closeAll = useCallback(function closeAll() {
    const current = parseStack(window.location.search);
    if (navigating.current || current.length === 0) return;
    const level = lostGuardLevel(guardMap.current, current, []);
    const guard = level === undefined ? undefined : guardMap.current.get(level);
    if (level !== undefined && guard) {
      guard(() => {
        guardMap.current.delete(level);
        closeAll();
      });
      return;
    }
    const depth = currentDepth();
    if (depth > 0) {
      navigating.current = true;
      clearAfterPop.current = true;
      window.history.go(-depth);
      return;
    }
    window.history.replaceState({ bgPopupDepth: 0 }, '', urlWith([]));
    setSearch(window.location.search);
  }, []);

  const hrefFor = useCallback(
    (route: PopupRoute) => `${window.location.pathname}${stackSearch(search, [...stack, route])}`,
    [search, stack],
  );

  const api = useMemo<PopupApi>(
    () => ({ stack, open, back, closeAll, hrefFor }),
    [stack, open, back, closeAll, hrefFor],
  );

  return (
    <PopupOpenersContext.Provider value={openers}>
      <PopupGuardsContext.Provider value={guards}>
        <PopupContext.Provider value={api}>{children}</PopupContext.Provider>
      </PopupGuardsContext.Provider>
    </PopupOpenersContext.Provider>
  );
}
