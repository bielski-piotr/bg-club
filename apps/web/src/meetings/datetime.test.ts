import { describe, expect, it } from 'vitest';
import {
  dateTile,
  formatMeetingDate,
  isPast,
  localDateTime,
  longMeetingDate,
  TIME_SLOTS,
  todayIn,
} from './datetime';

const WARSAW = 'Europe/Warsaw';

describe('daty spotkań w strefie klubu (NFR-10)', () => {
  it('czyta datę i godzinę w strefie klubu, także po zmianie czasu', () => {
    expect(localDateTime('2026-11-28T17:00:00Z', WARSAW)).toEqual({
      date: '2026-11-28',
      time: '18:00',
    });
    expect(localDateTime('2026-07-04T16:00:00Z', WARSAW)).toEqual({
      date: '2026-07-04',
      time: '18:00',
    });
    // Noc zmiany czasu: 01:30 UTC to 03:30 czasu letniego (wiosna) i 02:30 zimowego (jesień).
    expect(localDateTime('2026-03-29T01:30:00Z', WARSAW).time).toBe('03:30');
    expect(localDateTime('2026-10-25T01:30:00Z', WARSAW).time).toBe('02:30');
    // Ta sama chwila w innej strefie: inny dzień.
    expect(localDateTime('2026-11-28T23:30:00Z', WARSAW).date).toBe('2026-11-29');
    expect(localDateTime('2026-11-28T23:30:00Z', 'America/New_York').date).toBe('2026-11-28');
  });

  it('północ to 00:00, nie 24:00', () => {
    expect(localDateTime('2026-11-28T23:00:00Z', WARSAW)).toEqual({
      date: '2026-11-29',
      time: '00:00',
    });
  });

  it('dzisiejsza data i przeszłość liczą się w strefie klubu', () => {
    const now = new Date('2026-11-14T23:30:00Z');
    expect(todayIn(WARSAW, now)).toBe('2026-11-15');
    expect(todayIn('America/New_York', now)).toBe('2026-11-14');
    expect(isPast('2026-11-15', '00:00', WARSAW, now)).toBe(true);
    expect(isPast('2026-11-15', '00:30', WARSAW, now)).toBe(false);
    expect(isPast('2026-11-15', '18:00', WARSAW, now)).toBe(false);
  });

  it('godziny co pół godziny przez całą dobę', () => {
    expect(TIME_SLOTS).toHaveLength(48);
    expect(TIME_SLOTS[0]).toBe('00:00');
    expect(TIME_SLOTS).toContain('18:00');
    expect(TIME_SLOTS.at(-1)).toBe('23:30');
  });

  it('formatuje datę jak w DS §15', () => {
    expect(formatMeetingDate('2026-11-28T17:00:00Z', WARSAW)).toBe('sobota, 28 lis 2026 · 18:00');
    expect(dateTile('2026-11-28T17:00:00Z', WARSAW)).toEqual({ month: 'LIS', day: '28' });
    expect(dateTile('2026-11-28T23:30:00Z', WARSAW)).toEqual({ month: 'LIS', day: '29' });
    expect(longMeetingDate('2026-11-28T17:00:00Z', WARSAW)).toBe('sobota, 28 listopada 2026 18:00');
  });
});
