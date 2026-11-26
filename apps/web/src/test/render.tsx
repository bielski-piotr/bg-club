import type { JSX } from '@solidjs/web';
import { render } from '@solidjs/testing-library';
import type { QueryClient } from '@tanstack/query-core';
import { flush } from 'solid-js';
import { AuthContext, type AuthContextValue } from '../auth/authContext';
import { QueryClientContext } from '../lib/queryClient';
import {
  PopupGuardsContext,
  PopupLevelContext,
  PopupsContext,
  type PopupApi,
  type PopupGuards,
  type PopupLevel,
} from '../popups/popupContext';
import { ToastContext, type ToastApi } from '../ui/toastContext';

/** Wartości kontekstów w teście; brak pola = brak dostawcy (np. komponent poza popupem). */
export interface TestHost {
  readonly queryClient?: QueryClient | undefined;
  readonly auth?: AuthContextValue | undefined;
  readonly popups?: PopupApi | undefined;
  readonly popupLevel?: PopupLevel | undefined;
  readonly popupGuards?: PopupGuards | undefined;
  readonly toast?: ToastApi | undefined;
}

/*
 * Dostawca z wartością `undefined` działa jak jego brak (`ContextNotFoundError` przy
 * `useContext`), stąd rzutowania na typ kontekstu.
 */
type Provided<K extends keyof TestHost> = NonNullable<TestHost[K]>;

/** Render komponentu w teście z kontekstami z `host` (zamiast pełnej powłoki aplikacji). */
export function renderWithProviders(
  ui: () => JSX.Element,
  host: TestHost = {},
): ReturnType<typeof render> {
  return render(() => (
    <QueryClientContext value={host.queryClient as Provided<'queryClient'>}>
      <AuthContext value={host.auth as Provided<'auth'>}>
        <PopupsContext value={host.popups as Provided<'popups'>}>
          <PopupLevelContext value={host.popupLevel as Provided<'popupLevel'>}>
            <PopupGuardsContext value={host.popupGuards as Provided<'popupGuards'>}>
              <ToastContext value={host.toast as Provided<'toast'>}>{ui()}</ToastContext>
            </PopupGuardsContext>
          </PopupLevelContext>
        </PopupsContext>
      </AuthContext>
    </QueryClientContext>
  ));
}

/**
 * Zmiana spoza komponentu (zdarzenie Auth, zapis sklepu) i jej skutki w DOM: po `fn` stosuje
 * zapisy (`flush`). Zwykła funkcja działa od razu; obietnica – po jej rozstrzygnięciu.
 */
export function act(fn: () => unknown): Promise<void> {
  const result = fn();
  if (result instanceof Promise) {
    return result.then(async () => {
      flush();
      await Promise.resolve();
      flush();
    });
  }
  flush();
  return Promise.resolve();
}
