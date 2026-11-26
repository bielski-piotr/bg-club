import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import type { OwnProfile } from '../auth/useOwnProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { GameCover } from '../react-shared/GameCover';
import { useClub } from '../hub/club';
import { format, t } from '../i18n';
import { InvalidPopup } from '../popups/InvalidPopup';
import { usePopups } from '../popups/popupContext';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { useMounted } from '../popups/useMounted';
import { Banner, Button, Tray, useToast } from '../ui';
import { localDateTime } from './datetime';
import {
  finishMeeting,
  MeetingError,
  meetingsKey,
  reopenMeeting,
  startMeeting,
  useMeeting,
  type Meeting,
} from './meetings';
import { isMeetingRunner, splitPlays, useMeetingPlays, type MeetingPlay } from './plays';
import { invalidatePlayData } from './playDelete';

const text = t.meetings.run;

type Action = 'start' | 'finish' | 'reopen';

const runActions = { start: startMeeting, finish: finishMeeting, reopen: reopenMeeting };
const successTexts = {
  start: t.meetings.toasts.started,
  finish: t.meetings.toasts.finished,
  reopen: t.meetings.toasts.meetingReopened,
};

/** Mutacja zmiany statusu: toast, zamknięcie dialogu i odświeżenie wszystkich spotkań. */
function useRunMutation(id: string, action: Action) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { back } = usePopups();
  const mounted = useMounted();
  return useMutation({
    mutationFn: () => runActions[action](client, id),
    onSuccess: () => {
      toast.show(successTexts[action], 'success');
      if (mounted.current) back();
    },
    // Także po błędzie: status albo partie mogły się zmienić w innej karcie.
    onSettled: () =>
      action === 'start'
        ? queryClient.invalidateQueries({ queryKey: meetingsKey })
        : invalidatePlayData(queryClient),
  });
}

function failureText(error: unknown): string {
  return error instanceof MeetingError ? t.meetings.errors[error.reason] : t.meetings.errors.save;
}

/**
 * Dialog do potwierdzenia, z którego nie da się wykonać akcji: spotkania nie ma, zalogowany go
 * nie prowadzi albo status się zmienił (stary link). `null` = można działać.
 */
function blocked(meeting: Meeting, me: OwnProfile, action: Action): string | null {
  if (!isMeetingRunner(meeting, me)) return text.notRunner;
  if (action === 'start' && meeting.status !== 'planned') return text.alreadyStarted;
  if (action === 'finish' && meeting.status !== 'in_progress') return text.notInProgress;
  return null;
}

/**
 * Potwierdzenie „Rozpocznij spotkanie” (RUN-1, DS §15 „Dialog variants”: ikona play na tle
 * akcentu). Rozpoczęcie zamyka głosowanie; drugie trwające spotkanie odrzuca baza (MTG-2).
 */
