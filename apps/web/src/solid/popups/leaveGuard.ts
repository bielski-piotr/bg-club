import { createEffect, createMemo, onSettled, useContext, type Accessor } from 'solid-js';
import type { LeaveGuard } from '../../popups/popupContext';
import { PopupGuardsContext, PopupLevelContext } from '../context';

/**
 * Chroni bieżący popup przed zamknięciem (Esc, ←, ×, tło, Wstecz w przeglądarce), dopóki
 * `guard()` nie jest `null` (wersja Solid `useLeaveGuard`). Ochrona dostaje `leave`, które
 * zamyka popup mimo to (np. po potwierdzeniu „Odrzuć zmiany”). Przy aktywnej ochronie
 * zamknięcie lub odświeżenie karty pokazuje też pytanie przeglądarki (`beforeunload`).
 *
 * `release` zdejmuje ochronę od razu: popup wywołuje je tuż przed zamknięciem, którego nie
 * trzeba potwierdzać (np. po zapisie).
 */
export function createLeaveGuard(guard: Accessor<LeaveGuard | null>): {
  readonly release: () => void;
} {
  const level = useContext(PopupLevelContext);
  const guards = useContext(PopupGuardsContext);
  const active = createMemo(() => guard() !== null);
  let released = false;

  createEffect(
    () => active(),
    (isActive) => {
      if (!isActive) return;
      released = false;
      const at = level.level;
      guards.set(at, (leave) => {
        // Ochronę czytamy przy próbie zamknięcia, więc zawsze jest aktualna.
        const current = released ? null : guard();
        if (current) current(leave);
        else leave();
      });
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault();
        // Starsze przeglądarki (np. WebView) pytają tylko przy ustawionym `returnValue`.
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => {
        guards.set(at, null);
        window.removeEventListener('beforeunload', onBeforeUnload);
      };
    },
  );

  return {
    release: () => {
      released = true;
      guards.set(level.level, null);
    },
  };
}

/**
 * Czy komponent jest nadal zamontowany (wersja Solid `useMounted`). Dialog zamknięty w trakcie
 * żądania jest odmontowany: po sukcesie nie cofamy wtedy historii drugi raz.
 */
export function createMounted(): Accessor<boolean> {
  let mounted = true;
  onSettled(() => () => {
    mounted = false;
  });
  return () => mounted;
}
