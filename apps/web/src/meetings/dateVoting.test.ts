import { describe, expect, it } from 'vitest';
import { duplicateDateOptions, sameDateOptions } from './dateOptions';
import {
  dateOptionValues,
  dateVotingFailure,
  fromDateOptionRow,
  leadingDateOptions,
} from './dateVoting';
import { addDateOption, removeDateOption, updateDateOption, validateMeetingForm } from './form';

const base = {
  title: 'Granie',
  date: '2030-12-05',
  time: '18:00',
  participants: ['a1'],
  hostId: null,
  dateOptions: [],
};

describe('głosowanie na termin', () => {
  it('porównuje listy propozycji jako zestawy terminów', () => {
    const a = [
      { date: '2030-12-05', time: '18:00' },
      { date: '2030-12-06', time: '17:30' },
    ];
    expect(sameDateOptions(a, [...a].reverse())).toBe(true);
    expect(sameDateOptions(a, a.slice(0, 1))).toBe(false);
    expect(sameDateOptions([], [])).toBe(true);
    expect(duplicateDateOptions([...a, { date: '2030-12-05', time: '18:00' }])).toEqual(
      new Set([2]),
    );
  });

  it('czyta propozycje w strefie klubu i głosujących w kolejności głosów', () => {
    const option = fromDateOptionRow({
      id: 'o1',
      starts_at: '2030-12-05T17:00:00Z',
      meeting_date_votes: [
        { profile_id: 'b', created_at: '2030-11-02T10:00:00Z' },
        { profile_id: 'a', created_at: '2030-11-01T10:00:00Z' },
      ],
    });
    expect(option.voters).toEqual(['a', 'b']);
    expect(dateOptionValues([option], 'Europe/Warsaw')).toEqual([
      { date: '2030-12-05', time: '18:00' },
    ]);
  });

  it('wskazuje propozycje z największą liczbą głosów (wszystkie przy remisie)', () => {
    const opt = (id: string, voters: string[]) => ({ id, starts_at: '', voters });
    expect(
      leadingDateOptions([opt('a', ['x']), opt('b', ['x', 'y']), opt('c', ['y', 'z'])]),
    ).toEqual(new Set(['b', 'c']));
    expect(leadingDateOptions([opt('a', [])]).size).toBe(0);
  });

  it('formularz dodaje, zmienia i usuwa propozycje, a walidacja pilnuje kompletności', () => {
    let values = addDateOption(base);
    expect(values.dateOptions).toEqual([{ date: '2030-12-05', time: '18:00' }]);
    values = addDateOption(values);
    expect(
      validateMeetingForm(values, { timeZone: 'Europe/Warsaw', creating: false }).dateOptions,
    ).toBe('duplicate');
    values = updateDateOption(values, 1, { date: '2030-12-06' });
    expect(
      validateMeetingForm(values, { timeZone: 'Europe/Warsaw', creating: false }).dateOptions,
    ).toBeUndefined();
    values = updateDateOption(values, 1, { time: '' });
    expect(
      validateMeetingForm(values, { timeZone: 'Europe/Warsaw', creating: false }).dateOptions,
    ).toBe('incomplete');
    expect(removeDateOption(values, 1).dateOptions).toHaveLength(1);
  });

  it('zamienia błędy bazy na powody', () => {
    expect(dateVotingFailure({ code: '23514', hint: 'meeting_date_voting_closed' })).toBe('closed');
    expect(dateVotingFailure({ code: '23514', hint: 'meetings_schedule_locked' })).toBe(
      'notPlanned',
    );
    expect(dateVotingFailure({ code: '42501' })).toBe('forbidden');
    expect(dateVotingFailure({ code: '23503' })).toBe('notParticipant');
    expect(dateVotingFailure({ code: 'XX000' })).toBe('save');
  });
});
