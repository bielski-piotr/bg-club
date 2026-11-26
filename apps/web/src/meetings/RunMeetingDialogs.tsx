import { createMemo, For, Show, useContext, type Accessor } from 'solid-js';
import type { OwnProfile } from '../auth/ownProfile';
import { FALLBACK_TIMEZONE } from '../club/timezones';
import { GameCover } from '../games/GameCover';
import { format, t } from '../i18n';
import { createClub } from '../club/clubData';
import { AuthContext } from '../auth/authContext';
import { PopupsContext } from '../popups/popupContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { InvalidPopup } from '../popups/InvalidPopup';
import { createMounted } from '../popups/leaveGuard';
import { PopupDialog } from '../popups/PopupDialog';
import { QueryStatus } from '../popups/QueryStatus';
import { createMutation } from '../lib/query';
import { Banner, Button, Tray } from '../ui';
import { localDateTime } from './datetime';
import { createMeeting, createMeetingPlays } from './meetingData';
import {
  finishMeeting,
  MeetingError,
  meetingsKey,
  reopenMeeting,
  startMeeting,
  type Meeting,
} from './meetings';
import { isMeetingRunner, splitPlays, type MeetingPlay } from './plays';
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
function createRunMutation(id: Accessor<string>, action: Action) {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const popups = useContext(PopupsContext);
  const mounted = createMounted();
  return createMutation({
    mutationFn: () => runActions[action](auth.client, id()),
    onSuccess: () => {
      toast.show(successTexts[action], 'success');
      if (mounted()) popups.back();
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
export function StartMeetingDialog(props: { readonly id: string; readonly me: OwnProfile }) {
  const popups = useContext(PopupsContext);
  const query = createMeeting(() => props.id);
  const run = createRunMutation(() => props.id, 'start');
  const meeting = () => query().data ?? undefined;
  const reason = () => {
    const current = meeting();
    const state = run.state();
    return current && !state.isPending && !state.isSuccess
      ? blocked(current, props.me, 'start')
      : null;
  };

  return (
    <Show
      when={!(!run.state().isSuccess && query().isSuccess && !meeting())}
      fallback={<InvalidPopup />}
    >
      <PopupDialog
        title={text.startTitle}
        icon="play"
        description={
          <Show
            when={meeting()}
            fallback={
              <QueryStatus isError={query().isError} onRetry={() => void query().refetch()} />
            }
          >
            {(current) => <p>{format(text.startBody, { title: current().title })}</p>}
          </Show>
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={run.state().isPending}
              onClick={() => popups.back()}
            >
              {text.cancel}
            </Button>
            <Button
              icon="play"
              loading={run.state().isPending}
              disabled={!meeting() || reason() !== null || run.state().isSuccess}
              onClick={() => run.mutate()}
            >
              {text.confirmStart}
            </Button>
          </>
        }
      >
        <Show when={meeting()?.voting_open && reason() === null}>
          <Banner variant="info">{text.startVoting}</Banner>
        </Show>
        <Show when={reason()}>{(shown) => <Banner variant="warning">{shown()}</Banner>}</Show>
        <Show when={run.state().isError}>
          <Banner variant="error">{failureText(run.state().error)}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}

/**
 * „Zakończ spotkanie” (RUN-4). Partie w toku blokują zakończenie: zamiast potwierdzenia dialog
 * ostrzeżenia z ich listą (DS §15: ikona alert na żółtym tle i taca z wierszami h56). Gdy
 * szkic pojawi się w międzyczasie, baza odrzuci zakończenie, a odświeżona lista go pokaże.
 * Jedno okno na oba warianty (przełączane tytuł, ikona, opis, treść i stopka): fokus zostaje.
 */
export function FinishMeetingDialog(props: { readonly id: string; readonly me: OwnProfile }) {
  const popups = useContext(PopupsContext);
  const query = createMeeting(() => props.id);
  const plays = createMeetingPlays(() => props.id, true);
  const club = createClub();
  const run = createRunMutation(() => props.id, 'finish');
  const meeting = () => query().data ?? undefined;
  const timeZone = () => club().data?.timezone ?? FALLBACK_TIMEZONE;
  const drafts = createMemo(() => {
    const list = plays().data;
    return list ? splitPlays(list).drafts : [];
  });
  const reason = () => {
    const current = meeting();
    const state = run.state();
    return current && !state.isPending && !state.isSuccess
      ? blocked(current, props.me, 'finish')
      : null;
  };
  // Tylko świeża lista: partia w toku mogła zostać zapisana albo rozpoczęta przed chwilą.
  const ready = () => !!meeting() && plays().isSuccess && plays().isFetchedAfterMount;
  const warning = () =>
    ready() && drafts().length > 0 && reason() === null && !run.state().isSuccess;

  return (
    <Show
      when={!(!run.state().isSuccess && query().isSuccess && !meeting())}
      fallback={<InvalidPopup />}
    >
      <PopupDialog
        title={warning() ? text.draftsTitle : text.finishTitle}
        icon={warning() ? 'alert' : 'flag'}
        tone={warning() ? 'warning' : undefined}
        description={
          <Show when={!warning()} fallback={<p>{text.draftsBody}</p>}>
            <Show
              when={meeting()}
              fallback={
                <QueryStatus isError={query().isError} onRetry={() => void query().refetch()} />
              }
            >
              {(current) => <p>{format(text.finishBody, { title: current().title })}</p>}
            </Show>
          </Show>
        }
        footer={
          <Show
            when={!warning()}
            fallback={
              <Button variant="secondary" onClick={() => popups.back()}>
                {text.close}
              </Button>
            }
          >
            <Button
              variant="secondary"
              disabled={run.state().isPending}
              onClick={() => popups.back()}
            >
              {text.cancel}
            </Button>
            <Button
              icon="flag"
              loading={run.state().isPending}
              disabled={!ready() || reason() !== null || run.state().isSuccess}
              onClick={() => run.mutate()}
            >
              {text.confirmFinish}
            </Button>
          </Show>
        }
      >
        <Show
          when={!warning()}
          fallback={
            <Tray label={text.draftsLabel} class="drafts-tray">
              <For each={drafts()} keyed={(play) => play.id}>
                {(play) => <DraftRow play={play()} timeZone={timeZone()} />}
              </For>
            </Tray>
          }
        >
          <Show when={plays().isError}>
            <QueryStatus isError onRetry={() => void plays().refetch()} />
          </Show>
          <Show when={reason()}>{(shown) => <Banner variant="warning">{shown()}</Banner>}</Show>
          <Show when={run.state().isError}>
            <Banner variant="error">{failureText(run.state().error)}</Banner>
          </Show>
        </Show>
      </PopupDialog>
    </Show>
  );
}

/** Cofnięcie zakończenia wymaga potwierdzenia admina, także przy wejściu z linku (RUN-5). */
export function ReopenMeetingDialog(props: { readonly id: string }) {
  const popups = useContext(PopupsContext);
  const query = createMeeting(() => props.id);
  const run = createRunMutation(() => props.id, 'reopen');
  const meeting = () => query().data ?? undefined;
  const reason = () => {
    const current = meeting();
    const state = run.state();
    return current && current.status !== 'finished' && !state.isPending && !state.isSuccess
      ? t.meetings.errors.notFinished
      : null;
  };
  const failure = () => {
    const error = run.state().error;
    return error instanceof MeetingError && error.reason === 'forbidden'
      ? text.reopenAdminOnly
      : failureText(error);
  };
  return (
    <Show
      when={!(!run.state().isSuccess && query().isSuccess && !meeting())}
      fallback={<InvalidPopup />}
    >
      <PopupDialog
        title={text.reopenTitle}
        icon="refresh"
        description={
          <Show
            when={meeting()}
            fallback={
              <QueryStatus isError={query().isError} onRetry={() => void query().refetch()} />
            }
          >
            {(current) => <p>{format(text.reopenBody, { title: current().title })}</p>}
          </Show>
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={run.state().isPending}
              onClick={() => popups.back()}
            >
              {text.cancel}
            </Button>
            <Button
              icon="refresh"
              loading={run.state().isPending}
              disabled={!meeting() || reason() !== null || run.state().isSuccess}
              onClick={() => run.mutate()}
            >
              {text.confirmReopen}
            </Button>
          </>
        }
      >
        <Show when={reason()}>{(shown) => <Banner variant="warning">{shown()}</Banner>}</Show>
        <Show when={run.state().isError}>
          <Banner variant="error">{failure()}</Banner>
        </Show>
      </PopupDialog>
    </Show>
  );
}

function DraftRow(props: { readonly play: MeetingPlay; readonly timeZone: string }) {
  return (
    <li class="tray__item">
      <div class="row draft-row">
        <GameCover
          id={props.play.game.id}
          title={props.play.game.title}
          coverPath={props.play.game.cover_path}
          size="thumb"
        />
        <span class="draft-row__body">
          <span class="draft-row__name">{props.play.game.title}</span>
          <span class="draft-row__meta">
            {format(t.meetings.plays.liveSince, {
              time: localDateTime(props.play.started_at, props.timeZone).time,
            })}
          </span>
        </span>
      </div>
    </li>
  );
}
