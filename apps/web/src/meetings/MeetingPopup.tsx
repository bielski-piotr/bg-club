/** @jsxImportSource @solidjs/web */
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  useContext,
} from 'solid-js';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { createGameSearch } from '../games/gameData';
import { GameCover } from '../games/GameCover';
import { gameVoteTotalKey } from '../games/gameVoteTotal';
import { format, plural, t } from '../i18n';
import { avatarPerson, compareProfiles, fullName, type Profile } from '../profile/profileQueries';
import { claimOrphanSweep, sweepOrphanSheetImages } from '../sheets/sheetImages';
import { createClub } from '../solid/club';
import {
  AuthContext,
  PopupLevelContext,
  PopupsContext,
  QueryClientContext,
  ToastContext,
} from '../solid/context';
import { PopupModal } from '../solid/popups/PopupModal';
import { QueryStatus } from '../solid/popups/QueryStatus';
import { ProfileAvatar } from '../solid/profile/ProfileAvatar';
import { createAllProfiles, createMembers } from '../solid/profile/profiles';
import { createMutation } from '../solid/query';
import {
  AvatarStack,
  Badge,
  Button,
  EmptyState,
  Icon,
  Menu,
  SearchField,
  StatusChip,
  Tray,
  type MenuItem,
} from '../solid/ui';
import { ariaBool } from '../solid/ui/dom';
import { DateVotingSection } from './DateVotingSection';
import { formatMeetingDate, longMeetingDate } from './datetime';
import {
  createMeeting,
  createMeetingOverview,
  createMeetingPlays,
  createMeetingVotes,
  createPublishedGames,
  createReopenVoting,
} from './meetingData';
import { menuItems } from './meetingMenu';
import { MeetingPlaysSection } from './MeetingPlays';
import { meetingsKey, type Meeting } from './meetings';
import { MeetingSummarySection } from './MeetingSummary';
import { gameWinners, isMeetingRunner, playedGames } from './plays';
import {
  castVote,
  fitsPlayers,
  meetingVotesKey,
  mismatchLabel,
  myVoteCount,
  voteRows,
  votesLabel,
  VotingError,
  withdrawVote,
  type PublishedGame,
  type Vote,
  type VoteRow,
} from './voting';
import './meetings.css';

const text = t.meetings.voting;
const popup = t.meetings.popup;

/**
 * Popup spotkania (VIEW-1, VIEW-2, DS §15 „Popup structure”): nagłówek ze statusem, terminem
 * i uczestnikami, a w zaplanowanym głosowanie (VOTE-1…VOTE-4) albo lista „Gramy w:” (VOTE-5).
 * Administrator ma pole akcji z publikacją i ponownym otwarciem (VOTE-6) oraz menu „Edytuj /
 * Usuń spotkanie”. Przebieg (RUN-1, RUN-4, VIEW-3): administrator i prowadzący rozpoczynają
 * i kończą spotkanie z pola akcji; trwające i zakończone pokazują partie w toku i zapisane.
 * Prowadzący nie ma akcji administracyjnych (uczestnicy, prowadzący, PLAN-4, Q14).
 *
 * Jedno okno na wszystkie stany (wczytywanie, spotkanie, brak spotkania): fokus, który
 * `PopupHost` ustawił na oknie przy otwarciu, zostaje na nim po wczytaniu danych.
 */
export function MeetingPopup(props: { readonly id: string; readonly me: OwnProfile }) {
  const meeting = createMeeting(() => props.id);
  const club = createClub();
  const members = createMembers();
  createCloseWhenDeleted(() => meeting().data);
  const ready = () => meeting().isSuccess && club().isSuccess && members().isSuccess;
  const shown = () => (ready() ? (meeting().data ?? undefined) : undefined);
  const notFound = () => ready() && !meeting().data;
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;

  return (
    <PopupModal
      title={notFound() ? popup.notFoundTitle : (meeting().data?.title ?? t.ui.loading)}
      actions={
        <Show when={shown()}>{(current) => <MeetingMenu meeting={current()} me={props.me} />}</Show>
      }
    >
      <Switch>
        <Match when={shown()}>
          {(current) => (
            <MeetingView
              meeting={current()}
              me={props.me}
              timeZone={timeZone()}
              members={members().data ?? []}
            />
          )}
        </Match>
        <Match when={notFound()}>
          <p class="meeting-form__state">{popup.notFoundBody}</p>
        </Match>
        <Match when={true}>
          <QueryStatus
            isError={meeting().isError || club().isError || members().isError}
            onRetry={() => {
              void meeting().refetch();
              void club().refetch();
              void members().refetch();
            }}
          />
        </Match>
      </Switch>
    </PopupModal>
  );
}

