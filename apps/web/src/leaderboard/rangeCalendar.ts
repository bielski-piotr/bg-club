import type { YearMonth } from '../meetings/calendar';

/** Ile lat pokazuje widok wyboru roku (siatka 3 × 4). */
export const YEARS_PAGE = 12;

function monthDate(ym: YearMonth): Date {
  return new Date(Date.UTC(ym.year, ym.month - 1, 15));
}

/** „Listopad” (mianownik, sam miesiąc). */
export function monthName(ym: YearMonth): string {
  const name = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', month: 'long' }).format(
    monthDate(ym),
  );
  return name.charAt(0).toLocaleUpperCase('pl-PL') + name.slice(1);
}

export function shortMonthName(month: number): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', month: 'short' })
    .format(monthDate({ year: 2000, month }))
    .replace(/\.$/, '');
}

/** Pierwszy rok strony lat zawierającej `year` (strony co {@link YEARS_PAGE} od roku 0). */
export function yearsPageStart(year: number): number {
  return Math.floor(year / YEARS_PAGE) * YEARS_PAGE;
}

/**
 * Wynik kliknięcia dnia: pierwszy dzień zaczyna zakres (`anchor`), drugi go kończy; dni
 * w odwrotnej kolejności są zamieniane. Zwraca nowy zakres i kotwicę na następne kliknięcie.
 */
export function pickDay(
  anchor: string | null,
  date: string,
): { readonly start: string; readonly end: string; readonly anchor: string | null } {
  if (anchor === null) return { start: date, end: date, anchor: date };
  return date < anchor
    ? { start: date, end: anchor, anchor: null }
    : { start: anchor, end: date, anchor: null };
}
