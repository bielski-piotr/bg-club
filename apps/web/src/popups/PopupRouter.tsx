import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PopupContext,
  PopupOpenersContext,
  type PopupApi,
  type PopupOpeners,
} from './popupContext';
import { parseStack, stackSearch, type PopupRoute } from './routes';

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

/**
 * Stos popupów zapisany w adresie (PRD §4, `routes.ts`).
 *
 * - Otwarcie popupu dodaje wpis historii, więc Wstecz (przeglądarka, gest na telefonie) zamyka
 *   górny popup, a Dalej otwiera go ponownie.
 * - Zamknięcie z aplikacji (Esc, ←) cofa historię, jeśli popup otworzyła ta karta; przy popupie
 *   z linku albo po odświeżeniu nie ma czego cofać, więc wpis jest podmieniany (Wstecz nie
 *   wyprowadza wtedy z aplikacji ani nie otwiera popupu ponownie).
 * - × zamyka cały stos: cofa wszystkie wpisy dodane przez aplikację i czyści resztę z adresu.
 */
export function PopupRouter({ children }: { readonly children: ReactNode }) {
  const [search, setSearch] = useState(() => window.location.search);
  const stack = useMemo(() => parseStack(search), [search]);
  /** Po `history.go(-n)` z „zamknij wszystko”: wyczyść popupy z wpisu, na który wrócimy. */
  const clearAfterPop = useRef(false);
  const openerList = useRef<(Element | null)[]>([]);
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
      const current = parseStack(window.location.search);
      openers.remember(current.length, document.activeElement);
      const state: PopupHistoryState = { bgPopupDepth: currentDepth() + 1 };
      window.history.pushState(state, '', urlWith([...current, route]));
      setSearch(window.location.search);
    },
    [openers],
  );

  const back = useCallback(() => {
    const current = parseStack(window.location.search);
    if (current.length === 0) return;
    if (currentDepth() > 0) {
      window.history.back();
      return;
    }
    window.history.replaceState({ bgPopupDepth: 0 }, '', urlWith(current.slice(0, -1)));
    setSearch(window.location.search);
  }, []);

  const closeAll = useCallback(() => {
    if (parseStack(window.location.search).length === 0) return;
    const depth = currentDepth();
    if (depth > 0) {
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
      <PopupContext.Provider value={api}>{children}</PopupContext.Provider>
    </PopupOpenersContext.Provider>
  );
}
