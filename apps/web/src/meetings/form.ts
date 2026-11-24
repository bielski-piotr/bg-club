import { duplicateDateOptions, type DateOptionValue } from './dateOptions';
import { DEFAULT_TIME, isPast, localDateTime, todayIn } from './datetime';
import type { Meeting } from './meetings';

/** Najdłuższy tytuł spotkania (CHECK `meetings_title_length`). */
export const MEETING_TITLE_MAX = 120;

/** Wartości formularza spotkania (PLAN-1). Data i godzina są w strefie klubu (NFR-10). */
export interface MeetingFormValues {
  readonly title: string;
  /** `RRRR-MM-DD`. */
  readonly date: string;
  /** `GG:MM`. */
  readonly time: string;
  /** Identyfikatory profili uczestników (bez duplikatów). */
  readonly participants: readonly string[];
  /** Prowadzący spośród uczestników innych niż admin; `null` = prowadzi admin (§2). */
  readonly hostId: string | null;
  /** Głosowanie na termin otwarte: uczestnicy proponują terminy i na nie głosują. */
  readonly dateVoting: boolean;
  /** Proponowane terminy do głosowania (opinia uczestników; termin ustala administrator). */
  readonly dateOptions: readonly DateOptionValue[];
}

export interface MeetingFormErrors {
  readonly title?: 'required' | 'tooLong' | undefined;
  readonly date?: 'required' | 'past' | undefined;
  readonly time?: 'required' | undefined;
  readonly participants?: 'required' | undefined;
  /** Propozycje bez daty albo godziny albo powtórzone. */
  readonly dateOptions?: 'incomplete' | 'duplicate' | undefined;
}

/**
 * Nowe spotkanie: domyślnie dziś (albo podana data, np. z kalendarza, CAL-3) o 18:00 i sam
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
    dateVoting: false,
    dateOptions: [],
  };
}

export function meetingFormFrom(
  meeting: Meeting,
  timeZone: string,
  dateOptions: readonly DateOptionValue[] = [],
): MeetingFormValues {
  const local = localDateTime(meeting.starts_at, timeZone);
  return {
    title: meeting.title,
    date: local.date,
    time: local.time,
    participants: meeting.participants,
    hostId: meeting.host_id,
    dateVoting: meeting.date_voting_open,
    dateOptions,
  };
}

function dateOptionsError(options: readonly DateOptionValue[]): MeetingFormErrors['dateOptions'] {
  if (options.some((option) => option.date === '' || option.time === '')) return 'incomplete';
  if (duplicateDateOptions(options).size > 0) return 'duplicate';
  return undefined;
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
    dateOptions: dateOptionsError(values.dateOptions),
  };
}

export function hasErrors(errors: MeetingFormErrors): boolean {
  return Object.values(errors).some((value) => value !== undefined);
}

/**
 * Zaznaczenie uczestnika. Odznaczony prowadzący przestaje prowadzić (wraca admin), bo
 * prowadzący musi być uczestnikiem (PLAN-1).
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

/** Nowa propozycja terminu: dzień i godzina ostatniej (albo terminu spotkania). */
export function addDateOption(values: MeetingFormValues): MeetingFormValues {
  const last = values.dateOptions.at(-1) ?? {
    date: values.date,
    time: values.time || DEFAULT_TIME,
  };
  return { ...values, dateOptions: [...values.dateOptions, { date: last.date, time: last.time }] };
}

export function updateDateOption(
  values: MeetingFormValues,
  index: number,
  change: Partial<DateOptionValue>,
): MeetingFormValues {
  return {
    ...values,
    dateOptions: values.dateOptions.map((option, i) =>
      i === index ? { ...option, ...change } : option,
    ),
  };
}

export function removeDateOption(values: MeetingFormValues, index: number): MeetingFormValues {
  return { ...values, dateOptions: values.dateOptions.filter((_, i) => i !== index) };
}
