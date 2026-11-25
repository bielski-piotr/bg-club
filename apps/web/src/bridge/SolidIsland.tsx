import { QueryClientContext } from '@tanstack/react-query';
import { useContext, useLayoutEffect, useRef } from 'react';
import type { Component } from 'solid-js';
import { AuthContext } from '../auth/authContext';
import { PopupContext, PopupLevelContext } from '../popups/popupContext';
import type { IslandHost } from '../solid/context';
import { mountIsland, type Island } from '../solid/island';
import { ToastContext } from '../ui/toastContext';

export interface SolidIslandProps<P extends object> {
  /** Komponent Solid; stała referencja (zmiana montuje wyspę od nowa). */
  readonly component: Component<P>;
  readonly props: P;
  readonly className?: string | undefined;
}

/** Konteksty Reacta, które wyspa dostaje jako konteksty Solid (`src/solid/context.ts`). */
function useIslandHost(): IslandHost {
  return {
    queryClient: useContext(QueryClientContext),
    auth: useContext(AuthContext) ?? undefined,
    popups: useContext(PopupContext) ?? undefined,
    popupLevel: useContext(PopupLevelContext) ?? undefined,
    toast: useContext(ToastContext) ?? undefined,
  };
}

/**
 * Komponent Solid 2.0 w drzewie Reacta na czas migracji (docs/solidjs-2-migration.md). Renderuje
 * zwykły blokowy `div` (masonry huba mierzy pierwsze dziecko slotu) i montuje w nim wyspę.
 * Po każdym renderze Reacta propsy i konteksty trafiają do wyspy jeszcze w fazie layoutu, więc
 * efekty `PopupHost` (fokus) widzą aktualny DOM.
 */
export function SolidIsland<P extends object>({
  component,
  props,
  className,
}: SolidIslandProps<P>) {
  const host = useIslandHost();
  const element = useRef<HTMLDivElement>(null);
  const island = useRef<Island<P> | null>(null);
  const latest = useRef({ props, host });

  // Najpierw aktualizacja (przy pierwszym renderze wyspy jeszcze nie ma), potem montowanie.
  useLayoutEffect(() => {
    latest.current = { props, host };
    island.current?.update(props, host);
  });

  useLayoutEffect(() => {
    const root = element.current;
    if (!root) return;
    const mounted = mountIsland(root, component, latest.current.props, latest.current.host);
    island.current = mounted;
    return () => {
      island.current = null;
      mounted.dispose();
    };
  }, [component]);

  return <div ref={element} className={className} />;
}
