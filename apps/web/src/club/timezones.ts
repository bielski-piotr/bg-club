import type { SelectOption } from '../ui';

/** Strefa, gdy przeglądarka nie podaje własnej albo podaje nieznaną (CLUB-2, NFR-10). */
export const FALLBACK_TIMEZONE = 'Europe/Warsaw';

/** Czy `Intl` zna strefę o tej nazwie (IANA). Baza sprawdza ją jeszcze raz (`club_validate`). */
export function isKnownTimezone(name: string): boolean {
  if (name.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Strefa przeglądarki administratora, a gdy jej brak, `Europe/Warsaw` (CLUB-2). */
export function browserTimezone(): string {
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  return zone && isKnownTimezone(zone) ? zone : FALLBACK_TIMEZONE;
}

/**
 * Przesunięcie strefy względem UTC w chwili `at`, np. „UTC+01:00”, „UTC−05:00” (znak minus
 * U+2212, jak w DS), „UTC+05:45”. Zależy od daty (czas letni), więc liczymy je na teraz.
 */
export function utcOffset(timeZone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(part ?? '');
  if (!match) return 'UTC+00:00';
  const [, sign = '+', hours = '00', minutes = '00'] = match;
  return `UTC${sign === '-' ? '−' : '+'}${hours}:${minutes}`;
}

/** Nazwy stref IANA znane przeglądarce (bez aliasów), alfabetycznie. */
function supportedTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/**
 * Opcje listy stref (DS §17): nazwa IANA i przesunięcie. Zawsze zawiera `UTC`, strefę już
 * zapisaną w klubie i strefę przeglądarki, także gdy przeglądarka pomija je na swojej liście
 * (np. alias `Europe/Kiev`), żeby wybrana wartość była widoczna.
 */
export function timezoneOptions(
  include: readonly string[] = [],
  at: Date = new Date(),
): SelectOption<string>[] {
  const names = new Set(supportedTimezones());
  names.add('UTC');
  for (const name of include) if (isKnownTimezone(name)) names.add(name);
  return [...names]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => ({ value: name, label: name, meta: utcOffset(name, at) }));
}
