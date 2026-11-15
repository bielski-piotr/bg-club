import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import { ProfileLink } from '../profile/ProfileLink';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { fullName, useAllProfiles, useMembers, type Profile } from '../profile/profiles';
import { visibleMembers } from './members';
import { GameCover } from '../games/GameCover';
import { useCollectionWidget } from '../games/games';
import { playersLabel } from '../games/labels';
import { useClub } from './club';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { dateTile, formatMeetingDate, longMeetingDate, todayIn } from '../meetings/datetime';
import { useHubMeeting, type Meeting } from '../meetings/meetings';
import { shortDayLabel, weekdayTime } from '../meetings/calendar';
import { MeetingStatusChip, MiniDateTile, WinnersLine } from '../meetings/MeetingParts';
import { useTimeline, type MeetingOverview, type Timeline } from '../meetings/overview';
import { Banner, Button, Card, EmptyState, Icon, Menu, Skeleton, Spinner, Tray } from '../ui';
import '../meetings/meetings.css';
import '../meetings/calendar.css';

/*
 * Widżety huba (PRD §4, DS §6, §17). Ranking ma na razie tylko pusty stan (CLUB-4); jego treść
 * dochodzi w zadaniu [033]. Spotkanie (MTG-1, od [023]), Timeline (MTG-3, [025]), Kolekcja
 * (GAME-1) i Członkowie (MEM-1) pokazują już prawdziwe dane.
 */

/**
 * Widżet spotkania (MTG-1, DS §15 „Widget meeting block”): trwające spotkanie, a gdy go nie
 * ma, najbliższe zaplanowane, z datą w strefie klubu, uczestnikami i stanem. Administrator ma
 * menu „Edytuj / Usuń spotkanie”, a w pustym stanie „Zaplanuj spotkanie” (CLUB-4, PLAN-1).
 * Popup spotkania z głosowaniem, startem i końcem dochodzi w [024]–[026].
 */
export function MeetingWidget({ me }: { readonly me: Profile }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const isAdmin = me.role === 'admin';
  const meeting = useHubMeeting(client);
  const club = useClub(client);
  const members = useMembers(client);
  const data = meeting.data;
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;

  const action =
    isAdmin && data ? (
      <Menu
        label={format(t.hub.meeting.actions, { title: data.title })}
        align="end"
        items={[
          // Kolejne spotkanie z menu widżetu (PLAN-1); kalendarz ma też własny przycisk (CAL-3).
          {
            id: 'plan',
            label: t.meetings.menu.plan,
            icon: 'plus',
            onSelect: () => open({ kind: 'add-meeting' }),
          },
          {
            id: 'edit',
            label: t.meetings.menu.edit,
            icon: 'pencil',
            onSelect: () => open({ kind: 'edit-meeting', id: data.id }),
          },
          ...(data.status === 'planned'
            ? [
                {
                  id: 'delete',
                  label: t.meetings.menu.delete,
                  icon: 'trash' as const,
                  destructive: true,
                  onSelect: () => open({ kind: 'delete-meeting', id: data.id }),
                },
              ]
            : []),
        ]}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className="icon-btn icon-btn--32"
            aria-label={format(t.hub.meeting.actions, { title: data.title })}
            title={format(t.hub.meeting.actions, { title: data.title })}
          >
            <Icon name="more" />
          </button>
        )}
      />
    ) : undefined;

  return (
    <Card title={t.hub.meeting.title} action={action}>
      {meeting.isPending || (data && club.isPending) ? (
        <div className="members-widget__loading">
          <Skeleton width={240} height={64} radius={18} />
          <Spinner label={t.hub.meeting.loading} className="sr-only" />
        </div>
      ) : meeting.isError ? (
        <Banner
          variant="error"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => void meeting.refetch()}
            >
              {t.hub.retry}
            </Button>
          }
        >
          {t.hub.loadError}
        </Banner>
      ) : !data ? (
        <EmptyState
          icon="calendar"
          title={t.hub.meeting.emptyTitle}
          helper={isAdmin ? t.hub.meeting.emptyHelperAdmin : t.hub.meeting.emptyHelper}
          action={
            isAdmin ? (
              <Button icon="plus" fullWidth onClick={() => open({ kind: 'add-meeting' })}>
                {t.hub.meeting.plan}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <MeetingBlock meeting={data} timeZone={timeZone} members={members.data ?? []} />
      )}
    </Card>
  );
}

