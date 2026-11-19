import { DEFAULT_TIME, isPast, localDateTime, todayIn } from './datetime';
import type { Meeting } from './meetings';

/** Najdłuższy tytuł spotkania (CHECK `meetings_title_length`). */
export const MEETING_TITLE_MAX = 120;

/** Wartości formularza spotkania. Data i godzina są w strefie klubu. */
export interface MeetingFormValues {
  readonly title: string;
  /** `RRRR-MM-DD`. */
  readonly date: string;
  /** `GG:MM`. */
  readonly time: string;
  /** Identyfikatory profili uczestników (bez duplikatów). */
  readonly participants: readonly string[];
  /** Prowadzący spośród uczestników innych niż admin; `null` = prowadzi admin. */
  readonly hostId: string | null;
}

export interface MeetingFormErrors {
  readonly title?: 'required' | 'tooLong' | undefined;
  readonly date?: 'required' | 'past' | undefined;
  readonly time?: 'required' | undefined;
  readonly participants?: 'required' | undefined;
}

/**
 * Nowe spotkanie: domyślnie dziś (albo podana data, np. z kalendarza) o 18:00 i sam
 * administrator na liście uczestników.
 */
export function emptyMeetingForm(
  timeZone: string,
  adminId: string,
  date?: string,
  now: Date = new Date(),
): MeetingFormValues {
  return {
    title: '',
    date: date ?? todayIn(timeZone, now),
    time: DEFAULT_TIME,
    participants: [adminId],
    hostId: null,
  };
}

export function meetingFormFrom(meeting: Meeting, timeZone: string): MeetingFormValues {
  const local = localDateTime(meeting.starts_at, timeZone);
  return {
    title: meeting.title,
    date: local.date,
    time: local.time,
    participants: meeting.participants,
    hostId: meeting.host_id,
  };
}

interface ValidateOptions {
  readonly timeZone: string;
  /** Nowe spotkanie nie może zaczynać się w przeszłości; edycja zachowuje termin. */
  readonly creating: boolean;
  readonly now?: Date | undefined;
}

export function validateMeetingForm(
  values: MeetingFormValues,
  { timeZone, creating, now = new Date() }: ValidateOptions,
): MeetingFormErrors {
  const title = values.title.trim();
  return {
    title: title === '' ? 'required' : title.length > MEETING_TITLE_MAX ? 'tooLong' : undefined,
    date:
      values.date === ''
        ? 'required'
        : creating && values.time !== '' && isPast(values.date, values.time, timeZone, now)
          ? 'past'
          : undefined,
    time: values.time === '' ? 'required' : undefined,
    participants: values.participants.length === 0 ? 'required' : undefined,
  };
}

export function hasErrors(errors: MeetingFormErrors): boolean {
  return Object.values(errors).some((value) => value !== undefined);
}

/**
 * Zaznaczenie uczestnika. Odznaczony prowadzący przestaje prowadzić (wraca admin), bo
 * prowadzący musi być uczestnikiem.
 */
export function toggleParticipant(
  values: MeetingFormValues,
  profileId: string,
  checked: boolean,
): MeetingFormValues {
  const without = values.participants.filter((id) => id !== profileId);
  return {
    ...values,
    participants: checked ? [...without, profileId] : without,
    hostId: !checked && values.hostId === profileId ? null : values.hostId,
  };
}

/** „Zaznacz wszystkich” / „Odznacz wszystkich” z zachowaniem uczestników zablokowanych. */
export function setAllParticipants(
  values: MeetingFormValues,
  memberIds: readonly string[],
  checked: boolean,
  locked: ReadonlySet<string> = new Set(),
): MeetingFormValues {
  const outside = values.participants.filter((id) => !memberIds.includes(id));
  const kept = checked ? memberIds : memberIds.filter((id) => locked.has(id));
  const participants = [...outside, ...kept];
  return {
    ...values,
    participants,
    hostId: values.hostId && participants.includes(values.hostId) ? values.hostId : null,
  };
}