interface ViewProps {
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly timeZone: string;
  readonly members: readonly Profile[];
}

function MeetingView(props: ViewProps) {
  const auth = useContext(AuthContext);
  const profiles = createAllProfiles();
  const isAdmin = () => props.me.role === 'admin';
  const runner = () => isMeetingRunner(props.meeting, props.me);
  const planned = () => props.meeting.status === 'planned';
  // Sprzątanie osieroconych obrazów karteczek (PAD-6): po przerwanym zapisie ostatniej partii
  // nie ma kolejnego zapisu, który by je usunął, więc robi to też otwarcie spotkania przez
  // admina albo prowadzącego (raz na spotkanie w tej karcie; po zakończeniu tylko admin).
  const sweep = createMemo(() => (runner() && !planned() ? props.meeting.id : null));
  createEffect(
    () => sweep(),
    (meetingId) => {
      if (meetingId === null || !claimOrphanSweep(meetingId)) return;
      void sweepOrphanSheetImages(auth.client, meetingId);
    },
  );
  // Uczestnicy także usunięci w międzyczasie (MEM-5: zostają w historii spotkania).
  const people = createMemo(() =>
    props.meeting.participants
      .map((id) => profiles().data?.get(id) ?? props.members.find((member) => member.id === id))
      .filter((person): person is Profile => person !== undefined)
      .sort(compareProfiles),
  );
  const host = createMemo(() => {
    const hostId = props.meeting.host_id;
    return hostId ? props.members.find((member) => member.id === hostId) : undefined;
  });
  const chip = createMemo((): { tone: 'neutral' | 'success' | 'accent'; label: string } => {
    const labels = t.meetings.status;
    if (props.meeting.status === 'in_progress')
      return { tone: 'success', label: labels.inProgress };
    if (props.meeting.status === 'finished') return { tone: 'neutral', label: labels.finished };
    return props.meeting.voting_open
      ? { tone: 'accent', label: labels.votingOpen }
      : { tone: 'neutral', label: labels.gamesChosen };
  });
  const peopleId = () => `${props.meeting.id}-people`;

  return (
    <div class="meeting-view">
      <div class="meeting-view__meta">
        <StatusChip tone={chip().tone}>{chip().label}</StatusChip>
        <span class="meeting-view__date">
          <span aria-hidden="true">
            {formatMeetingDate(props.meeting.starts_at, props.timeZone)}
          </span>
          <span class="sr-only">{longMeetingDate(props.meeting.starts_at, props.timeZone)}</span>
        </span>
      </div>
      <div class="meeting-view__people">
        <AvatarStack
          people={people()
            .slice(0, 6)
            .map((member) => avatarPerson(member))}
          size={28}
        />
        <p class="meeting-widget__people">
          <strong>{plural(props.meeting.participants.length, t.hub.meeting.participants)}</strong>
          {' · '}
          {host() ? format(popup.hostLine, { name: host()?.first_name ?? '' }) : popup.adminHost}
        </p>
      </div>

      <Show when={runner() && props.meeting.status !== 'finished'}>
        <RunnerBox meeting={props.meeting} isAdmin={isAdmin()} />
      </Show>

      <Show when={planned()}>
        <DateVotingSection
          meeting={props.meeting}
          me={props.me}
          members={props.members}
          timeZone={props.timeZone}
        />
      </Show>

      <Show
        when={planned() && props.meeting.voting_open}
        fallback={<PlayingSection meeting={props.meeting} members={props.members} />}
      >
        <VotingSection meeting={props.meeting} me={props.me} members={props.members} />
      </Show>
      <Show when={!planned()}>
        <MeetingPlaysSection meeting={props.meeting} timeZone={props.timeZone} runner={runner()} />
        <MeetingSummarySection meetingId={props.meeting.id} />
      </Show>

      <section class="meeting-view__section" aria-labelledby={peopleId()}>
        <h3 id={peopleId()} class="meeting-view__head">
          {popup.participants}
        </h3>
        <Tray label={popup.participantsLabel}>
          <For each={people()} keyed={(member) => member.id}>
            {(member) => (
              <li class="tray__item">
                <div class="row meeting-person">
                  <ProfileAvatar profile={member()} size={36} decorative />
                  <span class="meeting-member__name">{fullName(member())}</span>
                  <span class="meeting-member__badges">
                    <Show when={member().role === 'admin'}>
                      <Badge tone="accent">{t.ui.adminBadge}</Badge>
                    </Show>
                    <Show when={member().id === props.meeting.host_id}>
                      <Badge tone="neutral">{popup.hostBadge}</Badge>
                    </Show>
                    <Show when={member().id === props.me.id}>
                      <Badge tone="ink">{t.ui.youBadge}</Badge>
                    </Show>
                  </span>
                </div>
              </li>
            )}
          </For>
        </Tray>
      </section>
    </div>
  );
}

