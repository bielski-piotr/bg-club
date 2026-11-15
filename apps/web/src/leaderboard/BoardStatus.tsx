import { t } from '../i18n';
import { Banner, Button, Skeleton, Spinner } from '../ui';

/** Stany rankingu wspólne dla widżetu i popupu: błąd z ponowieniem i wczytywanie. */
export function BoardError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Banner
      variant="error"
      className="leaderboard-error"
      action={
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
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
    <div className="leaderboard leaderboard--loading">
      <Skeleton width={240} height={120} radius={14} />
      <Spinner label={t.leaderboard.loading} className="sr-only" />
    </div>
  );
}
