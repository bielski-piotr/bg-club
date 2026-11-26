import { createEffect, createMemo, Match, onSettled, Switch, useContext } from 'solid-js';
import { clubQuery } from '../club/club';
import { collectionWidgetQuery } from '../games/games';
import { Hub } from '../hub/Hub';
import { t } from '../i18n';
import { createQuery } from '../lib/query';
import { QueryClientContext } from '../lib/queryClient';
import { hubMeetingQuery } from '../meetings/meetings';
import { PopupRouter } from '../popups/PopupRouter';
import { membersQuery } from '../profile/profileQueries';
import { createProfileTheme } from '../theme/createTheme';
import { Banner, Button } from '../ui';
import { AuthContext } from './authContext';
import { LoadingScreen } from './LoadingScreen';
import { ownProfileQuery } from './ownProfile';
import './LoginScreen.css';

/**
 * Widok po zalogowaniu: hub ze stosem popupów. Brak własnego profilu (konto usunięte,
 * a token jest jeszcze ważny) kończy sesję z komunikatem na ekranie logowania.
 */
export function SignedInScreen(props: { readonly userId: string }) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  // Powłoka aplikacji nie czeka na profil (cache i stan zapytania bez zawieszania): decyduje
  // o ekranie wczytywania, hubie, błędzie i wylogowaniu nieaktywnego konta.
  const profile = createQuery(() => ownProfileQuery(auth.client, props.userId));
  const me = () => profile.current();
  const inactive = createMemo(() => me() === null);
  const pending = () => me() === undefined && profile.state()?.isError !== true;

  onSettled(() => {
    // Klub i dane widżetów pobieramy równolegle z profilem, nie dopiero po wyświetleniu huba
    // (o jeden RTT szybszy widok Klubu). Odczyty i tak idą przez RLS zalogowanego.
    const client = auth.client;
    for (const options of [
      clubQuery(client),
      membersQuery(client),
      collectionWidgetQuery(client),
      hubMeetingQuery(client),
    ]) {
      void queryClient.prefetchQuery(options as Parameters<typeof queryClient.prefetchQuery>[0]);
    }
  });

  createEffect(inactive, (isInactive) => {
    if (isInactive) void auth.signOut('accountInactive');
  });

  createProfileTheme(() => me()?.theme);

  return (
    <Switch>
      <Match when={pending() || inactive()}>
        <LoadingScreen />
      </Match>
      <Match when={!me()}>
        <main class="shell">
          <section class="start-card signed-in" aria-labelledby="page-title">
            <p class="eyebrow">{t.app.name}</p>
            <h1 id="page-title" class="title">
              {t.home.errorTitle}
            </h1>
            <Banner
              variant="error"
              class="signed-in__banner"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  onClick={() => void profile.refetch()}
                >
                  {t.home.retry}
                </Button>
              }
            >
              {t.home.profileError}
            </Banner>
            <div class="signed-in__actions">
              <Button variant="secondary" icon="logout" onClick={() => void auth.signOut()}>
                {t.auth.signOut}
              </Button>
            </div>
          </section>
        </main>
      </Match>
      <Match when={me()}>
        {(own) => (
          <PopupRouter>
            <Hub me={own()} />
          </PopupRouter>
        )}
      </Match>
    </Switch>
  );
}
