import type { SelectOption } from '../ui';

/** Strefa, gdy przeglądarka nie podaje własnej albo podaje nieznaną. */
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

/** Strefa przeglądarki administratora, a gdy jej brak, `Europe/Warsaw`. */
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
 * U+2212), „UTC+05:45”. Zależy od daty (czas letni), więc liczymy je na teraz.
 */
export function utcOffset(timeZone: string, at: Date = new Date()): string {
  let part: string | undefined;
  try {
    part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
  } catch {
    return '';
  }
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

/** Lista stref z przesunięciami na dany dzień (około 420 formatów `Intl`, liczona raz). */
let cached: { readonly day: string; readonly options: readonly SelectOption<string>[] } | null =
  null;

function baseOptions(at: Date): readonly SelectOption<string>[] {
  const day = at.toISOString().slice(0, 10);
  if (cached?.day !== day) {
    const names = new Set(supportedTimezones());
    names.add('UTC');
    cached = {
      day,
      options: [...names].map((name) => ({ value: name, label: name, meta: utcOffset(name, at) })),
    };
  }
  return cached.options;
}

/**
 * Opcje listy stref: nazwa IANA i przesunięcie, alfabetycznie. Zawsze zawiera `UTC`
 * i strefy z `include` (zapisaną w klubie, strefę przeglądarki), także gdy przeglądarka pomija
 * je na swojej liście (np. alias `Europe/Kiev`), żeby wybrana wartość była widoczna. Strefa
 * znana tylko bazie (Intl jej nie zna) jest na liście bez przesunięcia.
 */
export function timezoneOptions(
  include: readonly string[] = [],
  at: Date = new Date(),
): SelectOption<string>[] {
  const base = baseOptions(at);
  const known = new Set(base.map((o) => o.value));
  const extra = include
    .filter((name) => name.trim() !== '' && !known.has(name))
    .map((name) => {
      const meta = utcOffset(name, at);
      return meta ? { value: name, label: name, meta } : { value: name, label: name };
    });
  return [...base, ...extra].sort((a, b) => a.value.localeCompare(b.value, 'en'));
}
