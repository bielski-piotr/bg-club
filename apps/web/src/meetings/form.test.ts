import { describe, expect, it } from 'vitest';
import {
  emptyMeetingForm,
  hasErrors,
  meetingFormFrom,
  setAllParticipants,
  toggleParticipant,
  validateMeetingForm,
  type MeetingFormValues,
} from './form';
import type { Meeting } from './meetings';

const WARSAW = 'Europe/Warsaw';
const NOW = new Date('2026-11-14T12:00:00Z');
const ADA = 'a1';

const valid: MeetingFormValues = {
  title: 'Sobotnie granie',
  date: '2026-11-28',
  time: '18:00',
  participants: [ADA, 'b2'],
  hostId: 'b2',
  dateVoting: false,
  dateOptions: [],
};

describe('formularz spotkania (PLAN-1)', () => {
  it('nowe spotkanie: dziś w strefie klubu o 18:00, uczestnikiem jest admin', () => {
    expect(emptyMeetingForm(WARSAW, ADA, undefined, new Date('2026-11-14T23:30:00Z'))).toEqual({
      title: '',
      date: '2026-11-15',
      time: '18:00',
      participants: [ADA],
      hostId: null,
      dateVoting: false,
      dateOptions: [],
    });
    expect(emptyMeetingForm(WARSAW, ADA, '2026-12-24', NOW).date).toBe('2026-12-24');
  });

  it('edycja czyta termin w strefie klubu', () => {
    const meeting: Meeting = {
      id: 'm1',
      title: 'Grudzień',
      starts_at: '2026-12-05T18:30:00+00:00',
      status: 'planned',
      voting_open: true,
      date_voting_open: false,
      host_id: null,
      started_at: null,
      finished_at: null,
      participants: [ADA],
    };
    expect(meetingFormFrom(meeting, WARSAW)).toEqual({
      title: 'Grudzień',
      date: '2026-12-05',
      time: '19:30',
      participants: [ADA],
      hostId: null,
      dateVoting: false,
      dateOptions: [],
    });
  });

  it('wymaga tytułu, daty, godziny i uczestnika', () => {
    const options = { timeZone: WARSAW, creating: true, now: NOW };
    expect(hasErrors(validateMeetingForm(valid, options))).toBe(false);
    expect(
      validateMeetingForm({ ...valid, title: '  ', date: '', time: '', participants: [] }, options),
    ).toEqual({ title: 'required', date: 'required', time: 'required', participants: 'required' });
    expect(validateMeetingForm({ ...valid, title: 'x'.repeat(121) }, options).title).toBe(
      'tooLong',
    );
    expect(validateMeetingForm({ ...valid, title: ` ${'x'.repeat(120)} ` }, options).title).toBe(
      undefined,
    );
  });

  it('nowe spotkanie nie zaczyna się w przeszłości; edycja zachowuje termin', () => {
    const past = { ...valid, date: '2026-11-14', time: '12:30' };
    // 12:00 UTC = 13:00 w Warszawie, więc 12:30 już minęło.
    expect(validateMeetingForm(past, { timeZone: WARSAW, creating: true, now: NOW }).date).toBe(
      'past',
    );
    expect(
      validateMeetingForm(
        { ...past, time: '13:30' },
        { timeZone: WARSAW, creating: true, now: NOW },
      ).date,
    ).toBe(undefined);
    expect(validateMeetingForm(past, { timeZone: WARSAW, creating: false, now: NOW }).date).toBe(
      undefined,
    );
  });

  it('odznaczenie prowadzącego oddaje prowadzenie adminowi', () => {
    const next = toggleParticipant(valid, 'b2', false);
    expect(next.participants).toEqual([ADA]);
    expect(next.hostId).toBeNull();
    expect(toggleParticipant(valid, ADA, false).hostId).toBe('b2');
    expect(toggleParticipant(next, 'c3', true).participants).toEqual([ADA, 'c3']);
  });

  it('zaznacz i odznacz wszystkich zachowuje uczestników z partią', () => {
    const members = [ADA, 'b2', 'c3'];
    expect(setAllParticipants(valid, members, true).participants).toEqual(members);
    const cleared = setAllParticipants(valid, members, false, new Set(['c3', 'b2']));
    expect(cleared.participants).toEqual(['b2', 'c3']);
    expect(cleared.hostId).toBe('b2');
    const none = setAllParticipants(valid, members, false);
    expect(none.participants).toEqual([]);
    expect(none.hostId).toBeNull();
    // Uczestnik spoza listy członków (np. usunięty w trakcie spotkania) zostaje.
    expect(
      setAllParticipants({ ...valid, participants: ['x9'] }, members, false).participants,
    ).toEqual(['x9']);
  });
});
