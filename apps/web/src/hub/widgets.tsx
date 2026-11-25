import { useAuth } from '../auth/authContext';
import { format, plural, t } from '../i18n';
import { usePopups } from '../popups/popupContext';
import { PopupLink } from '../popups/PopupLink';
import { ProfileAvatar } from '../react-shared/ProfileAvatar';
import { avatarPerson, useAllProfiles, useMembers, type Profile } from '../react-shared/profiles';
import { GameCover } from '../games/GameCover';
import { useCollectionWidget, useGameSearch } from '../games/games';
import { playersLabel } from '../games/labels';
import { useClub } from './club';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import {
  dateTile,
  formatMeetingDate,
  localDateTime,
  longMeetingDate,
  todayIn,
} from '../meetings/datetime';
import { useHubMeeting, type Meeting } from '../meetings/meetings';
import { shortDayLabel, weekdayTime } from '../meetings/calendar';
import { MeetingStatusChip, MiniDateTile, WinnersLine } from '../meetings/MeetingParts';
import { useTimeline, type MeetingOverview, type Timeline } from '../meetings/overview';
import { menuItems } from '../meetings/meetingMenu';
import {
  countdownLabel,
  isMeetingRunner,
  playsProgressLabel,
  splitPlays,
  useMeetingPlays,
} from '../meetings/plays';
import {
  myVoteCount,
  useMeetingVotes,
  usePublishedGames,
  useReopenVoting,
  voteRows,
  votesLabel,
} from '../meetings/voting';
import {
  AvatarStack,
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  Menu,
  Skeleton,
  Spinner,
  StatusChip,
  Tray,
  type MenuItem,
} from '../ui';
import '../meetings/meetings.css';
import '../meetings/calendar.css';

/*
 * Widżety huba (PRD §4, DS §6, §17): Spotkanie (MTG-1, od [023], przebieg w [026]), Ranking
 * (LB-1…LB-7, [033], moduł `leaderboard`), Timeline (MTG-3, [025]), Kolekcja (GAME-1)
 * i Członkowie (MEM-1).
 */

/**
 * Widżet spotkania (MTG-1, DS §15 „Widget meeting block”, „Widget header”, „Widget tray head”):
 * trwające spotkanie, a gdy go nie ma, najbliższe zaplanowane, z datą w strefie klubu,
 * uczestnikami i stanem. W nagłówku odliczanie albo chip „Trwa”; pod spodem taca stanu:
 * najwięcej głosów (głosowanie otwarte), „Gramy w” (gry wybrane) albo partie (w trakcie).
 * Menu ma akcje zależne od roli (DS §15 „Meeting menus”), a pusty stan dla administratora
 * „Zaplanuj spotkanie” (CLUB-4, PLAN-1).
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
  const reopen = useReopenVoting(client);

  const items: MenuItem[] = data
    ? [
        // Kolejne spotkanie z menu widżetu (PLAN-1); kalendarz ma też własny przycisk (CAL-3).
        ...(isAdmin
          ? [
              {
                id: 'plan',
                label: t.meetings.menu.plan,
                icon: 'plus' as const,
                onSelect: () => open({ kind: 'add-meeting' }),
              },
            ]
          : []),
        ...menuItems(data, undefined, isAdmin, isMeetingRunner(data, me)).map(
          ({ route, ...item }) => ({
            ...item,
            onSelect: () => (route ? open(route) : reopen.mutate(data.id)),
          }),
        ),
      ]
    : [];
  const countdown =
    data && data.status === 'planned' && !club.isPending
      ? countdownLabel(data.starts_at, timeZone)
      : null;

  const action = data ? (
    <span className="meeting-widget__actions">
      {data.status === 'in_progress' ? (
        <StatusChip tone="success">{t.hub.meeting.live}</StatusChip>
      ) : countdown ? (
        <span className="meeting-widget__countdown">{countdown}</span>
      ) : null}
      {items.length > 0 ? (
        <Menu
          label={format(t.hub.meeting.actions, { title: data.title })}
          align="end"
          items={items}
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
      ) : null}
    </span>
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
        <MeetingBlock meeting={data} me={me} timeZone={timeZone} members={members.data ?? []} />
      )}
    </Card>
  );
}

function MeetingBlock({
  meeting,
  me,
  timeZone,
  members,
}: {
  readonly meeting: Meeting;
  readonly me: Profile;
  readonly timeZone: string;
  readonly members: readonly Profile[];
}) {
  const { open } = usePopups();
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
          <h3 className="meeting-widget__title">
            <button
              type="button"
              className="meeting-widget__open"
              onClick={() => open({ kind: 'meeting', id: meeting.id })}
            >
              {meeting.title}
            </button>
          </h3>
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
      <MeetingStateTray meeting={meeting} me={me} timeZone={timeZone} />
    </div>
  );
}

/** Najwięcej wierszy w tacy widżetu; resztę pokazuje popup spotkania. */
const TRAY_ROWS = 3;

