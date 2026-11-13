import { useRef } from 'react';
import { useAuth } from '../auth/authContext';
import { t } from '../i18n';
import { PopupHost } from '../popups/PopupHost';
import type { PopupRoute } from '../popups/routes';
import type { Profile } from '../profile/profiles';
import { AppHeader } from './AppHeader';
import { HubPopup } from './HubPopup';
import { useClub } from './club';
import { useMasonry } from './useMasonry';
import {
  CollectionWidget,
  MeetingWidget,
  MembersWidget,
  RankingWidget,
  TimelineWidget,
} from './widgets';
import './Hub.css';

const MAIN_ID = 'hub-main';

const renderPopup = (route: PopupRoute) => <HubPopup route={route} />;

/**
 * Widok Klubu (PRD §4, DS §17): jedyny pełnoekranowy widok po zalogowaniu. Desktop: nagłówek
 * i dwie kolumny po 520 px (lewa: Spotkanie, Timeline, Członkowie; prawa: Ranking, Kolekcja).
 * Telefon: jedna kolumna w kolejności PRD. Popupy ze stosu w adresie są nad hubem.
 */
export function Hub({ me }: { readonly me: Profile }) {
  const { client } = useAuth();
  const club = useClub(client);
  const grid = useRef<HTMLDivElement>(null);
  useMasonry(grid);

  return (
    <PopupHost renderPopup={renderPopup} fallbackFocusId={MAIN_ID}>
      <div className="hub">
        <AppHeader club={club.isPending ? undefined : (club.data ?? null)} me={me} />
        <main id={MAIN_ID} className="hub__main" tabIndex={-1} aria-label={t.hub.widgetsLabel}>
          <div ref={grid} className="hub__grid">
            <div className="hub__slot hub__slot--left">
              <MeetingWidget />
            </div>
            <div className="hub__slot hub__slot--right">
              <RankingWidget />
            </div>
            <div className="hub__slot hub__slot--left">
              <TimelineWidget />
            </div>
            <div className="hub__slot hub__slot--right">
              <CollectionWidget />
            </div>
            <div className="hub__slot hub__slot--left">
              <MembersWidget me={me} />
            </div>
          </div>
        </main>
      </div>
    </PopupHost>
  );
}
