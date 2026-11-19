import { t } from '../i18n';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import { pwa, useOnline, usePwa, type PwaStore } from './updates';
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
export function AppStatus({ store = pwa }: AppStatusProps) {
  const online = useOnline();
  const { update, draftBusy } = usePwa(store);
  const showUpdate = update !== 'none';
  if (online && !showUpdate) return null;
  return (
    <div className="app-status">
      {online ? null : (
        <div className="toast app-status__item" role="status">
          <Icon name="alert" className="toast__icon app-status__alert" />
          <span className="toast__message">{text.offline}</span>
        </div>
      )}
      {showUpdate ? (
        <div className={cx('toast', 'app-status__item')} role="status">
          <Icon name="refresh" className="toast__icon" />
          <span className="toast__message">
            {update === 'activated' ? text.activated : text.available}
            {draftBusy ? <span className="app-status__note">{text.waitForDraft}</span> : null}
          </span>
          <button
            type="button"
            className="app-status__action"
            disabled={draftBusy || update === 'applying'}
            aria-busy={update === 'applying' || undefined}
            onClick={() => store.apply()}
          >
            {text.reload}
          </button>
        </div>
      ) : null}
    </div>
  );
}