function MeetingBlock({
  meeting,
  timeZone,
  members,
}: {
  readonly meeting: Meeting;
  readonly timeZone: string;
  readonly members: readonly Profile[];
}) {
  const tile = dateTile(meeting.starts_at, timeZone);
  const people = members.filter((member) => meeting.participants.includes(member.id));
  const host = meeting.host_id ? members.find((member) => member.id === meeting.host_id) : null;
  return (
    <div className="meeting-widget">
      <div className="meeting-widget__head">
        <span className="meeting-tile" aria-hidden="true">
          <span className="meeting-tile__month">{tile.month}</span>
          <span className="meeting-tile__day">{tile.day}</span>
        </span>
        <span className="meeting-widget__text">
          <h3 className="meeting-widget__title">{meeting.title}</h3>
          <span className="meeting-widget__date">
            <span aria-hidden="true">{formatMeetingDate(meeting.starts_at, timeZone)}</span>
            <span className="sr-only">{longMeetingDate(meeting.starts_at, timeZone)}</span>
          </span>
        </span>
      </div>
      <div className="meeting-widget__row">
        {people.length > 0 ? (
          <ul className="meeting-widget__stack" aria-hidden="true">
            {people.slice(0, 5).map((member) => (
              <li key={member.id}>
                <ProfileAvatar profile={member} size={36} ring="white" decorative />
              </li>
            ))}
          </ul>
        ) : null}
        <p className="meeting-widget__people">
          <strong>{plural(meeting.participants.length, t.hub.meeting.participants)}</strong>
          {host ? ` · ${format(t.hub.meeting.host, { name: host.first_name })}` : null}
        </p>
      </div>
      <div className="meeting-widget__row">
        <MeetingStatusChip meeting={meeting} short />
      </div>
    </div>
  );
}

export function RankingWidget() {
  return (
    <Card title={t.hub.ranking.title}>
      <EmptyState
        icon="trophy"
        title={t.hub.ranking.emptyTitle}
        helper={t.hub.ranking.emptyHelper}
      />
    </Card>
  );
}

/**
 * Timeline (MTG-3, DS §15.1): najwyżej 2 najbliższe nadchodzące spotkania (od dalszego), divider
 * „Dziś” i najwyżej 4 ostatnie zakończone (od najnowszego), z datami w strefie klubu (NFR-10).
 * Zakończone mają liczbę partii i zwycięzców. Wiersz otwiera popup spotkania, a „Zobacz więcej”
 * kalendarz. Bez spotkań: pusty stan bez CTA (planowanie startuje z widżetu Spotkanie).
 */
export function TimelineWidget() {
  const { client } = useAuth();
  const timeline = useTimeline(client);
  const club = useClub(client);
  const profiles = useAllProfiles(client);
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;
  const data = timeline.data;
  const empty = data !== undefined && data.upcoming.length === 0 && data.finished.length === 0;
  // Profile są potrzebne do zwycięzców; dane z cache'u mają pierwszeństwo przed błędem odświeżania.
  const failed = (timeline.isError && !data) || (profiles.isError && !profiles.data);
  const action =
    data && !empty ? (
      <PopupLink
        to={{ kind: 'calendar' }}
        className="text-link"
        aria-label={t.hub.timeline.seeMore}
      >
        <span>{t.ui.seeMore}</span>
        <Icon name="chevron-right" />
      </PopupLink>
    ) : undefined;

  return (
    <Card title={t.hub.timeline.title} action={action}>
      {failed ? (
        <Banner
          variant="error"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => {
                if (timeline.isError) void timeline.refetch();
                if (profiles.isError) void profiles.refetch();
              }}
            >
              {t.hub.retry}
            </Button>
          }
        >
          {t.hub.loadError}
        </Banner>
      ) : !data || (!empty && (club.isPending || !profiles.data)) ? (
        <div className="members-widget__loading">
          <Skeleton width={240} height={48} radius={14} />
          <Spinner label={t.hub.timeline.loading} className="sr-only" />
        </div>
      ) : empty ? (
        <EmptyState
          icon="clock"
          title={t.hub.timeline.emptyTitle}
          helper={t.hub.timeline.emptyHelper}
        />
      ) : (
        <TimelineList timeline={data} timeZone={timeZone} profiles={profiles.data} />
      )}
    </Card>
  );
}

