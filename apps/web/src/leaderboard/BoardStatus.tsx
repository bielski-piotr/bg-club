import type { JSX } from '@solidjs/web';
import { Loading } from 'solid-js';
import { t } from '../i18n';
import { QueryBoundary } from '../popups/QueryStatus';
import { Banner, Button, Skeleton, Spinner } from '../ui';

/** Stany rankingu wspólne dla widżetu i popupu: błąd z ponowieniem i wczytywanie. */
export function BoardError(props: { readonly onRetry: () => void }) {
  return (
    <Banner
      variant="error"
      class="leaderboard-error"
      action={
        <Button size="sm" variant="secondary" icon="refresh" onClick={() => props.onRetry()}>
          {t.hub.retry}
        </Button>
      }
    >
      {t.hub.loadError}
    </Banner>
  );
}

export function BoardLoading() {
  return (
    <div class="leaderboard leaderboard--loading">
      <Skeleton width={240} height={120} radius={14} />
      <Spinner label={t.leaderboard.loading} class="sr-only" />
    </div>
  );
}

/**
 * Granica danych rankingu (`createBoardData`): szkielet przy pierwszym wczytaniu i po zmianie
 * `on` (zakładka: poprzedni wynik ma jednostki innej klasyfikacji), błąd bez danych z ponowieniem.
 * Zmiana filtrów w tej samej zakładce zostawia poprzedni wynik do czasu nowego.
 */
export function BoardBoundary(props: {
  readonly on?: unknown;
  /** Baner błędu; domyślnie `BoardError`. */
  readonly error?: ((retry: () => void) => JSX.Element) | undefined;
  readonly children: JSX.Element;
}) {
  return (
    <QueryBoundary
      loading={<BoardLoading />}
      error={(retry) => (props.error ? props.error(retry) : <BoardError onRetry={retry} />)}
    >
      <Loading fallback={<BoardLoading />} on={props.on}>
        {props.children}
      </Loading>
    </QueryBoundary>
  );
}
