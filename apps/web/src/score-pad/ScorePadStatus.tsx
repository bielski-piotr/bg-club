import { Match, Switch } from 'solid-js';
import { t } from '../i18n';
import { Banner, Button, Spinner } from '../ui';
import type { ScorePadLoadState } from './createScorePadElement';

/** Nakładka na czas ładowania modułu albo komunikat błędu z ponowieniem. */
export function ScorePadStatus(props: {
  readonly state: ScorePadLoadState;
  readonly loadingLabel: string;
  readonly onRetry: () => void;
}) {
  return (
    <Switch>
      <Match when={props.state === 'error'}>
        <div class="score-pad-view__status">
          <Banner
            variant="error"
            action={
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => props.onRetry()}>
                {t.scorePad.retry}
              </Button>
            }
          >
            {t.scorePad.loadError}
          </Banner>
        </div>
      </Match>
      <Match when={props.state === 'loading'}>
        <div class="score-pad-view__status">
          <Spinner size={24} label={props.loadingLabel} />
        </div>
      </Match>
    </Switch>
  );
}
