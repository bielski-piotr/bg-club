import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { GameCover } from '../games/GameCover';
import { useGameSearch } from '../games/games';
import { useClub } from '../hub/club';
import { gameVoteTotalKey } from '../games/gameVoteTotal';
import { format, plural, t } from '../i18n';
import { usePopupLevel, usePopups } from '../popups/popupContext';
import { PopupModal } from '../popups/PopupModal';
import { QueryStatus } from '../popups/QueryStatus';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import {
  avatarPerson,
  compareProfiles,
  fullName,
  useAllProfiles,
  useMembers,
  type Profile,
} from '../profile/profiles';
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
  useToast,
} from '../ui';
import { cx } from '../ui/cx';
import { formatMeetingDate, longMeetingDate } from './datetime';
import { MeetingPlaysSection } from './MeetingPlays';
import { MeetingAchievementsSection } from './MeetingAchievements';
import { MeetingSummarySection } from './MeetingSummary';
import { claimOrphanSweep, sweepOrphanSheetImages } from '../sheets/sheetImages';
import { meetingsKey, useMeeting, type Meeting } from './meetings';
import { menuItems } from './meetingMenu';
import { isMeetingRunner } from './plays';
import { useMeetingOverview, type MeetingOverview } from './overview';
import {
  castVote,
  fitsPlayers,
  mismatchLabel,
  myVoteCount,
  meetingVotesKey,
  useMeetingVotes,
  usePublishedGames,
  voteRows,
  votesLabel,
  VotingError,
  withdrawVote,
  type PublishedGame,
  type Vote,
  type VoteRow,
  useReopenVoting,
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
 */
export function MeetingPopup({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const meeting = useMeeting(client, id);
  const club = useClub(client);
  const members = useMembers(client);
  useCloseWhenDeleted(meeting.data);

  if (!meeting.isSuccess || !club.isSuccess || !members.isSuccess) {
    return (
      <PopupModal title={meeting.data?.title ?? t.ui.loading}>
        <QueryStatus
          isError={meeting.isError || club.isError || members.isError}
          onRetry={() => {
            void meeting.refetch();
            void club.refetch();
            void members.refetch();
          }}
        />
      </PopupModal>
    );
  }
  if (!meeting.data) {
    return (
      <PopupModal title={popup.notFoundTitle}>
        <p className="meeting-form__state">{popup.notFoundBody}</p>
      </PopupModal>
    );
  }
  return (
    <MeetingView
      meeting={meeting.data}
      me={me}
      timeZone={club.data?.timezone ?? FALLBACK_TIMEZONE}
      members={members.data}
    />
  );
}

interface ViewProps {
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly timeZone: string;
  readonly members: readonly Profile[];
}

function MeetingView({ meeting, me, timeZone, members }: ViewProps) {
  const { client } = useAuth();
  const overview = useMeetingOverview(client, meeting.id);
  const isAdmin = me.role === 'admin';
  const runner = isMeetingRunner(meeting, me);
  const profiles = useAllProfiles(client);
  // Sprzątanie osieroconych obrazów karteczek (PAD-6): po przerwanym zapisie ostatniej partii
  // nie ma kolejnego zapisu, który by je usunął, więc robi to też otwarcie spotkania przez
  // admina albo prowadzącego (raz na spotkanie w tej karcie; po zakończeniu tylko admin).
  const status = meeting.status;
  useEffect(() => {
    if (!runner || status === 'planned' || !claimOrphanSweep(meeting.id)) return;
    void sweepOrphanSheetImages(client, meeting.id);
  }, [client, meeting.id, runner, status]);
  // Uczestnicy także usunięci w międzyczasie (MEM-5: zostają w historii spotkania).
  const people = meeting.participants
    .map((id) => profiles.data?.get(id) ?? members.find((member) => member.id === id))
    .filter((person): person is Profile => person !== undefined)
    .sort(compareProfiles);
  const host = meeting.host_id ? members.find((member) => member.id === meeting.host_id) : null;
  const planned = meeting.status === 'planned';
  const labels = t.meetings.status;
  const chip =
    meeting.status === 'in_progress' ? (
      <StatusChip tone="success">{labels.inProgress}</StatusChip>
    ) : meeting.status === 'finished' ? (
      <StatusChip tone="neutral">{labels.finished}</StatusChip>
    ) : meeting.voting_open ? (
      <StatusChip tone="accent">{labels.votingOpen}</StatusChip>
    ) : (
      <StatusChip tone="neutral">{labels.gamesChosen}</StatusChip>
    );

  return (
    <PopupModal
      title={meeting.title}
      actions={
        menuItems(meeting, overview.data, isAdmin, runner).length > 0 ? (
          <MeetingMenu
            meeting={meeting}
            overview={overview.data}
            isAdmin={isAdmin}
            runner={runner}
          />
        ) : undefined
      }
    >
      <div className="meeting-view">
        <div className="meeting-view__meta">
          {chip}
          <span className="meeting-view__date">
            <span aria-hidden="true">{formatMeetingDate(meeting.starts_at, timeZone)}</span>
            <span className="sr-only">{longMeetingDate(meeting.starts_at, timeZone)}</span>
          </span>
        </div>
        <div className="meeting-view__people">
          <AvatarStack
            people={people.slice(0, 6).map((member) => avatarPerson(member))}
            size={28}
          />
          <p className="meeting-widget__people">
            <strong>{plural(meeting.participants.length, t.hub.meeting.participants)}</strong>
            {' · '}
            {host ? format(popup.hostLine, { name: host.first_name }) : popup.adminHost}
          </p>
        </div>

        {runner && meeting.status !== 'finished' ? (
          <RunnerBox meeting={meeting} isAdmin={isAdmin} />
        ) : null}

        {planned && meeting.voting_open ? (
          <VotingSection meeting={meeting} me={me} members={members} />
        ) : (
          <PlayingSection meeting={meeting} members={members} />
        )}
        {!planned ? (
          <MeetingPlaysSection
            meeting={meeting}
            timeZone={timeZone}
            winners={overview.data?.winners}
            runner={runner}
            admin={isAdmin}
          />
        ) : null}
        {!planned ? <MeetingSummarySection meetingId={meeting.id} /> : null}
        {/* Także zaplanowane: zamknięcie głosowania może odblokować Głos ludu (Q18). */}
        <MeetingAchievementsSection meetingId={meeting.id} />

        <section className="meeting-view__section" aria-labelledby={`${meeting.id}-people`}>
          <h3 id={`${meeting.id}-people`} className="meeting-view__head">
            {popup.participants}
          </h3>
          <Tray label={popup.participantsLabel}>
            {people.map((member) => (
              <li key={member.id} className="tray__item">
                <div className="row meeting-person">
                  <ProfileAvatar profile={member} size={36} decorative />
                  <span className="meeting-member__name">{fullName(member)}</span>
                  <span className="meeting-member__badges">
                    {member.role === 'admin' ? (
                      <Badge tone="accent">{t.ui.adminBadge}</Badge>
                    ) : null}
                    {member.id === meeting.host_id ? (
                      <Badge tone="neutral">{popup.hostBadge}</Badge>
                    ) : null}
                    {member.id === me.id ? <Badge tone="ink">{t.ui.youBadge}</Badge> : null}
                  </span>
                </div>
              </li>
            ))}
          </Tray>
        </section>
      </div>
    </PopupModal>
  );
}

/**
 * Pole akcji (DS §15 „Admin action box”). Zaplanowane: administrator publikuje gry (VOTE-5)
 * albo zmienia listę i otwiera głosowanie ponownie (VOTE-6); administrator i prowadzący
 * rozpoczynają spotkanie (RUN-1). W trakcie: „Zakończ spotkanie” (RUN-4). Obie zmiany statusu
 * mają potwierdzenie w osobnym dialogu. W trakcie także „Nowa partia” (RUN-2, RUN-3): kreator
 * gry, notesu i graczy; kilka partii może trwać naraz.
 */
function RunnerBox({ meeting, isAdmin }: { readonly meeting: Meeting; readonly isAdmin: boolean }) {
  const { client } = useAuth();
  const { open } = usePopups();
  const reopen = useReopenVoting(client);
  const run = t.meetings.run;
  if (meeting.status === 'in_progress') {
    return (
      <div className="meeting-admin">
        <p className="meeting-admin__text">{run.inProgressRunner}</p>
        <Button
          fullWidth
          icon="plus"
          onClick={() => open({ kind: 'new-play', meetingId: meeting.id })}
        >
          {run.newPlay}
        </Button>
        <Button
          fullWidth
          variant="secondary"
          icon="flag"
          onClick={() => open({ kind: 'finish-meeting', id: meeting.id })}
        >
          {run.finish}
        </Button>
      </div>
    );
  }
  const start = (
    <Button
      fullWidth
      variant={isAdmin && meeting.voting_open ? 'secondary' : 'primary'}
      icon="play"
      onClick={() => open({ kind: 'start-meeting', id: meeting.id })}
    >
      {run.start}
    </Button>
  );
  if (!isAdmin) {
    return (
      <div className="meeting-admin">
        <p className="meeting-admin__text">{run.plannedRunner}</p>
        {start}
      </div>
    );
  }
  return (
    <div className="meeting-admin">
      <p className="meeting-admin__text">
        {meeting.voting_open ? text.adminOpen : text.adminClosed}
      </p>
      {meeting.voting_open ? (
        <>
          <Button fullWidth onClick={() => open({ kind: 'publish-games', id: meeting.id })}>
            {text.publish}
          </Button>
          {start}
        </>
      ) : (
        <>
          {start}
          <Button
            fullWidth
            variant="secondary"
            icon="pencil"
            onClick={() => open({ kind: 'publish-games', id: meeting.id })}
          >
            {text.republish}
          </Button>
          <Button
            fullWidth
            variant="secondary"
            icon="refresh"
            loading={reopen.isPending}
            onClick={() => reopen.mutate(meeting.id)}
          >
            {text.reopen}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Głosowanie (VOTE-1…VOTE-4, DS §15 „Vote row”, „Vote toggle”): wszystkie gry kolekcji
 * malejąco po głosach, z awatarami głosujących i wyszukiwarką. Przełącznik głosu mają tylko
 * uczestnicy; gry niepasujące do liczby uczestników mają oznaczenie, ale przyjmują głosy.
 */
function VotingSection({
  meeting,
  me,
  members,
}: {
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly members: readonly Profile[];
}) {
  const { client } = useAuth();
  const games = useGameSearch(client, '');
  const votes = useMeetingVotes(client, meeting.id);
  const [query, setQuery] = useState('');
  const canVote = meeting.participants.includes(me.id);

  if (!games.isSuccess || !votes.isSuccess) {
    return (
      <section className="meeting-view__section">
        <QueryStatus
          isError={games.isError || votes.isError}
          onRetry={() => {
            void games.refetch();
            void votes.refetch();
          }}
        />
      </section>
    );
  }
  const rows = voteRows(games.data, votes.data, {
    me: me.id,
    participants: meeting.participants.length,
    query,
  });
  const searching = query.trim() !== '';
  const headingId = `${meeting.id}-voting`;
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <div className="meeting-view__head-row">
        <h3 id={headingId} className="meeting-view__head">
          {text.title}
        </h3>
        {canVote ? (
          <span className="meeting-view__note">
            {format(text.myVotes, { n: myVoteCount(votes.data, me.id) })}
          </span>
        ) : null}
      </div>
      <p className="meeting-form__hint meeting-view__intro">
        {canVote ? text.intro : text.notParticipant}
      </p>
      {games.data.length > 0 ? (
        <SearchField
          label={text.searchLabel}
          placeholder={text.searchPlaceholder}
          value={query}
          onValueChange={setQuery}
        />
      ) : null}
      <p className="sr-only" role="status">
        {searching ? plural(rows.length, text.results) : ''}
      </p>
      {rows.length > 0 ? (
        <Tray label={text.listLabel} className="vote-list">
          {rows.map((row) => (
            <VoteItem
              key={row.game.id}
              row={row}
              meeting={meeting}
              me={me}
              members={members}
              canVote={canVote}
            />
          ))}
        </Tray>
      ) : (
        <EmptyState
          icon={searching ? 'search' : 'dice'}
          title={searching ? format(text.noResultsTitle, { query: query.trim() }) : text.emptyTitle}
          helper={searching ? text.noResultsHelper : text.emptyHelper}
        />
      )}
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

function VoteItem({ row, meeting, me, members, canVote }: VoteItemProps) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { game } = row;
  const voters = voterPeople(row.voters, members);
  const toggle = useMutation({
    mutationFn: (on: boolean) => {
      const target = { meetingId: meeting.id, gameId: game.id, profileId: me.id };
      return on ? castVote(client, target) : withdrawVote(client, target);
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
          queryKey: error ? meetingsKey : meetingVotesKey(meeting.id),
        }),
        queryClient.invalidateQueries({ queryKey: gameVoteTotalKey(game.id) }),
      ]),
  });
  const mine = toggle.isPending ? toggle.variables : row.mine;
  const mismatch = !row.fits;
  return (
    <li className="tray__item">
      <div className="row row--64 vote-row">
        <GameCover id={game.id} title={game.title} coverPath={game.cover_path} size="thumb" />
        <span className="vote-row__body">
          <span className="vote-row__name">{game.title}</span>
          <span className="vote-row__meta">
            {voters.length > 0 ? (
              <AvatarStack
                people={voters.slice(0, 5).map((member) => avatarPerson(member))}
                size={20}
              />
            ) : null}
            <span>{votesLabel(row.voters.length)}</span>
            {mismatch ? (
              <span
                title={format(text.mismatchHint, { n: meeting.participants.length })}
                className="vote-row__badge"
              >
                <Badge tone="warning">{mismatchLabel(game)}</Badge>
                <span className="sr-only">
                  {format(text.mismatchHint, { n: meeting.participants.length })}
                </span>
              </span>
            ) : null}
          </span>
        </span>
        {canVote ? (
          <button
            type="button"
            className={cx('vote-toggle', mine && 'vote-toggle--on')}
            aria-pressed={mine}
            aria-label={format(mine ? text.voteOff : text.voteOn, { title: game.title })}
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(!row.mine)}
          >
            {mine ? <Icon name="check" size={14} /> : null}
            <span aria-hidden="true">{mine ? text.voted : text.vote}</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** Lista „Gramy w:” (VOTE-5) z liczbą głosów, które gra dostała. */
function PlayingSection({
  meeting,
  members,
}: {
  readonly meeting: Meeting;
  readonly members: readonly Profile[];
}) {
  const { client } = useAuth();
  const games = usePublishedGames(client, meeting.id);
  const votes = useMeetingVotes(client, meeting.id);
  const headingId = `${meeting.id}-playing`;
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <h3 id={headingId} className="meeting-view__head">
        {text.playing}
      </h3>
      {!games.isSuccess || !votes.isSuccess ? (
        <QueryStatus
          isError={games.isError || votes.isError}
          onRetry={() => {
            void games.refetch();
            void votes.refetch();
          }}
        />
      ) : games.data.length === 0 ? (
        <p className="meeting-form__state">{text.playingEmpty}</p>
      ) : (
        <Tray label={text.playingLabel}>
          {games.data.map((game) => (
            <PlayingItem
              key={game.id}
              game={game}
              votes={votes.data}
              members={members}
              participants={meeting.participants.length}
            />
          ))}
        </Tray>
      )}
    </section>
  );
}

function PlayingItem({
  game,
  votes,
  members,
  participants,
}: {
  readonly game: PublishedGame;
  readonly votes: readonly Vote[];
  readonly members: readonly Profile[];
  readonly participants: number;
}) {
  const voterIds = votes.filter((vote) => vote.game_id === game.id).map((v) => v.profile_id);
  const voters = voterPeople(voterIds, members);
  const fits = fitsPlayers(game, participants);
  return (
    <li className="tray__item">
      <div className="row row--64 vote-row">
        <GameCover id={game.id} title={game.title} coverPath={game.cover_path} size="thumb" />
        <span className="vote-row__body">
          <span className="vote-row__name">{game.title}</span>
          <span className="vote-row__meta">
            {voters.length > 0 ? (
              <AvatarStack
                people={voters.slice(0, 5).map((member) => avatarPerson(member))}
                size={20}
              />
            ) : null}
            <span>{votesLabel(voterIds.length)}</span>
            {!fits ? <Badge tone="warning">{mismatchLabel(game)}</Badge> : null}
          </span>
        </span>
      </div>
    </li>
  );
}

/**
 * Spotkanie usunięte z menu tego popupu: po zamknięciu potwierdzenia popup jest znów na górze,
 * a odświeżone dane mówią, że spotkania nie ma, więc zamyka się sam zamiast pokazywać
 * „Nie znaleziono”. Popup otwarty ze starego linku (spotkania nie było od początku) zostaje.
 */
function useCloseWhenDeleted(meeting: Meeting | null | undefined) {
  const { back } = usePopups();
  const { covered } = usePopupLevel();
  const seen = useRef(false);
  useEffect(() => {
    if (meeting) {
      seen.current = true;
    } else if (meeting === null && seen.current && !covered) {
      seen.current = false;
      back();
    }
  }, [meeting, covered, back]);
}

function MeetingMenu({
  meeting,
  overview,
  isAdmin,
  runner,
}: {
  readonly meeting: Meeting;
  readonly overview: MeetingOverview | null | undefined;
  readonly isAdmin: boolean;
  readonly runner: boolean;
}) {
  const { client } = useAuth();
  const { open } = usePopups();
  const reopen = useReopenVoting(client);
  const label = t.meetings.view.actions;
  return (
    <Menu
      label={label}
      align="end"
      items={menuItems(meeting, overview, isAdmin, runner).map(({ route, ...item }) => ({
        ...item,
        onSelect: () => (route ? open(route) : reopen.mutate(meeting.id)),
      }))}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="icon-btn icon-btn--36"
          aria-label={label}
          title={label}
        >
          <Icon name="more" />
        </button>
      )}
    />
  );
}