/**
 * Pole akcji (DS §15 „Admin action box”). Zaplanowane: administrator publikuje gry (VOTE-5)
 * albo zmienia listę i otwiera głosowanie ponownie (VOTE-6); administrator i prowadzący
 * rozpoczynają spotkanie (RUN-1). W trakcie: „Zakończ spotkanie” (RUN-4). Obie zmiany statusu
 * mają potwierdzenie w osobnym dialogu. W trakcie także „Nowa partia” (RUN-2, RUN-3): kreator
 * gry, notesu i graczy; kilka partii może trwać naraz.
 */
function RunnerBox(props: { readonly meeting: Meeting; readonly isAdmin: boolean }) {
  const popups = useContext(PopupsContext);
  const reopen = createReopenVoting();
  const run = t.meetings.run;
  const start = () => (
    <Button
      fullWidth
      variant={props.isAdmin && props.meeting.voting_open ? 'secondary' : 'primary'}
      icon="play"
      onClick={() => popups.open({ kind: 'start-meeting', id: props.meeting.id })}
    >
      {run.start}
    </Button>
  );
  const publish = () => popups.open({ kind: 'publish-games', id: props.meeting.id });
  return (
    <div class="meeting-admin">
      <Switch>
        <Match when={props.meeting.status === 'in_progress'}>
          <p class="meeting-admin__text">{run.inProgressRunner}</p>
          <Button
            fullWidth
            icon="plus"
            onClick={() => popups.open({ kind: 'new-play', meetingId: props.meeting.id })}
          >
            {run.newPlay}
          </Button>
          <Button
            fullWidth
            variant="secondary"
            icon="flag"
            onClick={() => popups.open({ kind: 'finish-meeting', id: props.meeting.id })}
          >
            {run.finish}
          </Button>
        </Match>
        <Match when={!props.isAdmin}>
          <p class="meeting-admin__text">{run.plannedRunner}</p>
          {start()}
        </Match>
        <Match when={props.meeting.voting_open}>
          <p class="meeting-admin__text">{text.adminOpen}</p>
          <Button fullWidth onClick={publish}>
            {text.publish}
          </Button>
          {start()}
        </Match>
        <Match when={true}>
          <p class="meeting-admin__text">{text.adminClosed}</p>
          {start()}
          <Button fullWidth variant="secondary" icon="pencil" onClick={publish}>
            {text.republish}
          </Button>
          <Button
            fullWidth
            variant="secondary"
            icon="refresh"
            loading={reopen.state().isPending}
            onClick={() => reopen.mutate(props.meeting.id)}
          >
            {text.reopen}
          </Button>
        </Match>
      </Switch>
    </div>
  );
}

/**
 * Głosowanie (VOTE-1…VOTE-4, DS §15 „Vote row”, „Vote toggle”): wszystkie gry kolekcji
 * malejąco po głosach, z awatarami głosujących i wyszukiwarką. Przełącznik głosu mają tylko
 * uczestnicy; gry niepasujące do liczby uczestników mają oznaczenie, ale przyjmują głosy.
 */
