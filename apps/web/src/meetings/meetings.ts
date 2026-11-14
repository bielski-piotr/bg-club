import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { isUuid } from '../popups/routes';
import type { MeetingFormValues } from './form';

/** Status spotkania (§5.8): zaplanowane → w trakcie → zakończone. */
export type MeetingStatus = 'planned' | 'in_progress' | 'finished';

/** Spotkanie klubu z identyfikatorami uczestników (PRD §5.8, §6). */
export interface Meeting {
  readonly id: string;
  readonly title: string;
  /** Chwila rozpoczęcia (`timestamptz`); wyświetlana w strefie klubu (NFR-10). */
  readonly starts_at: string;
  readonly status: MeetingStatus;
  /** Głosowanie otwarte; możliwe tylko w zaplanowanym (PLAN-2, RUN-1). */
  readonly voting_open: boolean;
  /** Prowadzący spośród uczestników; `null` = prowadzi admin (§2). */
  readonly host_id: string | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly participants: readonly string[];
}

interface MeetingRow extends Omit<Meeting, 'participants'> {
  // Jawny klucz obcy: spotkanie ma też klucz (id, host_id) → uczestnicy.
  readonly meeting_participants: readonly { readonly profile_id: string }[];
}

const MEETING_COLUMNS =
  'id, title, starts_at, status, voting_open, host_id, started_at, finished_at, ' +
  'meeting_participants!meeting_participants_meeting_id_fkey(profile_id)';

function fromRow(row: MeetingRow): Meeting {
  const { meeting_participants: participants, ...rest } = row;
  return { ...rest, participants: participants.map((p) => p.profile_id) };
}

/** Wszystkie zapytania o spotkania; zapis i zmiana statusu odświeżają je razem. */
export const meetingsKey = ['meetings'] as const;
export const meetingKey = (id: string) => [...meetingsKey, 'byId', id] as const;
export const hubMeetingKey = [...meetingsKey, 'hub'] as const;
export const meetingPlayersKey = (id: string) => [...meetingsKey, 'players', id] as const;

/** Spotkanie; `null` = nie ma takiego (np. usunięte, stary link). */
export function useMeeting(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: meetingKey(id),
    queryFn: async (): Promise<Meeting | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client
        .from('meetings')
        .select(MEETING_COLUMNS)
        .eq('id', id)
        .maybeSingle<MeetingRow>();
      if (error) throw error;
      return data ? fromRow(data) : null;
    },
  });
}

/**
 * Spotkanie widżetu (MTG-1): trwające, a gdy go nie ma, najwcześniejsze zaplanowane
 * (kolejność `starts_at`, potem `id`, Q24). `null` = brak spotkań do pokazania.
 */
export function useHubMeeting(client: SupabaseClient) {
  return useQuery({
    queryKey: hubMeetingKey,
    queryFn: async (): Promise<Meeting | null> => {
      const { data, error } = await client
        .from('meetings')
        .select(MEETING_COLUMNS)
        .in('status', ['in_progress', 'planned'])
        // „in_progress” < „planned” alfabetycznie: trwające zawsze pierwsze.
        .order('status')
        .order('starts_at')
        .order('id')
        .limit(1)
        .returns<MeetingRow[]>();
      if (error) throw error;
      const [row] = data;
      return row ? fromRow(row) : null;
    },
  });
}

/**
 * Uczestnicy, którzy mają już partię w spotkaniu (zapisaną albo szkic). W spotkaniu w trakcie
 * nie da się ich usunąć (PLAN-4).
 */
export function useMeetingPlayers(client: SupabaseClient, id: string, enabled: boolean) {
  return useQuery({
    queryKey: meetingPlayersKey(id),
    enabled,
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const { data, error } = await client
        .from('play_results')
        .select('profile_id')
        .eq('meeting_id', id)
        .returns<{ profile_id: string }[]>();
      if (error) throw error;
      return new Set(data.map((row) => row.profile_id));
    },
  });
}

/**
 * Powód nieudanej operacji na spotkaniu (komunikaty w `t.meetings.errors`). Baza podaje
 * nazwę reguły w polu HINT (migracja [023]).
 */
