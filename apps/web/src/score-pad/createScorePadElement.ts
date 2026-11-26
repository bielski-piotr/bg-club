import { createEffect, createSignal, type Accessor } from 'solid-js';
import type { ResolvedTheme } from '../theme/theme';
import { loadScorePadPart, type ScorePadPart } from './load';

export type ScorePadLoadState = 'loading' | 'ready' | 'error';

/**
 * Wspólna część adapterów notesu (wersja Solid `useScorePadElement`): leniwie ładuje moduł,
 * tworzy element w kontenerze i usuwa go przy odmontowaniu lub zmianie wejścia. Usunięcie
 * elementu ze strony wywołuje w nim `destroy()` (`disconnectedCallback`): zatrzymuje animację
 * i zwalnia WebGL oraz nasłuchy.
 *
 * `input` to compute efektu: każda zmiana odczytanych w nim wartości tworzy element od nowa
 * (czyści kartkę), więc wejście musi być stabilne (dane z zapytania, memo). `create` działa
 * w fazie apply (bez śledzenia): dostaje świeży element poza stroną, ustawia mu opcje i nasłuchy.
 * Motyw zmienia się osobnym efektem, atrybutem, bez tworzenia elementu od nowa.
 */
export function createScorePadElement<E extends HTMLElement>(
  part: ScorePadPart,
  theme: Accessor<ResolvedTheme>,
  create: () => E,
  input: () => unknown,
) {
  let host: HTMLDivElement | undefined;
  let element: E | null = null;
  const [state, setState] = createSignal<ScorePadLoadState>('loading');
  const [attempt, setAttempt] = createSignal(0);

  createEffect(theme, (value) => {
    element?.setAttribute('theme', value);
  });

  createEffect(
    () => {
      input();
      return attempt();
    },
    () => {
      let cancelled = false;
      let created: E | null = null;
      loadScorePadPart(part).then(
        () => {
          if (cancelled || !host) return;
          created = create();
          created.setAttribute('theme', theme());
          element = created;
          host.append(created);
          setState('ready');
        },
        () => {
          if (!cancelled) setState('error');
        },
      );
      return () => {
        cancelled = true;
        created?.remove();
        if (element === created) element = null;
        // nowy element po zmianie wejścia ładuje się od nowa (spinner i aria-busy)
        setState('loading');
      };
    },
  );

  return {
    /** `ref` kontenera elementu. */
    hostRef: (el: HTMLDivElement) => {
      host = el;
    },
    /** Bieżący element albo `null` (jeszcze się ładuje). */
    element: () => element,
    state,
    retry: () => setAttempt((n) => n + 1),
  };
}
