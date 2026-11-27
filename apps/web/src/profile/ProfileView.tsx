import { createSignal, Match, Show, Switch, useContext } from 'solid-js';
import { t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { PopupsContext } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryBoundary } from '../popups/QueryStatus';
import { ProfileAvatar } from './ProfileAvatar';
import { createProfile } from './profiles';
import { Badge, Banner, Button, EmptyState, Icon, Tabs, type TabItem } from '../ui';
import { PlayerMeetingsSection } from './PlayerMeetings';
import { PlayerRecordsSection } from './PlayerRecords';
import { PlayerStatsSection, ProfileSummary } from './PlayerStats';
import { fullName, type Profile } from './profileQueries';
import './profile.css';

type ProfileTab = 'profile' | 'stats' | 'meetings' | 'records';

const TABS: readonly TabItem<ProfileTab>[] = (
  ['profile', 'stats', 'meetings', 'records'] as const
).map((id) => ({ id, label: t.profile.tabs[id] }));

/**
 * Full-screen player profile, opened from any avatar chip and from „Mój profil” in the avatar
 * menu: avatar, name and hook, and the Profile, Stats, Meetings and Records tabs. The owner has
 * the gear to their settings; nobody edits another player's profile, the administrator (with the
 * admin view on) only has „Usuń członka” for an active player. A removed member's profile is
 * read-only and keeps the stats from history.
 */
export function ProfileView(props: { readonly id: string; readonly isAdmin: boolean }) {
  const auth = useContext(AuthContext);
  const popups = useContext(PopupsContext);
  const profile = createProfile(() => props.id);
  const ownId = () => (auth.state.status === 'signedIn' ? auth.state.session.user.id : null);
  // Akcje okna zależą od danych w cache (bez czekania), treść czeka pod `<QueryBoundary>`.
  const data = () => profile.current() ?? undefined;
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
      width="full"
      actions={
        <Show when={deletable()}>
          <Button
            size="sm"
            variant="secondary"
            icon="trash"
            class="profile__delete"
            onClick={() => popups.open({ kind: 'delete-member', id: data()?.id ?? '' })}
          >
            {t.profile.deleteMember}
          </Button>
        </Show>
      }
    >
      <QueryBoundary>
        <Show
          when={profile()}
          fallback={
            <EmptyState
              icon="user"
              title={t.profile.notFoundTitle}
              helper={t.profile.notFoundBody}
            />
          }
        >
          {(shown) => <ProfileBody profile={shown()} own={own()} removed={removed()} />}
        </Show>
      </QueryBoundary>
    </PopupModal>
  );
}

function ProfileBody(props: {
  readonly profile: Profile;
  readonly own: boolean;
  readonly removed: boolean;
}) {
  const popups = useContext(PopupsContext);
  const [tab, setTab] = createSignal<ProfileTab>('profile');
  // Filters live here, so switching tabs doesn't reset them.
  const [statsFilters, setStatsFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  const [meetingsFilters, setMeetingsFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  const [recordsFilters, setRecordsFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  return (
    <div class="profile-view">
      <div class="profile">
        <ProfileAvatar profile={props.profile} size={88} decorative />
        <div class="profile__text">
          <h3 class="profile__name">
            {fullName(props.profile)}
            <Show when={props.removed}>
              <span class="profile__removed"> {t.ui.removedSuffix}</span>
            </Show>
          </h3>
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
        <Show when={props.own}>
          <button
            type="button"
            class="icon-btn icon-btn--36 hoverable profile__settings"
            aria-label={t.profile.settings}
            title={t.profile.settings}
            onClick={() => popups.open({ kind: 'settings' })}
          >
            <Icon name="gear" size={22} />
          </button>
        </Show>
      </div>
      <Show when={props.removed}>
        <Banner variant="info">{t.profile.removedNote}</Banner>
      </Show>
      <Tabs
        label={t.profile.tabsLabel}
        items={TABS}
        value={tab()}
        onChange={setTab}
        class="profile-view__tabs"
      >
        {(current) => (
          <Switch>
            <Match when={current === 'profile'}>
              <ProfileSummary profileId={props.profile.id} />
            </Match>
            <Match when={current === 'stats'}>
              <PlayerStatsSection
                profileId={props.profile.id}
                filters={statsFilters()}
                onFilters={setStatsFilters}
              />
            </Match>
            <Match when={current === 'meetings'}>
              <PlayerMeetingsSection
                profileId={props.profile.id}
                filters={meetingsFilters()}
                onFilters={setMeetingsFilters}
              />
            </Match>
            <Match when={current === 'records'}>
              <PlayerRecordsSection
                profileId={props.profile.id}
                filters={recordsFilters()}
                onFilters={setRecordsFilters}
              />
            </Match>
          </Switch>
        )}
      </Tabs>
    </div>
  );
}
