import { useContext } from 'solid-js';
import { t } from '../i18n';
import { PopupsContext } from './popupContext';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { PopupModal } from './PopupModal';

/** Popup pod nieznanym albo uszkodzonym adresem `?p=…`: czytelny stan zamiast pustego okna. */
export function InvalidPopup() {
  const popups = useContext(PopupsContext);
  return (
    <PopupModal title={t.popups.invalidTitle}>
      <EmptyState
        icon="alert"
        title={t.popups.invalidBody}
        action={
          <Button fullWidth onClick={() => popups.closeAll()}>
            {t.popups.backToClub}
          </Button>
        }
      />
    </PopupModal>
  );
}
