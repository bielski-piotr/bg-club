import { t } from '../i18n';
import { Button, EmptyState } from '../ui';
import { usePopups } from './popupContext';
import { PopupModal } from './PopupModal';

/** Popup pod nieznanym albo uszkodzonym adresem `?p=…`: czytelny stan zamiast pustego okna. */
export function InvalidPopup() {
  const { closeAll } = usePopups();
  return (
    <PopupModal title={t.popups.invalidTitle}>
      <EmptyState
        icon="alert"
        title={t.popups.invalidBody}
        action={
          <Button fullWidth onClick={closeAll}>
            {t.popups.backToClub}
          </Button>
        }
      />
    </PopupModal>
  );
}