function TimelineList({
  timeline,
  timeZone,
  profiles,
}: {
  readonly timeline: Timeline;
  readonly timeZone: string;
  readonly profiles: ReadonlyMap<string, Profile> | undefined;
}) {
  const today = todayIn(timeZone);
  const last = timeline.finished.length === 0 ? 'divider' : timeline.finished.at(-1)?.id;
  return (
    <ol className="timeline" aria-label={t.hub.timeline.listLabel}>
      {timeline.upcoming.map((meeting) => (
        <TimelineRow key={meeting.id} meeting={meeting} timeZone={timeZone} last={false} />
      ))}
      <li className={last === 'divider' ? 'timeline__row timeline__row--last' : 'timeline__row'}>
        <span className="timeline__rail" aria-hidden="true">
          <span className="timeline__today-dot" />
          <span className="timeline__connector" />
        </span>
        <span className="timeline__divider">
          <span className="timeline__divider-label">
            {format(t.hub.timeline.today, { date: shortDayLabel(today) })}
          </span>
          <span className="timeline__hairline" aria-hidden="true" />
        </span>
      </li>
      {timeline.finished.map((meeting) => (
        <TimelineRow
          key={meeting.id}
          meeting={meeting}
          timeZone={timeZone}
          last={meeting.id === last}
          profiles={profiles}
        />
      ))}
    </ol>
  );
}

function TimelineRow({
  meeting,
  timeZone,
  last,
  profiles,
}: {
  readonly meeting: MeetingOverview;
  readonly timeZone: string;
  readonly last: boolean;
  readonly profiles?: ReadonlyMap<string, Profile> | undefined;
}) {
  const people = plural(meeting.participants.length, t.hub.meeting.participants);
  const finished = meeting.status === 'finished';
  const meta = finished
    ? `${people} · ${plural(meeting.playCount, t.hub.timeline.plays)}`
    : `${weekdayTime(meeting.starts_at, timeZone)} · ${people}`;
  return (
    <li className={last ? 'timeline__row timeline__row--last' : 'timeline__row'}>
      <PopupLink to={{ kind: 'meeting', id: meeting.id }} className="timeline__link">
        <span className="timeline__rail">
          <MiniDateTile meeting={meeting} timeZone={timeZone} />
          <span className="timeline__connector" aria-hidden="true" />
        </span>
        <span className="timeline__content">
          <span className="timeline__title">{meeting.title}</span>
          <span className="sr-only">{longMeetingDate(meeting.starts_at, timeZone)}</span>
          <span className="timeline__meta">{meta}</span>
          {finished ? (
            <WinnersLine
              winners={meeting.winners}
              profiles={profiles}
              className="timeline__winners"
            />
          ) : null}
        </span>
        <span className="timeline__chevron" aria-hidden="true">
          <Icon name="chevron-right" />
        </span>
      </PopupLink>
    </li>
  );
}

/**
 * Widżet kolekcji (GAME-1, DS §6 „Collection”): kilka gier w kolejności Q11 (ostatnio grane,
 * potem ostatnio dodane). Pierwsza ma dużą okładkę, kolejne są wierszami tacy z miniaturą.
 * „Zobacz więcej” otwiera popup kolekcji; pusty stan administratora ma „Dodaj grę” (CLUB-4).
 */
