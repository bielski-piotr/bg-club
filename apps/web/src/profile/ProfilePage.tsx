import { createSignal, Show, useContext } from 'solid-js';
import { showsAdminTools, type OwnProfile } from '../auth/ownProfile';
import { t } from '../i18n';
import { NO_FILTERS, type LeaderboardFilters } from '../leaderboard/filters';
import { PageLink } from '../popups/PageLink';
import { PopupsContext } from '../popups/popupContext';
import { QueryBoundary } from '../popups/QueryStatus';
import { ProfileAvatar } from './ProfileAvatar';
import { createProfile } from './profiles';
import {
  IconButton,
  Badge,
  Banner,
  Button,
  EmptyState,
  Icon,
  PageSection,
  SectionLayout,
  type SectionItem,
} from '../ui';
import { PlayerMeetingsSection } from './PlayerMeetings';
import { PlayerRecordsSection } from './PlayerRecords';
import { PlayerStatsSection, ProfileSummary } from './PlayerStats';
import { fullName, type Profile } from './profileQueries';
import './profile.css';

const text = t.profile;

const SECTIONS: readonly SectionItem[] = (['summary', 'stats', 'meetings', 'records'] as const).map(
  (id) => ({ id: `profile-${id}`, label: text.sections[id] }),
);

/**
 * Player profile page (`/profile/<uuid>`) under the app header, opened from any avatar chip and
 * from „Mój profil” in the avatar menu. All sections are on the page: Profile, Stats, Meetings
 * and Records, with the side menu following the scroll. The owner has the gear to the settings;
 * nobody edits another player's profile, the administrator (with the admin view on) only has
 * „Usuń członka” for an active player. A removed member's profile is read-only and keeps the
 * stats from history.
 */
export function ProfilePage(props: { readonly id: string; readonly me: OwnProfile }) {
  const profile = createProfile(() => props.id);
  return (
    <QueryBoundary>
      <Show
        when={profile()}
        fallback={<EmptyState icon="user" title={text.notFoundTitle} helper={text.notFoundBody} />}
      >
        {(shown) => <ProfileBody profile={shown()} me={props.me} />}
      </Show>
    </QueryBoundary>
  );
}

function ProfileBody(props: { readonly profile: Profile; readonly me: OwnProfile }) {
  const popups = useContext(PopupsContext);
  const removed = () => props.profile.deleted_at !== null;
  const own = () => props.profile.id === props.me.id && !removed();
  const deletable = () =>
    showsAdminTools(props.me) && !own() && !removed() && props.profile.role !== 'admin';
  // Filters live with the page, so they survive the sections' own reloads.
  const [statsFilters, setStatsFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  const [meetingsFilters, setMeetingsFilters] = createSignal<LeaderboardFilters>(NO_FILTERS);
  return (
    <SectionLayout label={text.sectionsLabel} items={SECTIONS}>
      <div class="page-hero">
        <IconButton
          icon="chevron-left"
          label={t.ui.back}
          class="page-hero__back"
          onClick={() => popups.goBack()}
        />
        <ProfileAvatar profile={props.profile} size={88} decorative />
        <div class="page-hero__text">
          <h1 class="page-hero__name">
            {fullName(props.profile)}
            <Show when={removed()}>
              <span class="page-hero__removed"> {t.ui.removedSuffix}</span>
            </Show>
          </h1>
          <p class="page-hero__hook">
            <span class="sr-only">{text.hookLabel}: </span>
            {props.profile.hook}
          </p>
          <Show when={props.profile.role === 'admin' || own()}>
            <p class="page-hero__badges">
              <Show when={props.profile.role === 'admin'}>
                <Badge tone="accent">{t.ui.adminBadge}</Badge>
              </Show>
              <Show when={own()}>
                <Badge tone="ink">{t.ui.youBadge}</Badge>
              </Show>
            </p>
          </Show>
        </div>
        <Show when={own()}>
          <PageLink
            to={{ kind: 'settings' }}
            class="icon-btn icon-btn--36 hoverable page-hero__action"
            aria-label={text.settings}
            title={text.settings}
          >
            <Icon name="gear" size={22} />
          </PageLink>
        </Show>
        <Show when={deletable()}>
          <Button
            size="sm"
            variant="secondary"
            icon="trash"
            class="profile__delete page-hero__action"
            onClick={() => popups.open({ kind: 'delete-member', id: props.profile.id })}
          >
            {text.deleteMember}
          </Button>
        </Show>
      </div>
      <Show when={removed()}>
        <Banner variant="info">{text.removedNote}</Banner>
      </Show>
      <PageSection id="profile-summary" title={text.sections.summary}>
        <ProfileSummary profileId={props.profile.id} />
      </PageSection>
      <PageSection id="profile-stats" title={text.sections.stats}>
        <PlayerStatsSection
          profileId={props.profile.id}
          filters={statsFilters()}
          onFilters={setStatsFilters}
        />
      </PageSection>
      <PageSection id="profile-meetings" title={text.sections.meetings}>
        <PlayerMeetingsSection
          profileId={props.profile.id}
          filters={meetingsFilters()}
          onFilters={setMeetingsFilters}
        />
      </PageSection>
      <PageSection id="profile-records" title={text.sections.records}>
        <PlayerRecordsSection profileId={props.profile.id} />
      </PageSection>
    </SectionLayout>
  );
}
