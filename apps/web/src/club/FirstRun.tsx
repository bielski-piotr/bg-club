import { t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { Button } from '../ui';
import { FirstRunIllustration } from './FirstRunIllustration';
import './club.css';

/**
 * Pierwsze uruchomienie na pustej bazie (CLUB-1, CLUB-3, DS §17): zamiast widżetów ilustracja,
 * powitanie i dla administratora przycisk „Dodaj klub”. Gracz widzi tę samą ilustrację bez
 * przycisku. Tytuł jest nagłówkiem strony (nagłówek aplikacji nie ma jeszcze nazwy klubu).
 */
export function FirstRun({ isAdmin }: { readonly isAdmin: boolean }) {
  const { open } = usePopups();
  const text = t.club.firstRun;
  return (
    <div className="first-run">
      <FirstRunIllustration className="first-run__art" />
      <h1 className="first-run__title">{isAdmin ? text.adminTitle : text.playerTitle}</h1>
      <p className="first-run__text">{isAdmin ? text.adminText : text.playerText}</p>
      {isAdmin ? (
        <div className="first-run__action">
          <Button icon="plus" onClick={() => open({ kind: 'club' })}>
            {text.add}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
