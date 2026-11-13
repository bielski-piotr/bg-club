import { useEffect } from 'react';
import { Hub } from '../hub/Hub';
import { t } from '../i18n';
import { PopupRouter } from '../popups/PopupRouter';
import { useProfileTheme } from '../theme/useProfileTheme';
import { Banner, Button } from '../ui';
import { useAuth } from './authContext';
import { LoadingScreen } from './LoadingScreen';
import { useOwnProfile } from './useOwnProfile';
import './LoginScreen.css';

/**
 * Widok po zalogowaniu: hub ze stosem popupów (PRD §4). Brak własnego profilu (konto usunięte,
 * a token jest jeszcze ważny, AUTH-7) kończy sesję z komunikatem na ekranie logowania.
 */
export function SignedInScreen({ userId }: { readonly userId: string }) {
  const { client, signOut } = useAuth();
  const profile = useOwnProfile(client, userId);
  const inactive = profile.isSuccess && profile.data === null;
  useProfileTheme(profile.data?.theme);

  useEffect(() => {
    if (inactive) void signOut('accountInactive');
  }, [inactive, signOut]);

  if (profile.isPending || inactive) {
    return <LoadingScreen />;
  }

  if (profile.isError || !profile.data) {
    return (
      <main className="shell">
        <section className="start-card signed-in" aria-labelledby="page-title">
          <p className="eyebrow">{t.app.name}</p>
          <h1 id="page-title" className="title">
            {t.home.errorTitle}
          </h1>
          <Banner
            variant="error"
            className="signed-in__banner"
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
          <div className="signed-in__actions">
            <Button variant="secondary" icon="logout" onClick={() => void signOut()}>
              {t.auth.signOut}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <PopupRouter>
      <Hub me={profile.data} />
    </PopupRouter>
  );
}
