import { Show } from 'solid-js';
import { t } from '../i18n';
import { Icon } from '../ui/Icon';
import { createOnline, createPwa, pwa, type PwaStore } from './updates';
import './AppStatus.css';

const text = t.pwa;

export interface AppStatusProps {
  readonly store?: PwaStore | undefined;
}

/**
 * Stały stan aplikacji nad toastami (standardowy ciemny toast): brak połączenia
 * i nowa wersja. Bez sieci aplikacja nie udaje pracy offline: mówi, że potrzebuje internetu,
 * a wpisy notesu czekają na tym urządzeniu. „Odśwież” jest wstrzymane, póki otwarty
 * notes ma wpisy, których nie ma jeszcze w bazie.
 */
export function AppStatus(props: AppStatusProps) {
  const store = () => props.store ?? pwa;
  const online = createOnline();
  const state = createPwa(store);
  const showUpdate = () => state().update !== 'none';
  return (
    <Show when={!online() || showUpdate()}>
      <div class="app-status">
        <Show when={!online()}>
          <div class="toast app-status__item" role="status">
            <Icon name="alert" class="toast__icon app-status__alert" />
            <span class="toast__message">{text.offline}</span>
          </div>
        </Show>
        <Show when={showUpdate()}>
          <div class="toast app-status__item" role="status">
            <Icon name="refresh" class="toast__icon" />
            <span class="toast__message">
              {state().update === 'activated' ? text.activated : text.available}
              <Show when={state().draftBusy}>
                <span class="app-status__note">{text.waitForDraft}</span>
              </Show>
            </span>
            <button
              type="button"
              class="app-status__action"
              disabled={state().draftBusy || state().update === 'applying'}
              aria-busy={state().update === 'applying' ? 'true' : undefined}
              onClick={() => store().apply()}
            >
              {text.reload}
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
}
