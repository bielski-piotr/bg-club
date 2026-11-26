import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '../popups/routes';
import { localDateTime } from './datetime';
import type { DateOptionValue } from './dateOptions';
import { meetingsKey } from './meetings';

/*
 * Głosowanie na termin spotkania (`20261113001000_meeting_planning.sql`). Administrator włącza je
 * w formularzu spotkania (`save_meeting` z `date_voting`, opcjonalnie własne propozycje
 * `date_options`), uczestnicy proponują terminy (`propose_meeting_date`, bez limitu) i głosują
 * na dowolnie wiele z nich (`meeting_date_votes`, RLS), a termin ustala administrator
 * (`decide_meeting_date`) albo wpisuje dowolny inny w formularzu. Głosy są tylko opinią.
 */

/** Zapisana propozycja z głosującymi (w kolejności oddania głosu). */
export interface DateOption {
  readonly id: string;
  readonly starts_at: string;
  readonly voters: readonly string[];
}

interface DateOptionRow {
  readonly id: string;
  readonly starts_at: string;
  readonly meeting_date_votes: readonly {
    readonly profile_id: string;
    readonly created_at: string;
  }[];
}

export const meetingDateOptionsKey = (id: string) => [...meetingsKey, 'date-options', id] as const;

export function fromDateOptionRow(row: DateOptionRow): DateOption {
  const votes = [...row.meeting_date_votes].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.profile_id.localeCompare(b.profile_id),
  );
  return { id: row.id, starts_at: row.starts_at, voters: votes.map((vote) => vote.profile_id) };
}

/** Propozycje terminu spotkania od najwcześniejszej. */
export function meetingDateOptionsQuery(client: SupabaseClient, meetingId: string, enabled = true) {
  return {
    queryKey: meetingDateOptionsKey(meetingId),
    enabled,
    queryFn: async (): Promise<DateOption[]> => {
      if (!isUuid(meetingId)) return [];
      const { data, error } = await client
        .from('meeting_date_options')
        .select('id, starts_at, meeting_date_votes(profile_id, created_at)')
        .eq('meeting_id', meetingId)
        .order('starts_at')
        .order('id')
        .returns<DateOptionRow[]>();
      if (error) throw error;
      return data.map(fromDateOptionRow);
    },
  };
}

/** Zapisane propozycje jako wartości formularza (w strefie klubu). */
export function dateOptionValues(
  options: readonly Pick<DateOption, 'starts_at'>[],
  timeZone: string,
): DateOptionValue[] {
  return options.map((option) => localDateTime(option.starts_at, timeZone));
}

/** Propozycja z najwięcej głosami (przy remisie wszystkie); bez głosów pusta lista. */
export function leadingDateOptions(options: readonly DateOption[]): ReadonlySet<string> {
  const most = Math.max(0, ...options.map((option) => option.voters.length));
  if (most === 0) return new Set();
  return new Set(options.filter((o) => o.voters.length === most).map((o) => o.id));
}

/** Powód nieudanego głosu albo decyzji (`t.meetings.dateVoting.errors`). */
export type DateVotingFailure =
  | 'closed'
  | 'notParticipant'
  | 'notPlanned'
  | 'optionGone'
  | 'noOptions'
  | 'past'
  | 'localTime'
  | 'gone'
  | 'forbidden'
  | 'save';

export class DateVotingError extends Error {
  constructor(readonly reason: DateVotingFailure) {
    super(`date voting: ${reason}`);
    this.name = 'DateVotingError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly hint?: string | null | undefined;
  readonly message?: string | undefined;
}

const HINTS: Readonly<Record<string, DateVotingFailure>> = {
  meeting_date_voting_closed: 'closed',
  meetings_schedule_locked: 'notPlanned',
  meetings_reopen_planned: 'notPlanned',
  meeting_date_option_not_found: 'optionGone',
  meeting_date_options_required: 'noOptions',
  meeting_date_option_past: 'past',
  meeting_date_not_participant: 'notParticipant',
  meetings_local_time_exists: 'localTime',
  meetings_not_found: 'gone',
};

/** Błąd PostgREST → powód z polskim komunikatem. */
export function dateVotingFailure(error: PostgrestLikeError): DateVotingFailure {
  const byHint = error.hint ? HINTS[error.hint] : undefined;
  if (byHint) return byHint;
  if (error.code === '23514' && error.message?.includes('date voting is closed')) return 'closed';
  // RLS odrzuca głos przy zamkniętym głosowaniu jeszcze przed wyzwalaczem.
  if (error.code === '42501') return 'forbidden';
  // Klucz obcy głosu: gracz wypadł z uczestników albo propozycję usunięto.
  if (error.code === '23503') return 'notParticipant';
  return 'save';
}

export interface DateVoteTarget {
  readonly meetingId: string;
  readonly optionId: string;
  readonly profileId: string;
}

/** Głos na termin. Głos, który już jest (ponowienie, druga karta), to sukces. */
export async function castDateVote(client: SupabaseClient, target: DateVoteTarget): Promise<void> {
  const { error } = await client.from('meeting_date_votes').insert({
    option_id: target.optionId,
    meeting_id: target.meetingId,
    profile_id: target.profileId,
  });
  if (error && error.code !== '23505') throw new DateVotingError(dateVotingFailure(error));
}

/** Cofa głos na termin; nic nie usunięto przy zamkniętym głosowaniu = błąd „zamknięte”. */
export async function withdrawDateVote(
  client: SupabaseClient,
  target: DateVoteTarget,
): Promise<void> {
  const { data, error } = await client
    .from('meeting_date_votes')
    .delete()
    .eq('option_id', target.optionId)
    .eq('profile_id', target.profileId)
    .select('option_id');
  if (error) throw new DateVotingError(dateVotingFailure(error));
  if (data.length > 0) return;
  const meeting = await client
    .from('meetings')
    .select('date_voting_open')
    .eq('id', target.meetingId)
    .maybeSingle<{ date_voting_open: boolean }>();
  if (meeting.error) throw new DateVotingError('save');
  if (!meeting.data) throw new DateVotingError('gone');
  if (!meeting.data.date_voting_open) throw new DateVotingError('closed');
}

/**
 * Propozycja terminu od uczestnika (albo administratora) z jego głosem. Ten sam termin drugi
 * raz to sukces (baza go nie powiela). Data i godzina w strefie klubu (NFR-10).
 */
export async function proposeMeetingDate(
  client: SupabaseClient,
  meetingId: string,
  value: { readonly date: string; readonly time: string },
): Promise<void> {
  const { error } = await client.rpc('propose_meeting_date', {
    meeting_id: meetingId,
    local_date: value.date,
    local_time: value.time,
  });
  if (error) throw new DateVotingError(dateVotingFailure(error));
}

/** Ustala termin spotkania z propozycji i zamyka głosowanie na termin. Tylko administrator. */
export async function decideMeetingDate(
  client: SupabaseClient,
  meetingId: string,
  optionId: string,
): Promise<void> {
  const { error } = await client.rpc('decide_meeting_date', {
    meeting_id: meetingId,
    option_id: optionId,
  });
  if (error) throw new DateVotingError(dateVotingFailure(error));
}

/** Otwiera głosowanie na termin ponownie. Tylko administrator. */
export async function reopenDateVoting(client: SupabaseClient, meetingId: string): Promise<void> {
  const { error } = await client.rpc('reopen_date_voting', { meeting_id: meetingId });
  if (error) throw new DateVotingError(dateVotingFailure(error));
}
