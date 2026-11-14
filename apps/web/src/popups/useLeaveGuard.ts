import { useCallback, useEffect, useRef } from 'react';
import { usePopupGuards, usePopupLevel, type LeaveGuard } from './popupContext';

/**
 * Chroni bieżący popup przed zamknięciem (Esc, ←, ×, tło, Wstecz w przeglądarce), dopóki
 * `guard` nie jest `null`. Ochrona dostaje `leave`, które zamyka popup mimo to (np. po
 * potwierdzeniu „Odrzuć zmiany”). Przy aktywnej ochronie zamknięcie lub odświeżenie karty
 * pokazuje też pytanie przeglądarki (`beforeunload`).
 *
 * `release` zdejmuje ochronę od razu, bez czekania na render: popup wywołuje je tuż przed
 * zamknięciem, którego nie trzeba potwierdzać (np. po zapisie).
 */
export function useLeaveGuard(guard: LeaveGuard | null): { readonly release: () => void } {
  const { level } = usePopupLevel();
  const guards = usePopupGuards();
  const latest = useRef(guard);
  const active = guard !== null;

  useEffect(() => {
    latest.current = guard;
  });

  useEffect(() => {
    if (!active) return;
    guards.set(level, (leave) => {
      const current = latest.current;
      if (current) current(leave);
      else leave();
    });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      guards.set(level, null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [active, guards, level]);

  const release = useCallback(() => {
    latest.current = null;
    guards.set(level, null);
  }, [guards, level]);

  return { release };
}
