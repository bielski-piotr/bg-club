import { useContext, type Accessor } from 'solid-js';
import { t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { QueryClientContext } from '../lib/queryClient';
import { ToastContext } from '../ui/toastContext';
import { createQuery, ifEnabled } from '../lib/query';
import { action, createOptimistic } from 'solid-js';
import {
  decideMeetingDate,
  DateVotingError,
  meetingDateOptionsQuery,
  reopenDateVoting,
} from './dateVoting';
import { hubMeetingQuery, meetingPlayersQuery, meetingQuery, meetingsKey } from './meetings';
import { calendarMonthQuery, meetingOverviewQuery, timelineQuery } from './overview';
import { meetingPlaysQuery, playQuery } from './plays';
import { meetingRecordsQuery, recordPreviewQuery, type PreviewResult } from './records';
import { meetingSummaryQuery } from './summary';
import type { YearMonth } from './calendar';
import { meetingVotesQuery, publishedGamesQuery, reopenVoting, VotingError } from './voting';

/*
 * Zapytania i mutacje spotkań: opcje z modułów
 * bez frameworka na wspólnym cache. Klient Supabase z `AuthContext`; parametry jako akcesory.
 */

/** Spotkanie (`meetingQuery`); `null` = nie ma takiego. */
export function createMeeting(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => meetingQuery(auth.client, id()));
}

/** Spotkanie widżetu: trwające albo najbliższe zaplanowane (`hubMeetingQuery`). */
export function createHubMeeting() {
  const auth = useContext(AuthContext);
  return createQuery(() => hubMeetingQuery(auth.client));
}

/** Uczestnicy z partią w spotkaniu (`meetingPlayersQuery`). */
export function createMeetingPlayers(id: Accessor<string>, enabled: Accessor<boolean>) {
  const auth = useContext(AuthContext);
  return createQuery(() => (enabled() ? meetingPlayersQuery(auth.client, id(), true) : null));
}

/** Timeline huba (`timelineQuery`). */
export function createTimeline() {
  const auth = useContext(AuthContext);
  return createQuery(() => timelineQuery(auth.client));
}

/** Spotkania miesiąca kalendarza (`calendarMonthQuery`). */
export function createCalendarMonth(ym: Accessor<YearMonth>) {
  const auth = useContext(AuthContext);
  return createQuery(() => calendarMonthQuery(auth.client, ym()));
}

/** Spotkanie z podsumowaniem partii (`meetingOverviewQuery`). */
export function createMeetingOverview(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => meetingOverviewQuery(auth.client, id()));
}

/**
 * Partie spotkania (`meetingPlaysQuery`). `fresh`: pobiera je od nowa przy każdym otwarciu
 * (dialog zakończenia, RUN-4).
 */
export function createMeetingPlays(
  meetingId: Accessor<string>,
  fresh = false,
  enabled: Accessor<boolean> = () => true,
) {
  const auth = useContext(AuthContext);
  return createQuery(() => (enabled() ? meetingPlaysQuery(auth.client, meetingId(), fresh) : null));
}

/** Partia z kartką i szkicem (`playQuery`); `null` = nie ma jej. */
export function createPlay(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => playQuery(auth.client, id()));
}

/** Głosy oddane w spotkaniu (`meetingVotesQuery`). */
export function createMeetingVotes(meetingId: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => meetingVotesQuery(auth.client, meetingId()));
}

/** Opublikowane gry spotkania (`publishedGamesQuery`). */
export function createPublishedGames(meetingId: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => publishedGamesQuery(auth.client, meetingId()));
}

/** Propozycje terminu spotkania (`meetingDateOptionsQuery`). */
export function createMeetingDateOptions(
  meetingId: Accessor<string>,
  enabled: Accessor<boolean> = () => true,
) {
  const auth = useContext(AuthContext);
  return createQuery(() => (enabled() ? meetingDateOptionsQuery(auth.client, meetingId()) : null));
}

/** Zmiany w klasyfikacji punktów po spotkaniu (`meetingSummaryQuery`). */
export function createMeetingSummary(
  meetingId: Accessor<string>,
  games: Accessor<readonly string[]> = () => [],
) {
  const auth = useContext(AuthContext);
  return createQuery(() => meetingSummaryQuery(auth.client, meetingId(), games()));
}

/** Rekordy ustanowione w partiach spotkania (`meetingRecordsQuery`). */
export function createMeetingRecords(
  meetingId: Accessor<string>,
  enabled: Accessor<boolean> = () => true,
) {
  const auth = useContext(AuthContext);
  return createQuery(() => (enabled() ? meetingRecordsQuery(auth.client, meetingId()) : null));
}

/** Podgląd rekordów partii w toku przed zapisem (`recordPreviewQuery`). */
export function createRecordPreview(
  playId: Accessor<string>,
  results: Accessor<readonly PreviewResult[] | null>,
) {
  const auth = useContext(AuthContext);
  return createQuery(() => ifEnabled(recordPreviewQuery(auth.client, playId(), results())));
}

/**
 * „Otwórz głosowanie ponownie” (VOTE-6) z popupu i z menu widżetu: toast sukcesu albo błędu
 * i odświeżenie spotkań (także po błędzie, bo stan mógł się zmienić gdzie indziej).
 */
export function createReopenVoting() {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const [pending, setPending] = createOptimistic(false);
  const run = action(function* (meetingId: string) {
    setPending(true);
    try {
      yield reopenVoting(auth.client, meetingId);
      toast.show(t.meetings.toasts.reopened, 'success');
    } catch (error) {
      toast.show(
        t.meetings.voting.errors[error instanceof VotingError ? error.reason : 'save'],
        'error',
      );
    }
    // Także po błędzie: stan mógł się zmienić gdzie indziej.
    yield queryClient.invalidateQueries({ queryKey: meetingsKey });
  });
  return { run, pending };
}

export type DateDecision =
  | { readonly kind: 'decide'; readonly meetingId: string; readonly optionId: string }
  | { readonly kind: 'reopen'; readonly meetingId: string };

/** Decyzja administratora o terminie albo ponowne otwarcie: toast i odświeżenie spotkań. */
export function createDateDecision() {
  const auth = useContext(AuthContext);
  const queryClient = useContext(QueryClientContext);
  const toast = useContext(ToastContext);
  const text = t.meetings.dateVoting;
  const [pending, setPending] = createOptimistic(false);
  const run = action(function* (decision: DateDecision) {
    setPending(true);
    try {
      yield decision.kind === 'decide'
        ? decideMeetingDate(auth.client, decision.meetingId, decision.optionId)
        : reopenDateVoting(auth.client, decision.meetingId);
      toast.show(decision.kind === 'decide' ? text.decided : text.reopened, 'success');
    } catch (error) {
      toast.show(text.errors[error instanceof DateVotingError ? error.reason : 'save'], 'error');
    }
    yield queryClient.invalidateQueries({ queryKey: meetingsKey });
  });
  return { run, pending };
}
