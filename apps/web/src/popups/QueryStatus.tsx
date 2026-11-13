import { t } from '../i18n';
import { Banner, Button, Spinner } from '../ui';
import './popups.css';

interface QueryStatusProps {
  readonly isError: boolean;
  readonly onRetry: () => void;
}

/** Stan zapytania w popupie: wczytywanie (spinner z etykietą) albo błąd z ponowieniem. */
export function QueryStatus({ isError, onRetry }: QueryStatusProps) {
  if (isError) {
    return (
      <Banner
        variant="error"
        action={
          <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
            {t.popups.retry}
          </Button>
        }
      >
        {t.popups.loadError}
      </Banner>
    );
  }
  return (
    <div className="popup-loading">
      <Spinner size={24} label={t.popups.loading} />
    </div>
  );
}