export function CollectionWidget({ isAdmin }: { readonly isAdmin: boolean }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const collection = useCollectionWidget(client);
  const data = collection.data;
  const count = data ? plural(data.total, t.games.count) : undefined;
  const action =
    data && data.total > 0 ? (
      <PopupLink to={{ kind: 'games' }} className="text-link">
        <span>{t.ui.seeMore}</span>
        <Icon name="chevron-right" />
      </PopupLink>
    ) : undefined;
  const [featured, ...rest] = data?.games ?? [];

  return (
    <Card title={t.hub.collection.title} count={count} action={action}>
      {collection.isPending ? (
        <div className="collection-widget__loading">
          <Skeleton width={148} height={148} radius={18} />
          <Spinner label={t.hub.collection.loading} className="sr-only" />
        </div>
      ) : collection.isError ? (
        <Banner
          variant="error"
          className="collection-widget__error"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => void collection.refetch()}
            >
              {t.hub.retry}
            </Button>
          }
        >
          {t.hub.loadError}
        </Banner>
      ) : !featured ? (
        <EmptyState
          icon="dice"
          title={t.hub.collection.emptyTitle}
          helper={isAdmin ? t.hub.collection.emptyHelperAdmin : t.hub.collection.emptyHelper}
          action={
            isAdmin ? (
              <Button icon="plus" fullWidth onClick={() => open({ kind: 'add-game' })}>
                {t.hub.collection.add}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="collection-widget">
          <PopupLink to={{ kind: 'games' }} className="collection-widget__featured">
            <GameCover
              id={featured.id}
              title={featured.title}
              coverPath={featured.cover_path}
              size="large"
              className="collection-widget__cover"
            />
            <span className="collection-widget__text">
              <span className="collection-widget__title">{featured.title}</span>
              <span className="collection-widget__meta">{playersLabel(featured)}</span>
            </span>
          </PopupLink>
          {rest.length > 0 ? (
            <Tray label={t.hub.collection.listLabel}>
              {rest.map((game) => (
                <li key={game.id} className="tray__item">
                  <PopupLink
                    to={{ kind: 'games' }}
                    className="row row--54 row--interactive collection-widget__row"
                  >
                    <span className="row__leading">
                      <GameCover
                        id={game.id}
                        title={game.title}
                        coverPath={game.cover_path}
                        size="thumb"
                      />
                    </span>
                    <span className="row__text">
                      <span className="row__title">{game.title}</span>
                      <span className="row__meta">{playersLabel(game)}</span>
                    </span>
                    <Icon name="chevron-right" className="row__chevron" />
                  </PopupLink>
                </li>
              ))}
            </Tray>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/**
 * Widżet członków (MEM-1, DS §6). Każdy awatar otwiera profil, licznik `+N` i „Zobacz więcej”
 * otwierają popup członków. Pusty stan administratora ma CTA „Dodaj członka” (MEM-3).
 */
export function MembersWidget({ me }: { readonly me: Profile }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const isAdmin = me.role === 'admin';
  const members = useMembers(client);
  const list = members.data;
  const count = list ? plural(list.length, t.hub.members.count) : undefined;
  const others = list?.filter((member) => member.id !== me.id) ?? [];
  const action =
    list && others.length > 0 ? (
      <PopupLink to={{ kind: 'members' }} className="text-link">
        <span>{t.ui.seeMore}</span>
        <Icon name="chevron-right" />
      </PopupLink>
    ) : undefined;

  return (
    <Card title={t.hub.members.title} count={count} action={action}>
      {members.isPending ? (
        <div className="members-widget__loading">
          <Skeleton width={240} height={56} radius={999} />
          <Spinner label={t.hub.members.loading} className="sr-only" />
        </div>
      ) : members.isError ? (
        <Banner
          variant="error"
          className="members-widget__error"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onClick={() => void members.refetch()}
            >
              {t.hub.retry}
            </Button>
          }
        >
          {t.hub.loadError}
        </Banner>
      ) : others.length === 0 ? (
        <EmptyState
          lead={
            <ProfileLink id={me.id} name={fullName(me)}>
              <ProfileAvatar profile={me} size={56} decorative />
            </ProfileLink>
          }
          title={t.hub.members.emptyTitle}
          helper={isAdmin ? t.hub.members.emptyHelperAdmin : t.hub.members.emptyHelper}
          action={
            isAdmin ? (
              <Button icon="plus" fullWidth onClick={() => open({ kind: 'add-member' })}>
                {t.hub.members.add}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <MembersStack members={list ?? []} />
      )}
    </Card>
  );
}

function MembersStack({ members }: { readonly members: readonly Profile[] }) {
  const { shown, rest } = visibleMembers(members);
  const names = shown.map((member) => member.first_name);
  const total = plural(members.length, t.hub.members.count);
  return (
    <div className="members-widget">
      <ul className="members-widget__stack">
        {shown.map((member) => (
          <li key={member.id} className="members-widget__item">
            <ProfileLink id={member.id} name={fullName(member)}>
              <ProfileAvatar profile={member} size={64} decorative className="members-avatar" />
            </ProfileLink>
          </li>
        ))}
        {rest > 0 ? (
          <li className="members-widget__item">
            <PopupLink
              to={{ kind: 'members' }}
              className="members-widget__more tnum"
              aria-label={format(t.hub.members.moreLink, { count: total })}
            >
              +{rest}
            </PopupLink>
          </li>
        ) : null}
      </ul>
      <p className="members-widget__caption">
        <span className="members-widget__names">
          {rest > 0 || names.length < 2
            ? names.join(', ')
            : `${names.slice(0, -1).join(', ')} ${t.hub.members.and} ${names.at(-1) ?? ''}`}
        </span>
        {rest > 0 ? ` ${plural(rest, t.hub.members.others)}` : null}
      </p>
    </div>
  );
}
