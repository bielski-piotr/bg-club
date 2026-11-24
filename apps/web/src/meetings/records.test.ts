import { describe, expect, it } from 'vitest';
import { groupRecords, recordKind, topRecord } from './records';

const row = (play: string, profile: string, club: boolean, personal: boolean) => ({
  play_id: play,
  profile_id: profile,
  value: 10,
  club_record: club,
  personal_record: personal,
});

describe('rekordy w partiach', () => {
  it('rekord klubu ma pierwszeństwo przed osobistym', () => {
    expect(recordKind({ club_record: true, personal_record: true })).toBe('club');
    expect(recordKind({ club_record: false, personal_record: true })).toBe('personal');
    expect(recordKind({ club_record: false, personal_record: false })).toBeNull();
  });

  it('grupuje rekordy po partii i wskazuje najważniejszy', () => {
    const grouped = groupRecords([
      row('p1', 'a', false, true),
      row('p1', 'b', true, false),
      row('p2', 'a', false, true),
      row('p3', 'c', false, false),
    ]);
    expect(grouped.get('p1')?.get('a')).toBe('personal');
    expect(grouped.get('p1')?.get('b')).toBe('club');
    expect(topRecord(grouped.get('p1'))).toBe('club');
    expect(topRecord(grouped.get('p2'))).toBe('personal');
    expect(grouped.has('p3')).toBe(false);
    expect(topRecord(undefined)).toBeNull();
  });
});
