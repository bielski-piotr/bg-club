import { useState } from 'react';
import { useAuth } from '../auth/authContext';
import { t } from '../i18n';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Avatar, Badge, Banner, Button, EmptyState } from '../ui';
import { avatarPerson, fullName, useProfile } from './profiles';
import './profile.css';

/**
 * Popup profilu gracza (PRD USR-4, MEM-5). Na razie: awatar, imię i nazwisko, hook i rola.
 * Statystyki, osiągnięcia i ustawienia właściciela dochodzą w zadaniu [010]; do tego czasu
 * właściciel ma tu przycisk wylogowania.
 */
export function ProfilePopup({ id }: { readonly id: string }) {
  const { client, state, signOut } = useAuth();
  const profile = useProfile(client, id);
  const [signingOut, setSigningOut] = useState(false);
  const ownId = state.status === 'signedIn' ? state.session.user.id : null;

  const onSignOut = () => {
    setSigningOut(true);
    signOut().catch(() => setSigningOut(false));
  };

  if (!profile.isSuccess) {
    return (
      <PopupModal title={t.profile.title}>
        <QueryStatus isError={profile.isError} onRetry={() => void profile.refetch()} />
      </PopupModal>
    );
  }

  const data = profile.data;
  if (!data) {
    return (
      <PopupModal title={t.profile.title}>
        <EmptyState icon="user" title={t.profile.notFoundTitle} helper={t.profile.notFoundBody} />
      </PopupModal>
    );
  }

  const removed = data.deleted_at !== null;
  const own = data.id === ownId;
  return (
    <PopupModal title={t.profile.title}>
      <div className="profile">
        <Avatar {...avatarPerson(data)} size={88} decorative />
        <div className="profile__text">
          <p className="profile__name">
            {fullName(data)}
            {removed ? <span className="profile__removed"> {t.ui.removedSuffix}</span> : null}
          </p>
          <p className="profile__hook">
            <span className="sr-only">{t.profile.hookLabel}: </span>
            <span className="profile__hook-value">{data.hook}</span>
          </p>
          {data.role === 'admin' || own ? (
            <p className="profile__badges">
              {data.role === 'admin' ? <Badge tone="accent">{t.ui.adminBadge}</Badge> : null}
              {own ? <Badge tone="ink">{t.ui.youBadge}</Badge> : null}
            </p>
          ) : null}
        </div>
      </div>
      {removed ? (
        <Banner variant="info" className="profile__notice">
          {t.profile.removedNote}
        </Banner>
      ) : null}
      {own ? (
        <div className="profile__actions">
          <Button variant="secondary" icon="logout" loading={signingOut} onClick={onSignOut}>
            {t.auth.signOut}
          </Button>
        </div>
      ) : null}
    </PopupModal>
  );
}