function VotingSection(props: {
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly members: readonly Profile[];
}) {
  const games = createGameSearch(() => '');
  const votes = createMeetingVotes(() => props.meeting.id);
  const [query, setQuery] = createSignal('');
  const canVote = () => props.meeting.participants.includes(props.me.id);
  const ready = () => games().isSuccess && votes().isSuccess;
  const rows = createMemo(() => {
    const list = games().data;
    const cast = votes().data;
    if (!ready() || !list || !cast) return [];
    return voteRows(list, cast, {
      me: props.me.id,
      participants: props.meeting.participants.length,
      query: query(),
    });
  });
  const searching = () => query().trim() !== '';
  const headingId = () => `${props.meeting.id}-voting`;
  return (
    <section class="meeting-view__section" aria-labelledby={ready() ? headingId() : undefined}>
      <Show
        when={ready()}
        fallback={
          <QueryStatus
            isError={games().isError || votes().isError}
            onRetry={() => {
              void games().refetch();
              void votes().refetch();
            }}
          />
        }
      >
        <div class="meeting-view__head-row">
          <h3 id={headingId()} class="meeting-view__head">
            {text.title}
          </h3>
          <Show when={canVote()}>
            <span class="meeting-view__note">
              {format(text.myVotes, { n: myVoteCount(votes().data ?? [], props.me.id) })}
            </span>
          </Show>
        </div>
        <p class="meeting-form__hint meeting-view__intro">
          {canVote() ? text.intro : text.notParticipant}
        </p>
        <Show when={(games().data?.length ?? 0) > 0}>
          <SearchField
            label={text.searchLabel}
            placeholder={text.searchPlaceholder}
            value={query()}
            onValueChange={setQuery}
          />
        </Show>
        <p class="sr-only" role="status">
          {searching() ? plural(rows().length, text.results) : ''}
        </p>
        <Show
          when={rows().length > 0}
          fallback={
            <EmptyState
              icon={searching() ? 'search' : 'dice'}
              title={
                searching()
                  ? format(text.noResultsTitle, { query: query().trim() })
                  : text.emptyTitle
              }
              helper={searching() ? text.noResultsHelper : text.emptyHelper}
            />
          }
        >
          <Tray label={text.listLabel} class="vote-list">
            <For each={rows()} keyed={(row) => row.game.id}>
              {(row) => (
                <VoteItem
                  row={row()}
                  meeting={props.meeting}
                  me={props.me}
                  members={props.members}
                  canVote={canVote()}
                />
              )}
            </For>
          </Tray>
        </Show>
      </Show>
    </section>
  );
}

function voterPeople(voters: readonly string[], members: readonly Profile[]) {
  return voters.flatMap((id) => {
    const member = members.find((m) => m.id === id);
    return member ? [member] : [];
  });
}

interface VoteItemProps {
  readonly row: VoteRow;
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly members: readonly Profile[];
  readonly canVote: boolean;
}

function VoteItem(props: VoteItemProps) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const voters = createMemo(() => voterPeople(props.row.voters, props.members));
  const toggle = createMutation({
    mutationFn: (on: boolean) => {
      const target = {
        meetingId: props.meeting.id,
        gameId: props.row.game.id,
        profileId: props.me.id,
      };
      return on ? castVote(auth.client, target) : withdrawVote(auth.client, target);
    },
    onSuccess: (_, on) => {
      toast.show(on ? t.meetings.toasts.voted : t.meetings.toasts.withdrawn, 'success');
    },
    onError: (error) => {
      const reason = error instanceof VotingError ? error.reason : 'save';
      toast.show(text.errors[reason], 'error');
    },
    // Zwrócona obietnica trzyma mutację w toku do odświeżenia głosów: przełącznik nie wraca
    // na chwilę do starego stanu i nie da się kliknąć go drugi raz z nieaktualną wartością.
    // Błąd mógł wynikać ze zmiany spotkania (zamknięte, usunięte): odświeżamy też spotkanie.
    onSettled: (_, error) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: error ? meetingsKey : meetingVotesKey(props.meeting.id),
        }),
        queryClient.invalidateQueries({ queryKey: gameVoteTotalKey(props.row.game.id) }),
      ]),
  });
  const mine = () => {
    const state = toggle.state();
    return state.isPending ? !!state.variables : props.row.mine;
  };
  const mismatch = () => !props.row.fits && props.row.available;
  // Na niedostępną grę nie można zagłosować; oddany wcześniej głos można cofnąć.
  const locked = () => !props.row.available && !props.row.mine;
  const mismatchHint = () => format(text.mismatchHint, { n: props.meeting.participants.length });
  return (
    <li class="tray__item">
      <div class="row row--64 vote-row">
        <GameCover
          id={props.row.game.id}
          title={props.row.game.title}
          coverPath={props.row.game.cover_path}
          size="thumb"
          unavailable={!props.row.available}
        />
        <span class="vote-row__body">
          <span class="vote-row__name">{props.row.game.title}</span>
          <span class="vote-row__meta">
            <Show when={voters().length > 0}>
              <AvatarStack
                people={voters()
                  .slice(0, 5)
                  .map((member) => avatarPerson(member))}
                size={20}
              />
            </Show>
            <span>{votesLabel(props.row.voters.length)}</span>
            <Show when={mismatch()}>
              <span title={mismatchHint()} class="vote-row__badge">
                <Badge tone="warning">{mismatchLabel(props.row.game)}</Badge>
                <span class="sr-only">{mismatchHint()}</span>
              </span>
            </Show>
            <Show when={!props.row.available}>
              <span title={text.unavailableHint} class="vote-row__badge">
                <Badge tone="neutral">{text.unavailable}</Badge>
                <span class="sr-only">{text.unavailableHint}</span>
              </span>
            </Show>
          </span>
        </span>
        <Show when={props.canVote}>
          <button
            type="button"
            class={['vote-toggle', { 'vote-toggle--on': mine() }]}
            aria-pressed={ariaBool(mine())}
            aria-label={format(mine() ? text.voteOff : text.voteOn, {
              title: props.row.game.title,
            })}
            disabled={toggle.state().isPending || locked()}
            onClick={() => toggle.mutate(!props.row.mine)}
          >
            <Show when={mine()}>
              <Icon name="check" size={14} />
            </Show>
            <span aria-hidden="true">{mine() ? text.voted : text.vote}</span>
          </button>
        </Show>
      </div>
    </li>
  );
}

