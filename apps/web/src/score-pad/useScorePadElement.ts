import { useEffect, useRef, useState } from 'react';
import type { ResolvedTheme } from '../theme/theme';
import { loadScorePadPart, type ScorePadPart } from './load';

export type ScorePadLoadState = 'loading' | 'ready' | 'error';

/**
 * Wspólna część adapterów: leniwie ładuje moduł, tworzy element w kontenerze i usuwa go
 * przy odmontowaniu lub zmianie wejścia. Usunięcie elementu ze strony wywołuje w nim
 * `destroy()` (`disconnectedCallback`): zatrzymuje animację i zwalnia WebGL oraz nasłuchy.
 *
 * `create` dostaje świeży element (jeszcze poza stroną), ustawia mu opcje i nasłuch zdarzeń.
 * Zmiana `deps` (porównanie referencji) tworzy element od nowa, czyli czyści kartkę: wejście
 * musi być stabilne (np. dane z zapytania, `useMemo`). Motyw zmienia się bez tego, atrybutem.
 */
export function useScorePadElement<E extends HTMLElement>(
  part: ScorePadPart,
  theme: ResolvedTheme,
  create: () => E,
  deps: readonly unknown[],
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<E | null>(null);
  const createRef = useRef(create);
  const themeRef = useRef(theme);
  const [state, setState] = useState<ScorePadLoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    createRef.current = create;
  });

  useEffect(() => {
    themeRef.current = theme;
    elementRef.current?.setAttribute('theme', theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    let element: E | null = null;
    loadScorePadPart(part).then(
      () => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        element = createRef.current();
        element.setAttribute('theme', themeRef.current);
        elementRef.current = element;
        host.append(element);
        setState('ready');
      },
      () => {
        if (!cancelled) setState('error');
      },
    );
    return () => {
      cancelled = true;
      element?.remove();
      elementRef.current = null;
      // nowy element po zmianie wejścia ładuje się od nowa (spinner i aria-busy)
      setState('loading');
    };
    // `deps` to wejście elementu wybrane przez adapter; `attempt` wymusza ponowną próbę.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, attempt, ...deps]);

  const retry = () => setAttempt((n) => n + 1);

  return { hostRef, elementRef, state, retry };
}
