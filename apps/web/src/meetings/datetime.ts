/**
 * Daty spotkań w strefie klubu (NFR-10). Baza trzyma chwilę (`timestamptz`), a formularz
 * datę i godzinę w strefie `club.timezone`; zamianę w drugą stronę robi baza
 * (`save_meeting`), więc tu jest tylko odczyt i wyświetlanie.
 */

/** Data `RRRR-MM-DD` i godzina `GG:MM` chwili `iso` w strefie `timeZone`. */
export interface LocalDateTime {
  readonly date: string;
  readonly time: string;
}

function parts(at: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value]));
}

export function localDateTime(at: string | Date, timeZone: string): LocalDateTime {
  const p = parts(typeof at === 'string' ? new Date(at) : at, timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Dzisiejsza data w strefie klubu (`RRRR-MM-DD`). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDateTime(now, timeZone).date;
}

/** Godziny co pół godziny (DS §15 „Time dropdown”): 00:00 … 23:30. */
export const TIME_SLOTS: readonly string[] = Array.from({ length: 48 }, (_, i) => {
  const hour = String(Math.floor(i / 2)).padStart(2, '0');
  return `${hour}:${i % 2 === 0 ? '00' : '30'}`;
});

/** Domyślna godzina nowego spotkania. */
export const DEFAULT_TIME = '18:00';

/** Czy `date` + `time` (lokalnie w strefie klubu) jest już za nami. */
export function isPast(date: string, time: string, timeZone: string, now: Date = new Date()) {
  const current = localDateTime(now, timeZone);
  return `${date} ${time}` < `${current.date} ${current.time}`;
}

/** „sobota, 28 lis 2026 · 18:00” (DS §15 „Widget meeting block”). */
export function formatMeetingDate(at: string, timeZone: string): string {
  const date = new Date(at);
  const weekday = new Intl.DateTimeFormat('pl-PL', { timeZone, weekday: 'long' }).format(date);
  const day = new Intl.DateTimeFormat('pl-PL', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    // „28 lis 2026” (bez kropki skrótu i bez „r.”, jak w DS).
    .replace(/\.(?=\s|$)/g, '')
    .replace(/\s*r$/, '');
  return `${weekday}, ${day} · ${localDateTime(date, timeZone).time}`;
}

/** Kafelek daty (DS §15 „Date tile”): skrót miesiąca wielkimi literami i dzień. */
export function dateTile(at: string, timeZone: string): { month: string; day: string } {
  const date = new Date(at);
  const month = new Intl.DateTimeFormat('pl-PL', { timeZone, month: 'short' })
    .format(date)
    .replace('.', '')
    .toLocaleUpperCase('pl-PL');
  const day = new Intl.DateTimeFormat('pl-PL', { timeZone, day: 'numeric' }).format(date);
  return { month, day };
}

/** Pełna data dla czytnika ekranu: „sobota, 28 listopada 2026 18:00”. */
export function longMeetingDate(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(at));
}
