import { Match, Show, Switch, useContext } from 'solid-js';
import { t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from './ProfileAvatar';
import { createProfile } from './profiles';
import { Badge, Banner, Button, EmptyState } from '../ui';
import { PlayerRecordsSection } from './PlayerRecords';
import { PlayerStatsSection } from './PlayerStats';
import { fullName, type Profile } from './profileQueries';
import './profile.css';

/**
 * Popup profilu gracza (PRD USR-4, USR-5, MEM-5): awatar, imię i nazwisko, hook, statystyki
 * i rekordy osobiste w grach. Statystyki (§5.9) liczy `player_stats`, rekordy
 * `player_records`. Właściciel ma przycisk **Ustawienia** (USR-5); cudzy profil nie ma akcji edycji
 * także dla administratora (USR-7). Usunięty członek ma profil tylko do odczytu
 * (MEM-5) i zachowuje statystyki z historii.
 * Administrator ma w profilu aktywnego gracza przycisk **Usuń członka** (MEM-4); profilu
 * administratora nie da się usunąć.
 */
export function ProfilePopup(props: { readonly id: string; readonly isAdmin: boolean }) {
  const auth = useContext(AuthContext);
  const popups = useContext(PopupsContext);
  const profile = createProfile(() => props.id);
  const ownId = () => (auth.state.status === 'signedIn' ? auth.state.session.user.id : null);
  const data = () => (profile().isSuccess ? (profile().data ?? undefined) : undefined);
  const removed = () => data()?.deleted_at != null;
  const own = () => data()?.id === ownId() && !removed();
  const deletable = () => {
    const shown = data();
    return !!shown && props.isAdmin && !own() && !removed() && shown.role !== 'admin';
  };

  // Jedno okno na wszystkie stany (wczytywanie, profil, brak gracza): fokus, który `PopupHost`
  // ustawił na oknie przy otwarciu, zostaje na nim po wczytaniu danych.
  return (
    <PopupModal
      title={t.profile.title}
      actions={
        <Switch>
          <Match when={own()}>
            <Button
              size="sm"
              variant="secondary"
              icon="settings"
              onClick={() => popups.open({ kind: 'settings' })}
            >
              {t.profile.settings}
            </Button>
          </Match>
          <Match when={deletable()}>
            <Button
              size="sm"
              variant="secondary"
              icon="trash"
              class="profile__delete"
              onClick={() => popups.open({ kind: 'delete-member', id: data()?.id ?? '' })}
            >
              {t.profile.deleteMember}
            </Button>
          </Match>
        </Switch>
      }
    >
      <Switch>
        <Match when={!profile().isSuccess}>
          <QueryStatus isError={profile().isError} onRetry={() => void profile().refetch()} />
        </Match>
        <Match when={data()}>
          {(shown) => <ProfileView profile={shown()} own={own()} removed={removed()} />}
        </Match>
        <Match when={true}>
          <EmptyState icon="user" title={t.profile.notFoundTitle} helper={t.profile.notFoundBody} />
        </Match>
      </Switch>
    </PopupModal>
  );
}

function ProfileView(props: {
  readonly profile: Profile;
  readonly own: boolean;
  readonly removed: boolean;
}) {
  return (
    <>
      <div class="profile">
        <ProfileAvatar profile={props.profile} size={88} decorative />
        <div class="profile__text">
          <p class="profile__name">
            {fullName(props.profile)}
            <Show when={props.removed}>
              <span class="profile__removed"> {t.ui.removedSuffix}</span>
            </Show>
          </p>
          <p class="profile__hook">
            <span class="sr-only">{t.profile.hookLabel}: </span>
            <span class="profile__hook-value">{props.profile.hook}</span>
          </p>
          <Show when={props.profile.role === 'admin' || props.own}>
            <p class="profile__badges">
              <Show when={props.profile.role === 'admin'}>
                <Badge tone="accent">{t.ui.adminBadge}</Badge>
              </Show>
              <Show when={props.own}>
                <Badge tone="ink">{t.ui.youBadge}</Badge>
              </Show>
            </p>
          </Show>
        </div>
      </div>
      <Show when={props.removed}>
        <Banner variant="info" class="profile__notice">
          {t.profile.removedNote}
        </Banner>
      </Show>
      {/* Inny profil = nowe sekcje (filtry wracają do domyślnych). */}
      <Show when={props.profile.id} keyed>
        {(id) => (
          <>
            <PlayerStatsSection profileId={id} />
            <PlayerRecordsSection profileId={id} />
          </>
        )}
      </Show>
    </>
  );
}