/**
 * Lista „Gramy w:” (VOTE-5) z liczbą głosów, które gra dostała. Przy grze z zapisaną partią
 * jest chip zwycięzców tej gry na spotkaniu (awatary i imiona). Gry rozegrane spoza listy
 * dochodzą na jej końcu (partię można rozpocząć w dowolnej grze kolekcji).
 */
function PlayingSection(props: {
  readonly meeting: Meeting;
  readonly members: readonly Profile[];
}) {
  const games = createPublishedGames(() => props.meeting.id);
  const votes = createMeetingVotes(() => props.meeting.id);
  const plays = createMeetingPlays(
    () => props.meeting.id,
    false,
    () => props.meeting.status !== 'planned',
  );
  const profiles = createAllProfiles();
  const headingId = () => `${props.meeting.id}-playing`;
  const winners = createMemo(() => gameWinners(plays().data ?? []));
  const rows = createMemo((): PlayingRow[] => {
    const list = games().data;
    if (!list) return [];
    return [
      ...list.map((game) => ({ game, published: true })),
      ...playedGames(plays().data ?? [])
        .filter((game) => !list.some((g) => g.id === game.id))
        .map((game) => ({ game, published: false })),
    ];
  });
  return (
    <section class="meeting-view__section" aria-labelledby={headingId()}>
      <h3 id={headingId()} class="meeting-view__head">
        {text.playing}
      </h3>
      <Switch>
        <Match when={!games().isSuccess || !votes().isSuccess}>
          <QueryStatus
            isError={games().isError || votes().isError}
            onRetry={() => {
              void games().refetch();
              void votes().refetch();
            }}
          />
        </Match>
        <Match when={rows().length === 0}>
          <p class="meeting-form__state">{text.playingEmpty}</p>
        </Match>
        <Match when={true}>
          <Tray label={text.playingLabel}>
            <For each={rows()} keyed={(row) => row.game.id}>
              {(row) => (
                <PlayingItem
                  row={row()}
                  votes={votes().data ?? []}
                  members={props.members}
                  participants={props.meeting.participants.length}
                  winners={(winners().get(row().game.id) ?? []).flatMap((id) => {
                    const person = profiles().data?.get(id);
                    return person ? [person] : [];
                  })}
                />
              )}
            </For>
          </Tray>
        </Match>
      </Switch>
    </section>
  );
}

interface PlayingRow {
  readonly game: Pick<PublishedGame, 'id' | 'title' | 'cover_path'> &
    Partial<Pick<PublishedGame, 'min_players' | 'max_players'>>;
  /** Na opublikowanej liście (z głosami); `false` = rozegrana spoza listy. */
  readonly published: boolean;
}