/**
 * Taca stanu widżetu (MTG-1, DS §15 „Widget tray head”, „Voter mini-stack + count”): chip stanu
 * z notatką po prawej i najwyżej trzy wiersze h54.
 */
function MeetingStateTray({
  meeting,
  me,
  timeZone,
}: {
  readonly meeting: Meeting;
  readonly me: Profile;
  readonly timeZone: string;
}) {
  if (meeting.status === 'in_progress') return <PlaysTray meeting={meeting} timeZone={timeZone} />;
  if (meeting.voting_open) return <VotesTray meeting={meeting} me={me} />;
  return <ChosenGamesTray meeting={meeting} />;
}

/**
 * Głowa tacy: chip stanu zaplanowanego spotkania albo, w trakcie, etykieta „Partie” (chip
 * „Trwa” jest już w nagłówku karty), z notatką po prawej.
 */
function TrayHead({ meeting, note }: { readonly meeting: Meeting; readonly note?: string | null }) {
  return (
    <div className="meeting-tray__head">
      {meeting.status === 'in_progress' ? (
        <span className="meeting-tray__label">{t.meetings.view.plays}</span>
      ) : (
        <MeetingStatusChip meeting={meeting} short />
      )}
      {note ? <span className="meeting-tray__note">{note}</span> : null}
    </div>
  );
}

function TrayLoading({
  isError,
  onRetry,
}: {
  readonly isError: boolean;
  readonly onRetry: () => void;
}) {
  return isError ? (
    <Banner
      variant="error"
      action={
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
          {t.hub.retry}
        </Button>
      }
    >
      {t.hub.loadError}
    </Banner>
  ) : (
    <Skeleton width="100%" height={54} radius={14} />
  );
}

function MoreRows({ hidden }: { readonly hidden: number }) {
  return hidden > 0 ? (
    <p className="meeting-tray__more">{plural(hidden, t.hub.meeting.more)}</p>
  ) : null;
}

