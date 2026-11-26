import {
  createMemo,
  createSignal,
  For,
  Match,
  onSettled,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { createGameSearch } from '../games/gameData';
import { GameCover } from '../games/GameCover';
import { format, plural, t } from '../i18n';
import { avatarPerson, type Profile } from '../profile/profileQueries';
import { createClub } from '../club/clubData';
import { PopupsContext } from '../popups/popupContext';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { createAllProfiles, createMembers } from '../profile/profiles';
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
import { dateTile, formatMeetingDate, localDateTime, longMeetingDate } from './datetime';
import {
  createHubMeeting,
  createMeetingPlays,
  createMeetingVotes,
  createPublishedGames,
  createReopenVoting,
} from './meetingData';
import { menuItems } from './meetingMenu';
import { MeetingStatusChip, WinnersLine } from './MeetingParts';
import type { Meeting } from './meetings';
import { countdownLabel, isMeetingRunner, playsProgressLabel, splitPlays } from './plays';
import { myVoteCount, voteRows, votesLabel } from './voting';
import './meetings.css';
import './calendar.css';

/** Co ile odświeżamy odliczanie („Dziś”, „Jutro”, „Za 3 dni”): zmiana dnia bez przeładowania. */
const COUNTDOWN_TICK_MS = 60_000;

/**
 * Widżet spotkania (MTG-1, DS §15 „Widget meeting block”, „Widget header”, „Widget tray head”):
 * trwające spotkanie, a gdy go nie ma, najbliższe zaplanowane, z datą w strefie klubu,
 * uczestnikami i stanem. W nagłówku odliczanie albo chip „Trwa”; pod spodem taca stanu:
 * najwięcej głosów (głosowanie otwarte), „Gramy w” (gry wybrane) albo partie (w trakcie).
 * Menu ma akcje zależne od roli (DS §15 „Meeting menus”), a pusty stan dla administratora
 * „Zaplanuj spotkanie” (CLUB-4, PLAN-1).
 */
export function MeetingWidget(props: { readonly me: Profile }) {
  const popups = useContext(PopupsContext);
  const meeting = createHubMeeting();
  const club = createClub();
  const members = createMembers();
  const reopen = createReopenVoting();
  const isAdmin = () => props.me.role === 'admin';
  const data = () => meeting().data ?? undefined;
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;
  // Odliczanie liczy dni od „dziś” w strefie klubu, więc zegar przesuwa je też po północy.
  const [now, setNow] = createSignal(new Date());
  onSettled(() => {
    const timer = setInterval(() => setNow(new Date()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  });

  const items = createMemo((): MenuItem[] => {
    const current = data();
    if (!current) return [];
    return [
      // Kolejne spotkanie z menu widżetu (PLAN-1); kalendarz ma też własny przycisk (CAL-3).
      ...(isAdmin()
        ? [
            {
              id: 'plan',
              label: t.meetings.menu.plan,
              icon: 'plus' as const,
              onSelect: () => popups.open({ kind: 'add-meeting' }),
            },
          ]
        : []),
      ...menuItems(current, undefined, isAdmin(), isMeetingRunner(current, props.me)).map(
        ({ route, ...item }) => ({
          ...item,
          onSelect: () => (route ? popups.open(route) : reopen.mutate(current.id)),
        }),
      ),
    ];
  });
  const countdown = () => {
    const current = data();
    return current && current.status === 'planned' && !club().isPending
      ? countdownLabel(current.starts_at, timeZone(), now())
      : null;
  };
  const actionsLabel = () => format(t.hub.meeting.actions, { title: data()?.title ?? '' });

  return (
    <Card
      title={t.hub.meeting.title}
      action={
        <Show when={data()}>
          {(current) => (
            <span class="meeting-widget__actions">
              <Show
                when={current().status === 'in_progress'}
                fallback={
                  <Show when={countdown()}>
                    {(label) => <span class="meeting-widget__countdown">{label()}</span>}
                  </Show>
                }
              >
                <StatusChip tone="success">{t.hub.meeting.live}</StatusChip>
              </Show>
              <Show when={items().length > 0}>
                <Menu
                  label={actionsLabel()}
                  align="end"
                  items={items()}
                  trigger={(trigger) => (
                    <button
                      type="button"
                      {...trigger}
                      class="icon-btn icon-btn--32"
                      aria-label={actionsLabel()}
                      title={actionsLabel()}
                    >
                      <Icon name="more" />
                    </button>
                  )}
                />
              </Show>
            </span>
          )}
        </Show>
      }
    >
      <Switch>
        <Match when={meeting().isPending || (data() && club().isPending)}>
          <div class="members-widget__loading">
            <Skeleton width={240} height={64} radius={18} />
            <Spinner label={t.hub.meeting.loading} class="sr-only" />
          </div>
        </Match>
        <Match when={meeting().isError}>
          <Banner
            variant="error"
            action={
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                onClick={() => void meeting().refetch()}
              >
                {t.hub.retry}
              </Button>
            }
          >
            {t.hub.loadError}
          </Banner>
        </Match>
        <Match when={data()}>
          {(current) => (
            <MeetingBlock
              meeting={current()}
              me={props.me}
              timeZone={timeZone()}
              members={members().data ?? []}
            />
          )}
        </Match>
        <Match when={true}>
          <EmptyState
            icon="calendar"
            title={t.hub.meeting.emptyTitle}
            helper={isAdmin() ? t.hub.meeting.emptyHelperAdmin : t.hub.meeting.emptyHelper}
            action={
              <Show when={isAdmin()}>
                <Button icon="plus" fullWidth onClick={() => popups.open({ kind: 'add-meeting' })}>
                  {t.hub.meeting.plan}
                </Button>
              </Show>
            }
          />
        </Match>
      </Switch>
    </Card>
  );
}

function MeetingBlock(props: {
  readonly meeting: Meeting;
  readonly me: Profile;
  readonly timeZone: string;
  readonly members: readonly Profile[];
}) {
  const popups = useContext(PopupsContext);
  const tile = createMemo(() => dateTile(props.meeting.starts_at, props.timeZone));
  const people = createMemo(() =>
    props.members.filter((member) => props.meeting.participants.includes(member.id)),
  );
  const host = createMemo(() => {
    const hostId = props.meeting.host_id;
    return hostId ? props.members.find((member) => member.id === hostId) : undefined;
  });
  return (
    <div class="meeting-widget">
      <div class="meeting-widget__head">
        <span class="meeting-tile" aria-hidden="true">
          <span class="meeting-tile__month">{tile().month}</span>
          <span class="meeting-tile__day">{tile().day}</span>
        </span>
        <span class="meeting-widget__text">
          <h3 class="meeting-widget__title">
            <button
              type="button"
              class="meeting-widget__open"
              onClick={() => popups.open({ kind: 'meeting', id: props.meeting.id })}
            >
              {props.meeting.title}
            </button>
          </h3>
          <span class="meeting-widget__date">
            <span aria-hidden="true">
              {formatMeetingDate(props.meeting.starts_at, props.timeZone)}
            </span>
            <span class="sr-only">{longMeetingDate(props.meeting.starts_at, props.timeZone)}</span>
          </span>
        </span>
      </div>
      <div class="meeting-widget__row">
        <Show when={people().length > 0}>
          <ul class="meeting-widget__stack" aria-hidden="true">
            <For each={people().slice(0, 5)} keyed={(member) => member.id}>
              {(member) => (
                <li>
                  <ProfileAvatar profile={member()} size={36} ring="white" decorative />
                </li>
              )}
            </For>
          </ul>
        </Show>
        <p class="meeting-widget__people">
          <strong>{plural(props.meeting.participants.length, t.hub.meeting.participants)}</strong>
          {host() ? ` · ${format(t.hub.meeting.host, { name: host()?.first_name ?? '' })}` : null}
        </p>
      </div>
      <MeetingStateTray meeting={props.meeting} me={props.me} timeZone={props.timeZone} />
    </div>
  );
}

/** Najwięcej wierszy w tacy widżetu; resztę pokazuje popup spotkania. */
const TRAY_ROWS = 3;

/**
 * Taca stanu widżetu (MTG-1, DS §15 „Widget tray head”, „Voter mini-stack + count”): chip stanu
 * z notatką po prawej i najwyżej trzy wiersze h54.
 */
function MeetingStateTray(props: {
  readonly meeting: Meeting;
  readonly me: Profile;
  readonly timeZone: string;
}) {
  return (
    <Switch fallback={<ChosenGamesTray meeting={props.meeting} />}>
      <Match when={props.meeting.status === 'in_progress'}>
        <PlaysTray meeting={props.meeting} timeZone={props.timeZone} />
      </Match>
      <Match when={props.meeting.voting_open}>
        <VotesTray meeting={props.meeting} me={props.me} />
      </Match>
    </Switch>
  );
}

/**
 * Głowa tacy: chip stanu zaplanowanego spotkania albo, w trakcie, etykieta „Partie” (chip
 * „Trwa” jest już w nagłówku karty), z notatką po prawej.
 */
function TrayHead(props: { readonly meeting: Meeting; readonly note?: string | null | undefined }) {
  return (
    <div class="meeting-tray__head">
      <Show
        when={props.meeting.status === 'in_progress'}
        fallback={<MeetingStatusChip meeting={props.meeting} short />}
      >
        <span class="meeting-tray__label">{t.meetings.view.plays}</span>
      </Show>
      <Show when={props.note}>
        <span class="meeting-tray__note">{props.note}</span>
      </Show>
    </div>
  );
}

function TrayLoading(props: { readonly isError: boolean; readonly onRetry: () => void }) {
  return (
    <Show when={props.isError} fallback={<Skeleton width="100%" height={54} radius={14} />}>
      <Banner
        variant="error"
        action={
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => props.onRetry()}>
            {t.hub.retry}
          </Button>
        }
      >
        {t.hub.loadError}
      </Banner>
    </Show>
  );
}

function MoreRows(props: { readonly hidden: number }) {
  return (
    <Show when={props.hidden > 0}>
      <p class="meeting-tray__more">{plural(props.hidden, t.hub.meeting.more)}</p>
    </Show>
  );
}

function VotesTray(props: { readonly meeting: Meeting; readonly me: Profile }) {
  const games = createGameSearch(() => '');
  const votes = createMeetingVotes(() => props.meeting.id);
  const profiles = createAllProfiles();
  const ready = () => games().isSuccess && votes().isSuccess;
  const note = () => {
    const list = votes().data;
    return ready() && list && props.meeting.participants.includes(props.me.id)
      ? format(t.meetings.voting.myVotes, { n: myVoteCount(list, props.me.id) })
      : null;
  };
  const rows = createMemo(() => {
    const allGames = games().data;
    const allVotes = votes().data;
    if (!ready() || !allGames || !allVotes) return [];
    return voteRows(allGames, allVotes, {
      me: props.me.id,
      participants: props.meeting.participants.length,
    }).filter((row) => row.voters.length > 0);
  });
  return (
    <div class="meeting-tray">
      <TrayHead meeting={props.meeting} note={note()} />
      <Switch>
        <Match when={!ready()}>
          <TrayLoading
            isError={games().isError || votes().isError}
            onRetry={() => {
              void games().refetch();
              void votes().refetch();
            }}
          />
        </Match>
        <Match when={rows().length === 0}>
          <p class="meeting-tray__empty">{t.hub.meeting.noVotes}</p>
        </Match>
        <Match when={true}>
          <Tray label={t.hub.meeting.topVotesLabel}>
            <For each={rows().slice(0, TRAY_ROWS)} keyed={(row) => row.game.id}>
              {(row) => {
                const voters = () =>
                  row().voters.flatMap((id) => {
                    const person = profiles().data?.get(id);
                    return person ? [avatarPerson(person)] : [];
                  });
                return (
                  <li class="tray__item">
                    <div class="row row--54 meeting-tray__row">
                      <GameCover
                        id={row().game.id}
                        title={row().game.title}
                        coverPath={row().game.cover_path}
                        size="thumb"
                        unavailable={!row().available}
                      />
                      <span class="meeting-tray__name">{row().game.title}</span>
                      <span class="voter-count">
                        <Show when={voters().length > 0}>
                          <AvatarStack people={voters()} size={20} max={3} />
                        </Show>
                        <span class="voter-count__n" aria-hidden="true">
                          {row().voters.length}
                        </span>
                        <span class="sr-only">{votesLabel(row().voters.length)}</span>
                      </span>
                    </div>
                  </li>
                );
              }}
            </For>
          </Tray>
          <MoreRows hidden={rows().length - TRAY_ROWS} />
        </Match>
      </Switch>
    </div>
  );
}

function ChosenGamesTray(props: { readonly meeting: Meeting }) {
  const games = createPublishedGames(() => props.meeting.id);
  const list = () => games().data ?? [];
  return (
    <div class="meeting-tray">
      <TrayHead meeting={props.meeting} />
      <Switch>
        <Match when={!games().isSuccess}>
          <TrayLoading isError={games().isError} onRetry={() => void games().refetch()} />
        </Match>
        <Match when={list().length === 0}>
          <p class="meeting-tray__empty">{t.meetings.voting.playingEmpty}</p>
        </Match>
        <Match when={true}>
          <Tray label={t.meetings.voting.playingLabel}>
            <For each={list().slice(0, TRAY_ROWS)} keyed={(game) => game.id}>
              {(game) => (
                <li class="tray__item">
                  <div class="row row--54 meeting-tray__row">
                    <GameCover
                      id={game().id}
                      title={game().title}
                      coverPath={game().cover_path}
                      size="thumb"
                    />
                    <span class="meeting-tray__name">{game().title}</span>
                  </div>
                </li>
              )}
            </For>
          </Tray>
          <MoreRows hidden={list().length - TRAY_ROWS} />
        </Match>
      </Switch>
    </div>
  );
}

/** Partie trwającego spotkania: najpierw w toku, potem ostatnio zapisane ze zwycięzcami. */
function PlaysTray(props: { readonly meeting: Meeting; readonly timeZone: string }) {
  const plays = createMeetingPlays(() => props.meeting.id);
  const profiles = createAllProfiles();
  const split = createMemo(() => {
    const list = plays().data;
    return plays().isSuccess && list ? splitPlays(list) : undefined;
  });
  const rows = createMemo(() => {
    const current = split();
    return current ? [...current.drafts, ...[...current.saved].reverse()] : [];
  });
  return (
    <div class="meeting-tray">
      <TrayHead
        meeting={props.meeting}
        note={
          split()
            ? playsProgressLabel(split()?.saved.length ?? 0, split()?.drafts.length ?? 0)
            : null
        }
      />
      <Switch>
        <Match when={!split()}>
          <TrayLoading isError={plays().isError} onRetry={() => void plays().refetch()} />
        </Match>
        <Match when={rows().length === 0}>
          <p class="meeting-tray__empty">{t.hub.meeting.noPlays}</p>
        </Match>
        <Match when={true}>
          <Tray label={t.hub.meeting.playsLabel}>
            <For each={rows().slice(0, TRAY_ROWS)} keyed={(play) => play.id}>
              {(play) => (
                <li class="tray__item">
                  <div class="row row--54 meeting-tray__row">
                    <GameCover
                      id={play().game.id}
                      title={play().game.title}
                      coverPath={play().game.cover_path}
                      size="thumb"
                    />
                    <span class="meeting-tray__text">
                      <span class="meeting-tray__name">{play().game.title}</span>
                      <Show when={play().status === 'draft'}>
                        <span class="meeting-tray__meta meeting-tray__meta--live">
                          {format(t.meetings.plays.liveSince, {
                            time: localDateTime(play().started_at, props.timeZone).time,
                          })}
                        </span>
                      </Show>
                    </span>
                    <Show when={play().status === 'saved'}>
                      <WinnersLine
                        winners={play()
                          .results.filter((r) => r.is_win === true)
                          .map((r) => r.profile_id)}
                        profiles={profiles().data}
                      />
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </Tray>
          <MoreRows hidden={rows().length - TRAY_ROWS} />
        </Match>
      </Switch>
    </div>
  );
}
