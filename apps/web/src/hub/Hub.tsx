import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FirstRun } from '../club/FirstRun';
import { t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupHost } from '../popups/PopupHost';
import type { PopupRoute } from '../popups/routes';
import type { Profile } from '../react-shared/profiles';
import { importOrReload } from '../pwa/staleChunk';
import { Banner, Button, Spinner } from '../ui';
import { AppHeader } from './AppHeader';
import { PopupErrorBoundary } from './PopupErrorBoundary';
import { useClub } from './club';
import { useMasonry } from './useMasonry';
import { SolidIsland } from '../bridge/SolidIsland';
import { MembersWidget } from '../members/MembersWidget';
import { RankingWidget } from '../leaderboard/RankingWidget';
import { CollectionWidget } from '../games/CollectionWidget';
import { MeetingWidget, TimelineWidget } from './widgets';
import './Hub.css';

// Popupy huba (z edytorem notesów, formularzami i statystykami) są osobnym fragmentem pakietu:
// widok Klubu nie czeka na nie przy starcie (NFR-2). Fragment jest pobierany zaraz po
// wyświetleniu huba (`usePrefetchPopups`), więc otwarcie popupu zwykle nie czeka na sieć.
const loadHubPopup = () => import('./HubPopup');
// Po wdrożeniu karta ze starym pakietem nie znajdzie fragmentu: przeładowujemy ją raz
// (src/pwa/staleChunk.ts), a gdy to nie pomoże, granica błędu pokazuje komunikat.
const HubPopup = lazy(importOrReload(() => loadHubPopup().then((m) => ({ default: m.HubPopup }))));

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
  usePrefetchPopups();
  const renderPopup = useCallback(
    (route: PopupRoute) => <LazyHubPopup route={route} me={me} />,
    [me],
  );
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
 * Pierwsze logowanie kontem z wygenerowanym hasłem (AUTH-6): przy wejściu do aplikacji bez
 * popupów w adresie otwiera propozycję własnego hasła. Wejście z linku do popupu jej nie
 * przerywa (ani po jego zamknięciu). „Pomiń” zapisuje rezygnację w profilu, a zamknięcie (×, Esc)
 * tylko odkłada propozycję do kolejnego uruchomienia.
 */
function usePasswordSuggestion(me: OwnProfile) {
  const { stack, open } = usePopups();
  // Decyzja zapada raz, przy pierwszym renderze huba.
  const [suggest] = useState(() => me.password_change_suggested && stack.length === 0);
  // Ref chroni przed podwójnym otwarciem, gdy StrictMode uruchamia efekt drugi raz.
  const opened = useRef(false);
  useEffect(() => {
    if (!suggest || opened.current) return;
    opened.current = true;
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
        <MeetingWidget me={me} />
      </div>
      <div className="hub__slot hub__slot--right">
        {/* Solid 2.0 (docs/solidjs-2-migration.md, etap 4). */}
        <SolidIsland component={RankingWidget} props={{ me }} />
      </div>
      <div className="hub__slot hub__slot--left">
        <TimelineWidget />
      </div>
      <div className="hub__slot hub__slot--right">
        {/* Solid 2.0 (docs/solidjs-2-migration.md, etap 5a). */}
        <SolidIsland component={CollectionWidget} props={{ isAdmin: me.role === 'admin' }} />
      </div>
      <div className="hub__slot hub__slot--left">
        {/* Solid 2.0 (docs/solidjs-2-migration.md, etap 2). */}
        <SolidIsland component={MembersWidget} props={{ me }} />
      </div>
    </div>
  );
}

/**
 * Popup z leniwie ładowanego fragmentu. Gdy fragment jeszcze nie dotarł, `PopupHost` nie ma
 * dokąd przenieść fokusu; po wczytaniu przenosimy go do najwyższego okna (NFR-6).
 */
function LazyHubPopup({ route, me }: { readonly route: PopupRoute; readonly me: OwnProfile }) {
  const suspendedRef = useRef(false);
  return (
    <PopupErrorBoundary>
      <Suspense fallback={<PopupLoading suspendedRef={suspendedRef} />}>
        <HubPopup route={route} me={me} />
        <FocusWhenLoaded suspendedRef={suspendedRef} />
      </Suspense>
    </PopupErrorBoundary>
  );
}

function FocusWhenLoaded({ suspendedRef }: { readonly suspendedRef: RefObject<boolean> }) {
  useLayoutEffect(() => {
    if (!suspendedRef.current) return;
    suspendedRef.current = false;
    // Użytkownik zdążył przejść do innego okna: nie zabieramy mu fokusu.
    if (document.activeElement?.closest('[role="dialog"]')) return;
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"][data-popup-level]'),
    ];
    const level = (el: HTMLElement) => Number(el.dataset.popupLevel);
    dialogs
      .sort((a, b) => level(a) - level(b))
      .at(-1)
      ?.focus({ preventScroll: true });
  }, [suspendedRef]);
  return null;
}

/** Zastępnik popupu na czas pobierania fragmentu (zwykle niewidoczny dzięki prefetchowi). */
function PopupLoading({ suspendedRef }: { readonly suspendedRef: RefObject<boolean> }) {
  useEffect(() => {
    suspendedRef.current = true;
  }, [suspendedRef]);
  return (
    <div className="hub__popup-loading">
      <Spinner size={24} label={t.hub.popupLoading} />
    </div>
  );
}

/** Pobiera fragment popupów w czasie bezczynności po pierwszym wyświetleniu huba. */
function usePrefetchPopups() {
  useEffect(() => {
    const prefetch = () => void loadHubPopup().catch(() => undefined);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 1500);
    return () => clearTimeout(id);
  }, []);
}
