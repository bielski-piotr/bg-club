import type { JSX } from '@solidjs/web';
import { Errored, Loading, useContext } from 'solid-js';
import { t } from '../i18n';
import { QueryClientContext } from '../lib/queryClient';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Spinner } from '../ui/Spinner';
import './popups.css';

/** Wczytywanie treści popupu: spinner z etykietą dla czytnika ekranu. */
export function PopupLoading() {
  return (
    <div class="popup-loading">
      <Spinner size={24} label={t.popups.loading} />
    </div>
  );
}

/** Błąd wczytania treści popupu z ponowieniem. */
export function PopupLoadError(props: { readonly onRetry: () => void }) {
  return (
    <Banner
      variant="error"
      action={
        <Button size="sm" variant="secondary" icon="refresh" onClick={() => props.onRetry()}>
          {t.popups.retry}
        </Button>
      }
    >
      {t.popups.loadError}
    </Banner>
  );
}

interface QueryBoundaryProps {
  readonly children: JSX.Element;
  /** Zastępnik pierwszego wczytania; domyślnie spinner popupu. */
  readonly loading?: JSX.Element | undefined;
  /** Błąd wczytania; `retry` ponawia nieudane zapytania. Domyślnie baner popupu. */
  readonly error?: ((retry: () => void) => JSX.Element) | undefined;
}

/**
 * Granica danych z zapytań (`createQuery`): pierwsze wczytanie pokazuje `loading`, błąd bez
 * danych `error`. Późniejsze zmiany (inny klucz, odświeżenie) zostawiają treść na ekranie.
 * Ponowienie pobiera od nowa zapytania z błędem i odbudowuje treść.
 */
export function QueryBoundary(props: QueryBoundaryProps) {
  const queryClient = useContext(QueryClientContext);
  return (
    <Errored
      fallback={(_error, reset) => {
        const retry = () => {
          void queryClient.refetchQueries({ predicate: (query) => query.state.status === 'error' });
          reset();
        };
        return props.error ? props.error(retry) : <PopupLoadError onRetry={retry} />;
      }}
    >
      <Loading fallback={props.loading ?? <PopupLoading />}>{props.children}</Loading>
    </Errored>
  );
}
