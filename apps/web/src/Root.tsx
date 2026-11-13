import { lazy, Suspense } from 'react';
import { App } from './App';
import type { ConfigResult } from './config/env';

// Galeria komponentów jest ładowana leniwie, więc nie powiększa głównego pakietu.
const DesignSystemPage = lazy(() => import('./design-system/DesignSystemPage'));

interface RootProps {
  readonly config: ConfigResult;
  /** Bieżący adres to galeria komponentów (`/design-system`). */
  readonly designSystem: boolean;
}

/** Wybór widoku do czasu routingu z zadania [007]. */
export function Root({ config, designSystem }: RootProps) {
  if (designSystem) {
    return (
      <Suspense fallback={null}>
        <DesignSystemPage />
      </Suspense>
    );
  }
  return <App config={config} />;
}