function VotesTray({ meeting, me }: { readonly meeting: Meeting; readonly me: Profile }) {
  const { client } = useAuth();
  const games = useGameSearch(client, '');
  const votes = useMeetingVotes(client, meeting.id);
  const profiles = useAllProfiles(client);
  const canVote = meeting.participants.includes(me.id);
  const note =
    canVote && votes.data
      ? format(t.meetings.voting.myVotes, { n: myVoteCount(votes.data, me.id) })
      : null;
  if (!games.isSuccess || !votes.isSuccess) {
    return (
      <div className="meeting-tray">
        <TrayHead meeting={meeting} />
        <TrayLoading
          isError={games.isError || votes.isError}
          onRetry={() => {
            void games.refetch();
            void votes.refetch();
          }}
        />
      </div>
    );
  }
  const rows = voteRows(games.data, votes.data, {
    me: me.id,
    participants: meeting.participants.length,
  }).filter((row) => row.voters.length > 0);
  return (
    <div className="meeting-tray">
      <TrayHead meeting={meeting} note={note} />
      {rows.length === 0 ? (
        <p className="meeting-tray__empty">{t.hub.meeting.noVotes}</p>
      ) : (
        <>
          <Tray label={t.hub.meeting.topVotesLabel}>
            {rows.slice(0, TRAY_ROWS).map((row) => {
              const voters = row.voters.flatMap((id) => {
                const person = profiles.data?.get(id);
                return person ? [avatarPerson(person)] : [];
              });
              return (
                <li key={row.game.id} className="tray__item">
                  <div className="row row--54 meeting-tray__row">
                    <GameCover
                      id={row.game.id}
                      title={row.game.title}
                      coverPath={row.game.cover_path}
                      size="thumb"
                      unavailable={!row.available}
                    />
                    <span className="meeting-tray__name">{row.game.title}</span>
                    <span className="voter-count">
                      {voters.length > 0 ? <AvatarStack people={voters} size={20} max={3} /> : null}
                      <span className="voter-count__n" aria-hidden="true">
                        {row.voters.length}
                      </span>
                      <span className="sr-only">{votesLabel(row.voters.length)}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </Tray>
          <MoreRows hidden={rows.length - TRAY_ROWS} />
        </>
      )}
    </div>
  );
}

function ChosenGamesTray({ meeting }: { readonly meeting: Meeting }) {
  const { client } = useAuth();
  const games = usePublishedGames(client, meeting.id);
  if (!games.isSuccess) {
    return (
      <div className="meeting-tray">
        <TrayHead meeting={meeting} />
        <TrayLoading isError={games.isError} onRetry={() => void games.refetch()} />
      </div>
    );
  }
  return (
    <div className="meeting-tray">
      <TrayHead meeting={meeting} />
      {games.data.length === 0 ? (
        <p className="meeting-tray__empty">{t.meetings.voting.playingEmpty}</p>
      ) : (
        <>
          <Tray label={t.meetings.voting.playingLabel}>
            {games.data.slice(0, TRAY_ROWS).map((game) => (
              <li key={game.id} className="tray__item">
                <div className="row row--54 meeting-tray__row">
                  <GameCover
                    id={game.id}
                    title={game.title}
                    coverPath={game.cover_path}
                    size="thumb"
                  />
                  <span className="meeting-tray__name">{game.title}</span>
                </div>
              </li>
            ))}
          </Tray>
          <MoreRows hidden={games.data.length - TRAY_ROWS} />
        </>
      )}
    </div>
  );
}

/** Partie trwającego spotkania: najpierw w toku, potem ostatnio zapisane ze zwycięzcami. */
function PlaysTray({
  meeting,
  timeZone,
}: {
  readonly meeting: Meeting;
  readonly timeZone: string;
}) {
  const { client } = useAuth();
  const plays = useMeetingPlays(client, meeting.id);
  const profiles = useAllProfiles(client);
  if (!plays.isSuccess) {
    return (
      <div className="meeting-tray">
        <TrayHead meeting={meeting} />
        <TrayLoading isError={plays.isError} onRetry={() => void plays.refetch()} />
      </div>
    );
  }
  const { saved, drafts } = splitPlays(plays.data);
  const rows = [...drafts, ...[...saved].reverse()];
  return (
    <div className="meeting-tray">
      <TrayHead meeting={meeting} note={playsProgressLabel(saved.length, drafts.length)} />
      {rows.length === 0 ? (
        <p className="meeting-tray__empty">{t.hub.meeting.noPlays}</p>
      ) : (
        <>
          <Tray label={t.hub.meeting.playsLabel}>
            {rows.slice(0, TRAY_ROWS).map((play) => (
              <li key={play.id} className="tray__item">
                <div className="row row--54 meeting-tray__row">
                  <GameCover
                    id={play.game.id}
                    title={play.game.title}
                    coverPath={play.game.cover_path}
                    size="thumb"
                  />
                  <span className="meeting-tray__text">
                    <span className="meeting-tray__name">{play.game.title}</span>
                    {play.status === 'draft' ? (
                      <span className="meeting-tray__meta meeting-tray__meta--live">
                        {format(t.meetings.plays.liveSince, {
                          time: localDateTime(play.started_at, timeZone).time,
                        })}
                      </span>
                    ) : null}
                  </span>
                  {play.status === 'saved' ? (
                    <WinnersLine
                      winners={play.results
                        .filter((r) => r.is_win === true)
                        .map((r) => r.profile_id)}
                      profiles={profiles.data}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </Tray>
          <MoreRows hidden={rows.length - TRAY_ROWS} />
        </>
      )}
    </div>
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
              unavailable={!featured.available}
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
                        unavailable={!game.available}
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
