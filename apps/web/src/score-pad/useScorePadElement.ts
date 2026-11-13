import { useEffect, useRef, useState } from 'react';
import { loadScorePadPart, type ScorePadPart } from './load';

export type ScorePadLoadState = 'loading' | 'ready' | 'error';

/**
 * Wspólna część adapterów: leniwie ładuje moduł, tworzy element w kontenerze i usuwa go
 * przy odmontowaniu lub zmianie wejścia. Usunięcie elementu ze strony wywołuje w nim
 * `destroy()` (`disconnectedCallback`): zatrzymuje animację i zwalnia kontekst WebGL.
 *
 * `create` dostaje świeży element (jeszcze poza stroną), ustawia mu opcje i nasłuch zdarzeń.
 * Zmiana `deps` tworzy element od nowa; motyw i obsługę zdarzeń adaptery aktualizują bez tego.
 */
export function useScorePadElement<E extends HTMLElement>(
  part: ScorePadPart,
  create: () => E,
  deps: readonly unknown[],
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<E | null>(null);
  const createRef = useRef(create);
  const [state, setState] = useState<ScorePadLoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    createRef.current = create;
  });

  useEffect(() => {
    let cancelled = false;
    let element: E | null = null;
    loadScorePadPart(part).then(
      () => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        element = createRef.current();
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
    };
    // `deps` to wejście elementu wybrane przez adapter; `attempt` wymusza ponowną próbę.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, attempt, ...deps]);

  const retry = () => {
    setState('loading');
    setAttempt((n) => n + 1);
  };

  return { hostRef, elementRef, state, retry };
}
