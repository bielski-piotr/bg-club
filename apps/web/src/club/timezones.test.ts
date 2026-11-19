import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserTimezone,
  FALLBACK_TIMEZONE,
  isKnownTimezone,
  timezoneOptions,
  utcOffset,
} from './timezones';

afterEach(() => vi.restoreAllMocks());

describe('strefy czasowe klubu', () => {
  it('przesunięcie zależy od daty (czas letni) i używa znaku minus', () => {
    expect(utcOffset('Europe/Warsaw', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+01:00');
    expect(utcOffset('Europe/Warsaw', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+02:00');
    expect(utcOffset('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe('UTC−05:00');
    expect(utcOffset('Asia/Kathmandu', new Date('2026-01-15T12:00:00Z'))).toBe('UTC+05:45');
    expect(utcOffset('UTC')).toBe('UTC+00:00');
  });

  it('domyślnie strefa przeglądarki, a gdy jej brak albo jest nieznana, Europe/Warsaw', () => {
    const resolved = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions');
    resolved.mockReturnValue({ timeZone: 'Asia/Tokyo' } as Intl.ResolvedDateTimeFormatOptions);
    expect(browserTimezone()).toBe('Asia/Tokyo');
    resolved.mockReturnValue({ timeZone: '' } as Intl.ResolvedDateTimeFormatOptions);
    expect(browserTimezone()).toBe(FALLBACK_TIMEZONE);
    resolved.mockReturnValue({ timeZone: 'Mars/Olympus' } as Intl.ResolvedDateTimeFormatOptions);
    expect(browserTimezone()).toBe(FALLBACK_TIMEZONE);
  });

  it('lista ma strefy IANA alfabetycznie, UTC i wartości spoza listy przeglądarki', () => {
    const options = timezoneOptions(
      ['Europe/Kiev', 'Nie/Strefa'],
      new Date('2026-01-15T12:00:00Z'),
    );
    const names = options.map((o) => o.value);
    expect(names).toContain('Europe/Warsaw');
    expect(names).toContain('UTC');
    expect(names).toContain('Europe/Kiev');
    // Strefa zapisana w bazie, której Intl nie zna, zostaje widoczna (bez przesunięcia).
    expect(options.find((o) => o.value === 'Nie/Strefa')).toEqual({
      value: 'Nie/Strefa',
      label: 'Nie/Strefa',
    });
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(new Set(names).size).toBe(names.length);
    expect(options.find((o) => o.value === 'Europe/Warsaw')).toEqual({
      value: 'Europe/Warsaw',
      label: 'Europe/Warsaw',
      meta: 'UTC+01:00',
    });
    expect(isKnownTimezone('')).toBe(false);
  });
});
