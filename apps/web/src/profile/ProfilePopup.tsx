import { useAuth } from '../auth/authContext';
import { t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { Badge, Banner, Button, EmptyState, type IconName } from '../ui';
import { ProfileAvatar } from './ProfileAvatar';
import { fullName, useProfile } from './profiles';
import './profile.css';

/**
 * Popup profilu gracza (PRD USR-4, USR-5, MEM-5): awatar, imię i nazwisko, hook, statystyki
 * i gablota osiągnięć. Statystyki (§5.9) i gablota (§5.10) mają stan oczekiwania do etapów
 * E5 i E6. Właściciel ma przycisk **Ustawienia** (USR-5); cudzy profil nie ma akcji edycji
 * także dla administratora (USR-7). Usunięty członek ma profil tylko do odczytu (MEM-5).
 * Administrator ma w profilu aktywnego gracza przycisk **Usuń członka** (MEM-4); profilu
 * administratora nie da się usunąć.
 */
export function ProfilePopup({ id, isAdmin }: { readonly id: string; readonly isAdmin: boolean }) {
  const { client, state } = useAuth();
  const { open } = usePopups();
  const profile = useProfile(client, id);
  const ownId = state.status === 'signedIn' ? state.session.user.id : null;

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
  const own = data.id === ownId && !removed;
  const deletable = isAdmin && !own && !removed && data.role !== 'admin';
  return (
    <PopupModal
      title={t.profile.title}
      actions={
        own ? (
          <Button
            size="sm"
            variant="secondary"
            icon="settings"
            onClick={() => open({ kind: 'settings' })}
          >
            {t.profile.settings}
          </Button>
        ) : deletable ? (
          <Button
            size="sm"
            variant="secondary"
            icon="trash"
            className="profile__delete"
            onClick={() => open({ kind: 'delete-member', id: data.id })}
          >
            {t.profile.deleteMember}
          </Button>
        ) : undefined
      }
    >
      <div className="profile">
        <ProfileAvatar profile={data} size={88} decorative />
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
      <PendingSection
        icon="trophy"
        title={t.profile.stats.title}
        headline={t.profile.stats.pendingTitle}
        helper={t.profile.stats.pendingHelper}
      />
      <PendingSection
        icon="flag"
        title={t.profile.achievements.title}
        headline={t.profile.achievements.pendingTitle}
        helper={t.profile.achievements.pendingHelper}
      />
    </PopupModal>
  );
}

/** Sekcja profilu, której dane dochodzą w kolejnych etapach (stan oczekiwania). */
function PendingSection({
  icon,
  title,
  headline,
  helper,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly headline: string;
  readonly helper: string;
}) {
  return (
    <section className="profile__section" aria-label={title}>
      <h3 className="profile__section-title">{title}</h3>
      <EmptyState icon={icon} title={headline} helper={helper} />
    </section>
  );
}
