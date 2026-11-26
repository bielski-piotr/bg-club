/**
 * Siatka miesiąca i etykiety dat kalendarza oraz timeline.
 * Dni to daty `RRRR-MM-DD` w strefie klubu: spotkanie trafia na dzień, który pokazuje
 * jego chwila rozpoczęcia w `club.timezone`, a „dziś” to dzisiejsza data w tej strefie.
 */
import { localDateTime } from './datetime';

/** Miesiąc kalendarza; `month` 1–12. */
export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** Dzień siatki miesiąca. */
export interface GridDay {
  readonly date: string;
  /** Dzień pokazywanego miesiąca (dni sąsiednich miesięcy uzupełniają tygodnie). */
  readonly inMonth: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Miesiąc daty `RRRR-MM-DD`. */
export function monthOf(date: string): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** Miesiąc przesunięty o `delta` (‹ ›). */
export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function sameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** `RRRR-MM` miesiąca (klucz zapytania). */
export function monthKey(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`;
}

/** Czy data `RRRR-MM-DD` należy do miesiąca `ym`. */
export function inMonth(date: string, ym: YearMonth): boolean {
  return date.startsWith(`${monthKey(ym)}-`);
}

/**
 * Pełne tygodnie od poniedziałku do niedzieli, które obejmują miesiąc (4–6 wierszy, jak
 * w „Pn Wt Śr Cz Pt So Nd”).
 */
export function monthGrid(ym: YearMonth): GridDay[][] {
  const first = utcDate(`${monthKey(ym)}-01`);
  const next = shiftMonth(ym, 1);
  const last = new Date(utcDate(`${monthKey(next)}-01`).getTime() - DAY_MS);
  // getUTCDay: 0 = niedziela; tydzień zaczyna poniedziałek.
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY_MS);
  const end = new Date(last.getTime() + ((7 - last.getUTCDay()) % 7) * DAY_MS);
  const weeks: GridDay[][] = [];
  for (let at = start; at <= end; at = new Date(at.getTime() + 7 * DAY_MS)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = isoDay(new Date(at.getTime() + i * DAY_MS));
        return { date, inMonth: inMonth(date, ym) };
      }),
    );
  }
  return weeks;
}

/**
 * Zakres chwil do pobrania spotkań siatki: od pierwszego do ostatniego pokazanego dnia z dniem
 * zapasu po obu stronach (strefa klubu jest najwyżej o 14 h od UTC). Spotkania spoza siatki
 * odrzuca dopiero przypisanie do dni w strefie klubu.
 */
export function gridRange(ym: YearMonth): { readonly from: string; readonly to: string } {
  const weeks = monthGrid(ym);
  const first = weeks[0]?.[0]?.date ?? `${monthKey(ym)}-01`;
  const last = weeks.at(-1)?.at(-1)?.date ?? first;
  return {
    from: new Date(utcDate(first).getTime() - DAY_MS).toISOString(),
    to: new Date(utcDate(last).getTime() + 2 * DAY_MS).toISOString(),
  };
}

/** Spotkania pogrupowane po dniu w strefie klubu, w dniu rosnąco po `starts_at`, potem `id`. */
export function groupByDay<T extends { readonly id: string; readonly starts_at: string }>(
  meetings: readonly T[],
  timeZone: string,
): Map<string, T[]> {
  const sorted = [...meetings].sort(
    (a, b) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime() || a.id.localeCompare(b.id),
  );
  const days = new Map<string, T[]>();
  for (const meeting of sorted) {
    const { date } = localDateTime(meeting.starts_at, timeZone);
    const list = days.get(date);
    if (list) list.push(meeting);
    else days.set(date, [meeting]);
  }
  return days;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pl-PL') + text.slice(1);
}

/** „Listopad 2026” (mianownik). */
export function monthLabel(ym: YearMonth): string {
  // Sam miesiąc (bez dnia) ma formę samodzielną, czyli mianownik („listopad”, nie „listopada”).
  const month = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', month: 'long' }).format(
    utcDate(`${monthKey(ym)}-15`),
  );
  return `${capitalize(month)} ${ym.year}`;
}

/** Dzień miesiąca daty `RRRR-MM-DD` (liczba na kafelku). */
export function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}

/** „czwartek, 12 listopada 2026” (etykieta dnia dla czytnika ekranu). */
export function longDayLabel(date: string): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', dateStyle: 'full' }).format(
    utcDate(date),
  );
}

/** „czwartek, 12 lis” (divider „Dziś” w timeline). */
export function shortDayLabel(date: string): string {
  const at = utcDate(date);
  const weekday = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', weekday: 'long' }).format(at);
  const day = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    .format(at)
    .replace(/\.(?=\s|$)/g, '');
  return `${weekday}, ${day}`;
}

/** „sobota, 18:00” (meta wiersza timeline i agendy). */
export function weekdayTime(at: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('pl-PL', { timeZone, weekday: 'long' }).format(
    new Date(at),
  );
  return `${weekday}, ${localDateTime(at, timeZone).time}`;
}
