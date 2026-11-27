import type { JSX } from '@solidjs/web';
import { Errored, Loading, Match, onSettled, Switch, lazy, useContext } from 'solid-js';
import { showsAdminTools, type OwnProfile } from '../auth/ownProfile';
import { AppHeader } from '../club/AppHeader';
import { ClubHeading } from '../club/ClubHeading';
import { createClub } from '../club/clubData';
import { FirstRun } from '../club/FirstRun';
import { CollectionWidget } from '../games/CollectionWidget';
import { t } from '../i18n';
import { RankingWidget } from '../leaderboard/RankingWidget';
import { MeetingWidget } from '../meetings/MeetingWidget';
import { TimelineWidget } from '../meetings/TimelineWidget';
import { MembersWidget } from '../members/MembersWidget';
import { PopupsContext } from '../popups/popupContext';
import { PopupHost } from '../popups/PopupHost';
import type { PopupRoute } from '../popups/routes';
import { importOrReload } from '../pwa/staleChunk';
import { Banner, Button, Spinner } from '../ui';
import { masonry } from './masonry';
import './Hub.css';

// Popupy huba (z edytorem notesów, formularzami i statystykami) są osobnym fragmentem pakietu:
// widok Klubu nie czeka na nie przy starcie. Fragment jest pobierany zaraz po
// wyświetleniu huba (`prefetchPopups`), więc otwarcie popupu zwykle nie czeka na sieć.
const loadHubPopup = () => import('./HubPopup');
// Po wdrożeniu karta ze starym pakietem nie znajdzie fragmentu: przeładowujemy ją raz
// (src/pwa/staleChunk.ts), a gdy to nie pomoże, granica błędu pokazuje komunikat.
const HubPopup = lazy(importOrReload(() => loadHubPopup().then((m) => ({ default: m.HubPopup }))));
// The profile and settings pages are separate chunks too: the Club view doesn't wait for them.
const ProfilePage = lazy(
  importOrReload(() => import('../profile/ProfilePage').then((m) => ({ default: m.ProfilePage }))),
);
const SettingsPage = lazy(
  importOrReload(() =>
    import('../profile/SettingsPage').then((m) => ({ default: m.SettingsPage })),
  ),
);

const MAIN_ID = 'hub-main';

/**
 * Club view: the only full-page view after sign-in. Desktop: header and two equal columns
 * (left: Meeting, Timeline, Members; right: Ranking, Collection).
 * Telefon: jedna kolumna w tej samej kolejności. Przed założeniem klubu zamiast widżetów jest
 * pierwsze uruchomienie. Popupy ze stosu w adresie są nad hubem.
 */
export function Hub(props: { readonly me: OwnProfile }) {
  const club = createClub();
  const popups = useContext(PopupsContext);
  // Pierwsze logowanie kontem z wygenerowanym hasłem: przy wejściu do aplikacji bez
  // popupów w adresie otwiera propozycję własnego hasła. Wejście z linku do popupu jej nie
  // przerywa (ani po jego zamknięciu). „Pomiń” zapisuje rezygnację w profilu, a zamknięcie
  // (×, Esc) tylko odkłada propozycję do kolejnego uruchomienia. Decyzja zapada raz, po
  // wyświetleniu huba.
  onSettled(() => {
    if (props.me.password_change_suggested && popups.stack.length === 0) {
      popups.open({ kind: 'first-login' });
    }
  });
  onSettled(prefetchPopups);
  // Powłoka huba nie czeka na klub (cache i stan zapytania bez zawieszania); widżety mają własne
  // granice danych. Dane klubu mają pierwszeństwo przed błędem: nieudane ponowne pobranie nie
  // chowa widżetów.
  const loaded = () => club.current() !== undefined;
  const firstRun = () => club.current() === null;
  const failed = () => !loaded() && club.state()?.isError === true;
  const isAdmin = () => showsAdminTools(props.me);
  const profileId = () => (popups.page.kind === 'profile' ? popups.page.id : null);

  return (
    <PopupHost
      renderPopup={(route) => <LazyHubPopup route={route} me={props.me} />}
      fallbackFocusId={MAIN_ID}
    >
      <div class={['hub', { 'hub--first-run': firstRun() }]}>
        <AppHeader bare={firstRun()} me={props.me} />
        <main
          id={MAIN_ID}
          class="hub__main"
          tabindex={-1}
          aria-label={popups.page.kind === 'club' && !firstRun() ? t.hub.widgetsLabel : undefined}
        >
          <Switch
            fallback={
              <div class="hub__status">
                <Spinner size={24} label={t.club.loading} />
              </div>
            }
          >
            {/* Another profile is a new page: its filters and scroll position start over. */}
            <Match when={profileId()} keyed>
              {(id) => (
                <PageBoundary>
                  <ProfilePage id={id} me={props.me} />
                </PageBoundary>
              )}
            </Match>
            <Match when={popups.page.kind === 'settings'}>
              <PageBoundary>
                <SettingsPage me={props.me} />
              </PageBoundary>
            </Match>
            <Match when={firstRun()}>
              {/* Setting up the club is the admin's first task, so the admin view doesn't hide it. */}
              <FirstRun isAdmin={props.me.role === 'admin'} />
            </Match>
            <Match when={club.current()}>
              {(current) => (
                <>
                  <ClubHeading club={current()} isAdmin={isAdmin()} />
                  <Widgets me={props.me} />
                </>
              )}
            </Match>
            <Match when={failed()}>
              <Banner
                variant="error"
                class="hub__error"
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
            </Match>
          </Switch>
        </main>
      </div>
    </PopupHost>
  );
}

