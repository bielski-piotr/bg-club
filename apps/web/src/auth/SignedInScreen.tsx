import { useEffect, useState } from 'react';
import { format, t } from '../i18n';
import { Avatar, Badge, Banner, Button } from '../ui';
import { useAuth } from './authContext';
import { LoadingScreen } from './LoadingScreen';
import { useOwnProfile } from './useOwnProfile';
import './LoginScreen.css';

/**
 * Widok po zalogowaniu. Do czasu huba i nagłówka z menu awatara ([007], [008]) pokazuje, kto
 * jest zalogowany, i pozwala się wylogować. Brak własnego profilu (konto usunięte, a token jest
 * jeszcze ważny, AUTH-7) kończy sesję z komunikatem na ekranie logowania.
 */
export function SignedInScreen({ userId }: { readonly userId: string }) {
  const { client, signOut } = useAuth();
  const profile = useOwnProfile(client, userId);
  const [signingOut, setSigningOut] = useState(false);
  const inactive = profile.isSuccess && profile.data === null;

  useEffect(() => {
    if (inactive) void signOut('accountInactive');
  }, [inactive, signOut]);

  const onSignOut = () => {
    setSigningOut(true);
    // Po udanym wylogowaniu ekran znika; przy błędzie przycisk wraca do zwykłego stanu.
    signOut().catch(() => setSigningOut(false));
  };

  if (profile.isPending || inactive) {
    return <LoadingScreen />;
  }

  return (
    <main className="shell">
      <section className="start-card signed-in" aria-labelledby="page-title">
        <p className="eyebrow">{t.app.name}</p>
        {profile.isError ? (
          <>
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
          </>
        ) : profile.data ? (
          <>
            <div className="signed-in__who">
              <Avatar
                id={profile.data.id}
                name={`${profile.data.first_name} ${profile.data.last_name}`}
                size={56}
                decorative
              />
              <div className="signed-in__text">
                <h1 id="page-title" className="title signed-in__name">
                  {format(t.home.greeting, { name: profile.data.first_name })}
                </h1>
                <p className="signed-in__hook">
                  <span className="sr-only">{t.home.hookLabel} </span>
                  <span className="signed-in__hook-value">{profile.data.hook}</span>
                  {profile.data.role === 'admin' ? (
                    <Badge tone="accent">{t.ui.adminBadge}</Badge>
                  ) : null}
                </p>
              </div>
            </div>
            <p className="body">{t.home.body}</p>
          </>
        ) : null}
        <div className="signed-in__actions">
          <Button variant="secondary" icon="logout" loading={signingOut} onClick={onSignOut}>
            {t.auth.signOut}
          </Button>
        </div>
      </section>
    </main>
  );
}