function PlayingItem(props: {
  readonly row: PlayingRow;
  readonly votes: readonly Vote[];
  readonly members: readonly Profile[];
  readonly participants: number;
  readonly winners: readonly Profile[];
}) {
  const voterIds = createMemo(() =>
    props.votes.filter((vote) => vote.game_id === props.row.game.id).map((v) => v.profile_id),
  );
  const voters = createMemo(() => voterPeople(voterIds(), props.members));
  // Liczba graczy tylko dla gier z opublikowanej listy (rozegrane spoza niej jej nie mają).
  const players = () => {
    const { min_players, max_players } = props.row.game;
    return min_players === undefined || max_players === undefined
      ? undefined
      : { min_players, max_players };
  };
  const mismatch = () => {
    const range = players();
    return range && !fitsPlayers(range, props.participants) ? range : undefined;
  };
  return (
    <li class="tray__item">
      <div class="row row--64 vote-row">
        <GameCover
          id={props.row.game.id}
          title={props.row.game.title}
          coverPath={props.row.game.cover_path}
          size="thumb"
        />
        <span class="vote-row__body">
          <span class="vote-row__name">{props.row.game.title}</span>
          <span class="vote-row__meta">
            <Show when={voters().length > 0}>
              <AvatarStack
                people={voters()
                  .slice(0, 5)
                  .map((member) => avatarPerson(member))}
                size={20}
              />
            </Show>
            <Show when={props.row.published}>
              <span>{votesLabel(voterIds().length)}</span>
            </Show>
            <Show when={mismatch()}>
              {(range) => <Badge tone="warning">{mismatchLabel(range())}</Badge>}
            </Show>
          </span>
        </span>
        <Show when={props.winners.length > 0}>
          <WinnerChip title={props.row.game.title} winners={props.winners} />
        </Show>
      </div>
    </li>
  );
}

/** Chip zwycięzców gry na spotkaniu: puchar, awatary i imiona (wspólne 1. miejsce: wszyscy). */
function WinnerChip(props: { readonly title: string; readonly winners: readonly Profile[] }) {
  const names = () => props.winners.map((person) => person.first_name).join(', ');
  const label = () => format(t.meetings.plays.winnersLabel, { title: props.title, names: names() });
  return (
    <span class="winner-chip" title={label()}>
      <Icon name="trophy" size={14} class="winner-chip__icon" />
      <span class="winner-chip__stack" aria-hidden="true">
        <For each={props.winners.slice(0, 3)} keyed={(person) => person.id}>
          {(person) => <ProfileAvatar profile={person()} size={20} ring="white" decorative />}
        </For>
      </span>
      <span class="winner-chip__names" aria-hidden="true">
        {names()}
      </span>
      <span class="sr-only">{label()}</span>
    </span>
  );
}

/**
 * Spotkanie usunięte z menu tego popupu: po zamknięciu potwierdzenia popup jest znów na górze,
 * a odświeżone dane mówią, że spotkania nie ma, więc zamyka się sam zamiast pokazywać
 * „Nie znaleziono”. Popup otwarty ze starego linku (spotkania nie było od początku) zostaje.
 */
function createCloseWhenDeleted(meeting: () => Meeting | null | undefined) {
  const popups = useContext(PopupsContext);
  const level = useContext(PopupLevelContext);
  let seen = false;
  createEffect(
    () => ({ current: meeting(), covered: level.covered }),
    ({ current, covered }) => {
      if (current) {
        seen = true;
      } else if (current === null && seen && !covered) {
        seen = false;
        popups.back();
      }
    },
  );
}

/** Menu spotkania w nagłówku popupu; liczba partii (`overview`) decyduje o „Usuń spotkanie”. */
function MeetingMenu(props: { readonly meeting: Meeting; readonly me: OwnProfile }) {
  const popups = useContext(PopupsContext);
  const overview = createMeetingOverview(() => props.meeting.id);
  const reopen = createReopenVoting();
  const label = t.meetings.view.actions;
  const items = createMemo((): MenuItem[] =>
    menuItems(
      props.meeting,
      overview().data,
      props.me.role === 'admin',
      isMeetingRunner(props.meeting, props.me),
    ).map(({ route, ...item }) => ({
      ...item,
      onSelect: () => (route ? popups.open(route) : reopen.mutate(props.meeting.id)),
    })),
  );
  return (
    <Show when={items().length > 0}>
      <Menu
        label={label}
        align="end"
        items={items()}
        trigger={(trigger) => (
          <button
            type="button"
            {...trigger}
            class="icon-btn icon-btn--36"
            aria-label={label}
            title={label}
          >
            <Icon name="more" />
          </button>
        )}
      />
    </Show>
  );
}