/** A lazily loaded page: a spinner while its chunk downloads, the reload banner if it fails. */
function PageBoundary(props: { readonly children: JSX.Element }) {
  return (
    <Errored fallback={<PopupError />}>
      <Loading
        fallback={
          <div class="hub__status">
            <Spinner size={24} label={t.hub.popupLoading} />
          </div>
        }
      >
        {props.children}
      </Loading>
    </Errored>
  );
}

/** Pięć widżetów w kolejności; każdy ma własny pusty stan. */
function Widgets(props: { readonly me: OwnProfile }) {
  let grid: HTMLDivElement | undefined;
  onSettled(() => (grid ? masonry(grid) : undefined));
  return (
    <div ref={(el) => (grid = el)} class="hub__grid">
      <div class="hub__slot hub__slot--left">
        <MeetingWidget me={props.me} />
      </div>
      <div class="hub__slot hub__slot--right">
        <RankingWidget me={props.me} />
      </div>
      <div class="hub__slot hub__slot--left">
        <TimelineWidget />
      </div>
      <div class="hub__slot hub__slot--right">
        <CollectionWidget isAdmin={showsAdminTools(props.me)} />
      </div>
      <div class="hub__slot hub__slot--left">
        <MembersWidget me={props.me} />
      </div>
    </div>
  );
}

/**
 * Popup z leniwie ładowanego fragmentu. Gdy fragment jeszcze nie dotarł, `PopupHost` nie ma
 * dokąd przenieść fokusu; po wczytaniu przenosimy go do najwyższego okna. Błąd
 * wczytania (np. stary pakiet po wdrożeniu, gdy przeładowanie nie pomogło) zostaje w popupie:
 * hub jest widoczny, a nad nim komunikat z przeładowaniem strony.
 */
function LazyHubPopup(props: { readonly route: PopupRoute; readonly me: OwnProfile }) {
  let suspended = false;
  return (
    <Errored fallback={<PopupError />}>
      <Loading
        fallback={
          <PopupLoading
            onShown={() => {
              suspended = true;
            }}
          />
        }
      >
        <HubPopup route={props.route} me={props.me} />
        <FocusWhenLoaded
          wasSuspended={() => {
            const was = suspended;
            suspended = false;
            return was;
          }}
        />
      </Loading>
    </Errored>
  );
}

function FocusWhenLoaded(props: { readonly wasSuspended: () => boolean }) {
  onSettled(() => {
    if (!props.wasSuspended()) return;
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
  });
  return null;
}

/** Zastępnik popupu na czas pobierania fragmentu (zwykle niewidoczny dzięki prefetchowi). */
function PopupLoading(props: { readonly onShown: () => void }) {
  onSettled(() => {
    props.onShown();
  });
  return (
    <div class="hub__popup-loading">
      <Spinner size={24} label={t.hub.popupLoading} />
    </div>
  );
}

function PopupError() {
  return (
    <div class="hub__popup-loading hub__popup-error">
      <Banner
        variant="error"
        action={
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            {t.hub.reload}
          </Button>
        }
      >
        {t.hub.popupError}
      </Banner>
    </div>
  );
}

/** Pobiera fragment popupów w czasie bezczynności po pierwszym wyświetleniu huba. */
function prefetchPopups() {
  const prefetch = () => void loadHubPopup().catch(() => undefined);
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(prefetch, 1500);
  return () => clearTimeout(id);
}
