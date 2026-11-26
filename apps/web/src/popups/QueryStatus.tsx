import { Show } from 'solid-js';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Spinner } from '../ui/Spinner';
import './popups.css';

interface QueryStatusProps {
  readonly isError: boolean;
  readonly onRetry: () => void;
}

/** Stan zapytania w popupie: wczytywanie (spinner z etykietą) albo błąd z ponowieniem. */
export function QueryStatus(props: QueryStatusProps) {
  return (
    <Show
      when={props.isError}
      fallback={
        <div class="popup-loading">
          <Spinner size={24} label={t.popups.loading} />
        </div>
      }
    >
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
    </Show>
  );
}