export function StartMeetingDialog({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const { back } = usePopups();
  const query = useMeeting(client, id);
  const run = useRunMutation(id, 'start');
  const meeting = query.data;

  if (!run.isSuccess && query.isSuccess && !meeting) return <InvalidPopup />;
  const reason = meeting && !run.isPending && !run.isSuccess ? blocked(meeting, me, 'start') : null;
  return (
    <PopupDialog
      title={text.startTitle}
      icon="play"
      description={
        meeting ? (
          <p>{format(text.startBody, { title: meeting.title })}</p>
        ) : (
          <QueryStatus isError={query.isError} onRetry={() => void query.refetch()} />
        )
      }
      footer={
        <>
          <Button variant="secondary" disabled={run.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            icon="play"
            loading={run.isPending}
            disabled={!meeting || reason !== null || run.isSuccess}
            onClick={() => run.mutate()}
          >
            {text.confirmStart}
          </Button>
        </>
      }
    >
      {meeting?.voting_open && reason === null ? (
        <Banner variant="info">{text.startVoting}</Banner>
      ) : null}
      {reason ? <Banner variant="warning">{reason}</Banner> : null}
      {run.isError ? <Banner variant="error">{failureText(run.error)}</Banner> : null}
    </PopupDialog>
  );
}

/**
 * „Zakończ spotkanie” (RUN-4). Partie w toku blokują zakończenie: zamiast potwierdzenia dialog
 * ostrzeżenia z ich listą (DS §15: ikona alert na żółtym tle i taca z wierszami h56). Gdy
 * szkic pojawi się w międzyczasie, baza odrzuci zakończenie, a odświeżona lista go pokaże.
 */
export function FinishMeetingDialog({ id, me }: { readonly id: string; readonly me: OwnProfile }) {
  const { client } = useAuth();
  const { back } = usePopups();
  const query = useMeeting(client, id);
  const plays = useMeetingPlays(client, id, true);
  const club = useClub(client);
  const run = useRunMutation(id, 'finish');
  const meeting = query.data;
  const timeZone = club.data?.timezone ?? FALLBACK_TIMEZONE;

  if (!run.isSuccess && query.isSuccess && !meeting) return <InvalidPopup />;
  const drafts = plays.data ? splitPlays(plays.data).drafts : [];
  const reason =
    meeting && !run.isPending && !run.isSuccess ? blocked(meeting, me, 'finish') : null;
  // Tylko świeża lista: partia w toku mogła zostać zapisana albo rozpoczęta przed chwilą.
  const ready =
    meeting !== undefined && meeting !== null && plays.isSuccess && plays.isFetchedAfterMount;

  if (ready && drafts.length > 0 && reason === null && !run.isSuccess) {
    return (
      <PopupDialog
        title={text.draftsTitle}
        icon="alert"
        tone="warning"
        description={<p>{text.draftsBody}</p>}
        footer={
          <Button variant="secondary" onClick={back}>
            {text.close}
          </Button>
        }
      >
        <Tray label={text.draftsLabel} className="drafts-tray">
          {drafts.map((play) => (
            <DraftRow key={play.id} play={play} timeZone={timeZone} />
          ))}
        </Tray>
      </PopupDialog>
    );
  }

  return (
    <PopupDialog
      title={text.finishTitle}
      icon="flag"
      description={
        meeting ? (
          <p>{format(text.finishBody, { title: meeting.title })}</p>
        ) : (
          <QueryStatus isError={query.isError} onRetry={() => void query.refetch()} />
        )
      }
      footer={
        <>
          <Button variant="secondary" disabled={run.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            icon="flag"
            loading={run.isPending}
            disabled={!ready || reason !== null || run.isSuccess}
            onClick={() => run.mutate()}
          >
            {text.confirmFinish}
          </Button>
        </>
      }
    >
      {plays.isError ? <QueryStatus isError onRetry={() => void plays.refetch()} /> : null}
      {reason ? <Banner variant="warning">{reason}</Banner> : null}
      {run.isError ? <Banner variant="error">{failureText(run.error)}</Banner> : null}
    </PopupDialog>
  );
}

/** Cofnięcie zakończenia wymaga potwierdzenia admina, także przy wejściu z linku (RUN-5). */
export function ReopenMeetingDialog({ id }: { readonly id: string }) {
  const { client } = useAuth();
  const { back } = usePopups();
  const query = useMeeting(client, id);
  const run = useRunMutation(id, 'reopen');
  const meeting = query.data;
  if (!run.isSuccess && query.isSuccess && !meeting) return <InvalidPopup />;
  const reason =
    meeting && meeting.status !== 'finished' && !run.isPending && !run.isSuccess
      ? t.meetings.errors.notFinished
      : null;
  return (
    <PopupDialog
      title={text.reopenTitle}
      icon="refresh"
      description={
        meeting ? (
          <p>{format(text.reopenBody, { title: meeting.title })}</p>
        ) : (
          <QueryStatus isError={query.isError} onRetry={() => void query.refetch()} />
        )
      }
      footer={
        <>
          <Button variant="secondary" disabled={run.isPending} onClick={back}>
            {text.cancel}
          </Button>
          <Button
            icon="refresh"
            loading={run.isPending}
            disabled={!meeting || reason !== null || run.isSuccess}
            onClick={() => run.mutate()}
          >
            {text.confirmReopen}
          </Button>
        </>
      }
    >
      {reason ? <Banner variant="warning">{reason}</Banner> : null}
      {run.isError ? (
        <Banner variant="error">
          {run.error instanceof MeetingError && run.error.reason === 'forbidden'
            ? text.reopenAdminOnly
            : failureText(run.error)}
        </Banner>
      ) : null}
    </PopupDialog>
  );
}

function DraftRow({ play, timeZone }: { readonly play: MeetingPlay; readonly timeZone: string }) {
  return (
    <li className="tray__item">
      <div className="row draft-row">
        <GameCover
          id={play.game.id}
          title={play.game.title}
          coverPath={play.game.cover_path}
          size="thumb"
        />
        <span className="draft-row__body">
          <span className="draft-row__name">{play.game.title}</span>
          <span className="draft-row__meta">
            {format(t.meetings.plays.liveSince, {
              time: localDateTime(play.started_at, timeZone).time,
            })}
          </span>
        </span>
      </div>
    </li>
  );
}
