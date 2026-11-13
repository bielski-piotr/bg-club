import { t } from '../i18n';
import { Banner, Button, Spinner } from '../ui';
import type { ScorePadLoadState } from './useScorePadElement';

interface ScorePadStatusProps {
  readonly state: ScorePadLoadState;
  readonly loadingLabel: string;
  readonly onRetry: () => void;
}

/** Nakładka na czas ładowania modułu albo komunikat błędu z ponowieniem. */
export function ScorePadStatus({ state, loadingLabel, onRetry }: ScorePadStatusProps) {
  if (state === 'ready') return null;
  if (state === 'error') {
    return (
      <div className="score-pad-view__status">
        <Banner
          variant="error"
          action={
            <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
              {t.scorePad.retry}
            </Button>
          }
        >
          {t.scorePad.loadError}
        </Banner>
      </div>
    );
  }
  return (
    <div className="score-pad-view__status">
      <Spinner size={24} label={loadingLabel} />
    </div>
  );
}
