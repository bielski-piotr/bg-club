import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { format, t } from '../i18n';
import { QueryStatus } from '../popups/QueryStatus';
import { avatarPerson, type Profile } from '../profile/profiles';
import { AvatarStack, Badge, Button, Icon, Tray, useToast } from '../ui';
import { cx } from '../ui/cx';
import {
  castDateVote,
  DateVotingError,
  leadingDateOptions,
  meetingDateOptionsKey,
  useDateDecision,
  useMeetingDateOptions,
  withdrawDateVote,
  type DateOption,
} from './dateVoting';
import { formatMeetingDate, longMeetingDate } from './datetime';
import { meetingsKey, type Meeting } from './meetings';
import { votesLabel } from './voting';

const text = t.meetings.dateVoting;

/**
 * Głosowanie na termin (zaplanowane spotkanie z propozycjami): terminy od najwcześniejszego
 * z głosującymi, przełącznik głosu dla uczestników przy otwartym głosowaniu, a dla
 * administratora „Wybierz” (termin spotkania, zamyka głosowanie) i ponowne otwarcie.
 * Głosy są opinią: termin spotkania nie musi być tym z największą liczbą głosów.
 */
export function DateVotingSection({
  meeting,
  me,
  members,
  timeZone,
}: {
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly members: readonly Profile[];
  readonly timeZone: string;
}) {
  const { client } = useAuth();
  const options = useMeetingDateOptions(client, meeting.id);
  const decision = useDateDecision(client);
  const isAdmin = me.role === 'admin';
  const canVote = meeting.date_voting_open && meeting.participants.includes(me.id);
  const headingId = `${meeting.id}-date-voting`;

  // Bez propozycji sekcji nie ma (termin podał administrator).
  if (options.data?.length === 0) return null;
  if (!options.data && !options.isError) return null;
  const leading = leadingDateOptions(options.data ?? []);
  return (
    <section className="meeting-view__section" aria-labelledby={headingId}>
      <h3 id={headingId} className="meeting-view__head">
        {text.title}
      </h3>
      <p className="meeting-form__hint meeting-view__intro">
        {!meeting.date_voting_open
          ? text.introClosed
          : meeting.participants.includes(me.id)
            ? text.intro
            : text.notParticipant}
      </p>
      {!options.data ? (
        <QueryStatus isError={options.isError} onRetry={() => void options.refetch()} />
      ) : (
        <Tray label={text.listLabel} className="vote-list">
          {options.data.map((option) => (
            <DateOptionItem
              key={option.id}
              option={option}
              meeting={meeting}
              me={me}
              members={members}
              timeZone={timeZone}
              canVote={canVote}
              leading={leading.has(option.id)}
              onChoose={
                isAdmin
                  ? () =>
                      decision.mutate({
                        kind: 'decide',
                        meetingId: meeting.id,
                        optionId: option.id,
                      })
                  : undefined
              }
              choosing={
                decision.isPending &&
                decision.variables.kind === 'decide' &&
                decision.variables.optionId === option.id
              }
            />
          ))}
        </Tray>
      )}
      {isAdmin ? (
        <div className="date-voting__admin">
          {meeting.date_voting_open ? (
            <p className="meeting-form__hint">{text.adminNote}</p>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              loading={decision.isPending && decision.variables.kind === 'reopen'}
              onClick={() => decision.mutate({ kind: 'reopen', meetingId: meeting.id })}
            >
              {text.reopen}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function DateOptionItem({
  option,
  meeting,
  me,
  members,
  timeZone,
  canVote,
  leading,
  onChoose,
  choosing,
}: {
  readonly option: DateOption;
  readonly meeting: Meeting;
  readonly me: OwnProfile;
  readonly members: readonly Profile[];
  readonly timeZone: string;
  readonly canVote: boolean;
  readonly leading: boolean;
  readonly onChoose: (() => void) | undefined;
  readonly choosing: boolean;
}) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const date = formatMeetingDate(option.starts_at, timeZone);
  const mineNow = option.voters.includes(me.id);
  const voters = option.voters.flatMap((id) => {
    const member = members.find((m) => m.id === id);
    return member ? [avatarPerson(member)] : [];
  });
  const chosen = new Date(option.starts_at).getTime() === new Date(meeting.starts_at).getTime();
  const toggle = useMutation({
    mutationFn: (on: boolean) => {
      const target = { meetingId: meeting.id, optionId: option.id, profileId: me.id };
      return on ? castDateVote(client, target) : withdrawDateVote(client, target);
    },
    onSuccess: (_, on) =>
      toast.show(on ? t.meetings.toasts.voted : t.meetings.toasts.withdrawn, 'success'),
    onError: (error) =>
      toast.show(text.errors[error instanceof DateVotingError ? error.reason : 'save'], 'error'),
    // Jak głos na grę: mutacja trwa do odświeżenia, a po błędzie odświeżamy też spotkanie.
    onSettled: (_, error) =>
      queryClient.invalidateQueries({
        queryKey: error ? meetingsKey : meetingDateOptionsKey(meeting.id),
      }),
  });
  const mine = toggle.isPending ? toggle.variables : mineNow;
  return (
    <li className="tray__item">
      <div className={cx('row row--64 vote-row date-row', chosen && 'date-row--chosen')}>
        <span className="date-row__icon" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <span className="vote-row__body">
          <span className="vote-row__name">
            <span aria-hidden="true">{date}</span>
            <span className="sr-only">{longMeetingDate(option.starts_at, timeZone)}</span>
          </span>
          <span className="vote-row__meta">
            {voters.length > 0 ? <AvatarStack people={voters.slice(0, 5)} size={20} /> : null}
            <span>{votesLabel(option.voters.length)}</span>
            {chosen ? <Badge tone="success">{text.chosen}</Badge> : null}
            {leading && !chosen ? <Badge tone="accent">{text.leading}</Badge> : null}
          </span>
        </span>
        {canVote || (onChoose && (!chosen || meeting.date_voting_open)) ? (
          <span className="date-row__actions">
            {canVote ? (
              <button
                type="button"
                className={cx('vote-toggle', mine && 'vote-toggle--on')}
                aria-pressed={mine}
                aria-label={format(mine ? text.voteOff : text.voteOn, { date })}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(!mineNow)}
              >
                {mine ? <Icon name="check" size={14} /> : null}
                <span aria-hidden="true">{mine ? text.voted : text.vote}</span>
              </button>
            ) : null}
            {onChoose && (!chosen || meeting.date_voting_open) ? (
              <Button
                size="sm"
                variant="secondary"
                loading={choosing}
                aria-label={format(text.chooseLabel, { date })}
                onClick={onChoose}
              >
                {text.choose}
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </li>
  );
}
