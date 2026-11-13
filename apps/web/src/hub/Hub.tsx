import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FirstRun } from '../club/FirstRun';
import { t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupHost } from '../popups/PopupHost';
import type { PopupRoute } from '../popups/routes';
import type { Profile } from '../profile/profiles';
import { Banner, Button, Spinner } from '../ui';
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

/**
 * Widok Klubu (PRD §4, DS §17): jedyny pełnoekranowy widok po zalogowaniu. Desktop: nagłówek
 * i dwie kolumny po 520 px (lewa: Spotkanie, Timeline, Członkowie; prawa: Ranking, Kolekcja).
 * Telefon: jedna kolumna w kolejności PRD. Przed założeniem klubu zamiast widżetów jest
 * pierwsze uruchomienie (CLUB-1, CLUB-3). Popupy ze stosu w adresie są nad hubem.
 */
export function Hub({ me }: { readonly me: OwnProfile }) {
  const { client } = useAuth();
  const club = useClub(client);
  usePasswordSuggestion(me);
  const renderPopup = useCallback((route: PopupRoute) => <HubPopup route={route} me={me} />, [me]);
  // Dane klubu mają pierwszeństwo przed błędem: nieudane ponowne pobranie nie chowa widżetów.
  const loaded = club.data !== undefined;
  const firstRun = club.data === null;

  return (
    <PopupHost renderPopup={renderPopup} fallbackFocusId={MAIN_ID}>
      <div className={firstRun ? 'hub hub--first-run' : 'hub'}>
        <AppHeader
          club={loaded ? (club.data ?? 'none') : club.isError ? null : undefined}
          me={me}
        />
        <main
          id={MAIN_ID}
          className="hub__main"
          tabIndex={-1}
          aria-label={firstRun ? undefined : t.hub.widgetsLabel}
        >
          {loaded ? (
            firstRun ? (
              <FirstRun isAdmin={me.role === 'admin'} />
            ) : (
              <Widgets me={me} />
            )
          ) : club.isError ? (
            <Banner
              variant="error"
              className="hub__error"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  onClick={() => void club.refetch()}
                >
                  {t.hub.retry}
                </Button>
              }
            >
              {t.club.loadError}
            </Banner>
          ) : (
            <div className="hub__status">
              <Spinner size={24} label={t.club.loading} />
            </div>
          )}
        </main>
      </div>
    </PopupHost>
  );
}

/**
 * Pierwsze logowanie kontem z wygenerowanym hasłem (AUTH-6): raz na wczytanie aplikacji, gdy nad
 * hubem nie ma popupów, otwiera propozycję własnego hasła. „Pomiń” zapisuje rezygnację w profilu,
 * a zamknięcie (×, Esc) tylko odkłada propozycję do kolejnego uruchomienia.
 */
function usePasswordSuggestion(me: OwnProfile) {
  const { stack, open } = usePopups();
  const shown = useRef(false);
  const suggest = me.password_change_suggested && stack.length === 0;
  useEffect(() => {
    if (!suggest || shown.current) return;
    shown.current = true;
    open({ kind: 'first-login' });
  }, [suggest, open]);
}

/** Pięć widżetów w kolejności PRD §4; każdy ma własny pusty stan (CLUB-4). */
function Widgets({ me }: { readonly me: Profile }) {
  const grid = useRef<HTMLDivElement>(null);
  useMasonry(grid);
  return (
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
  );
}