export type MeetingFailure =
  | 'forbidden'
  | 'gone'
  | 'noClub'
  | 'noParticipants'
  | 'hostInvalid'
  | 'participantDeleted'
  | 'participantHasPlay'
  | 'localTime'
  | 'locked'
  | 'finished'
  | 'otherInProgress'
  | 'notPlanned'
  | 'notInProgress'
  | 'drafts'
  | 'deleteInProgress'
  | 'hasPlays'
  | 'save';

export class MeetingError extends Error {
  constructor(readonly reason: MeetingFailure) {
    super(`meeting: ${reason}`);
    this.name = 'MeetingError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly hint?: string | null | undefined;
  readonly message?: string | undefined;
}

const HINTS: Readonly<Record<string, MeetingFailure>> = {
  meetings_club_required: 'noClub',
  meetings_participants_required: 'noParticipants',
  meetings_host_participant: 'hostInvalid',
  meetings_host_not_admin: 'hostInvalid',
  meetings_host_not_deleted: 'hostInvalid',
  meetings_participant_has_play: 'participantHasPlay',
  meetings_local_time_exists: 'localTime',
  meetings_starts_at_required: 'save',
  meetings_schedule_locked: 'locked',
  meetings_finished_locked: 'finished',
  meetings_status_transition: 'locked',
  meetings_single_in_progress: 'otherInProgress',
  meetings_start_planned: 'notPlanned',
  meetings_finish_in_progress: 'notInProgress',
  meetings_no_drafts_when_finished: 'drafts',
  meetings_delete_in_progress: 'deleteInProgress',
};

/** Błąd PostgREST → powód z polskim komunikatem. */
export function meetingFailure(error: PostgrestLikeError): MeetingFailure {
  const byHint = error.hint ? HINTS[error.hint] : undefined;
  if (byHint) return byHint;
  if (error.code === '42501') return 'forbidden';
  // Drugie spotkanie w trakcie także bez HINT (np. bezpośredni zapis, MTG-2).
  if (error.code === '23505' && error.message?.includes('meetings_single_in_progress')) {
    return 'otherInProgress';
  }
  // Wyzwalacz uczestników (MEM-6): usuniętego członka nie da się dodać.
  if (error.code === '23514' && error.message?.includes('deleted profile')) {
    return 'participantDeleted';
  }
  // Klucz obcy plays → meetings: spotkanie ma partie (PLAN-5, Q4).
  if (error.code === '23503' && error.message?.includes('plays')) return 'hasPlays';
  if (error.code === 'PGRST116') return 'gone';
  return 'save';
}

export interface MeetingDraft {
  /** Id nowego spotkania nadaje formularz (ponowienie po błędzie sieci nie zdubluje go). */
  readonly id: string;
  readonly values: MeetingFormValues;
}

/**
 * Planuje spotkanie albo zapisuje zmiany (PLAN-1…PLAN-4) w jednej transakcji: tytuł, termin
 * (data i godzina w strefie klubu, zamienia je baza), uczestnicy i prowadzący. Nowe spotkanie
 * ma otwarte głosowanie (PLAN-2).
 */
export async function saveMeeting(client: SupabaseClient, draft: MeetingDraft): Promise<void> {
  const { values } = draft;
  const { error } = await client.rpc('save_meeting', {
    meeting_id: draft.id,
    title: values.title.trim(),
    local_date: values.date,
    local_time: values.time,
    participant_ids: values.participants,
    host_id: values.hostId,
  });
  if (error) throw new MeetingError(meetingFailure(error));
}

/** Rozpoczyna spotkanie i zamyka głosowanie (RUN-1). Admin lub prowadzący. */
export async function startMeeting(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.rpc('start_meeting', { meeting_id: id });
  if (error) throw new MeetingError(meetingFailure(error));
}

/** Kończy spotkanie; szkice partii blokują zakończenie (RUN-4). Admin lub prowadzący. */
export async function finishMeeting(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.rpc('finish_meeting', { meeting_id: id });
  if (error) throw new MeetingError(meetingFailure(error));
}

/**
 * Usuwa spotkanie (PLAN-3) razem z głosami i uczestnikami. Spotkania w trakcie i zakończonego
 * z partiami baza nie usunie (PLAN-5).
 */
export async function deleteMeeting(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('meetings').delete().eq('id', id).select('id');
  if (error) throw new MeetingError(meetingFailure(error));
  // RLS albo równoległe usunięcie: nic nie usunięto.
  if (data.length === 0) throw new MeetingError('gone');
}
