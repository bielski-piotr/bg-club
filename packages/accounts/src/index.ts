/**
 * Pakiet `@bg-club/accounts`: konta graczy bez zależności od środowiska (przeglądarka, Node,
 * Deno). Używają go ekran logowania (SPA), skrypt bootstrapu administratora i Edge Function
 * tworząca członków.
 *
 * - Hook jest loginem gracza, np. `jan-kowalski-3f9a`.
 * - Konto Supabase Auth ma techniczny e-mail `<hook>@users.bgclub.invalid`, którego
 *   użytkownik nigdy nie widzi. Tę samą domenę sprawdza baza
 *   (`private.hook_from_email`, migracja `20261113000500_accounts_and_login.sql`).
 *
 * Moduł nie ma importów, żeby dało się go wczytać bez bundlera (Node z usuwaniem typów, Deno).
 */

/** Domena technicznych e-maili kont Auth. `.invalid` jest zarezerwowana (RFC 2606). */
export const TECHNICAL_EMAIL_DOMAIN = 'users.bgclub.invalid';

/** Maksymalna długość hooka (CHECK `profiles_hook_length`). */
export const HOOK_MAX_LENGTH = 64;

/** Maksymalna długość imienia i nazwiska (CHECK `profiles_*_name_length`). */
export const NAME_MAX_LENGTH = 50;

/** Długość losowego sufiksu hooka (4 znaki szesnastkowe). */
export const HOOK_SUFFIX_LENGTH = 4;

/** Minimalna długość hasła generowanego dla nowego konta. */
export const MIN_PASSWORD_LENGTH = 12;

/** Domyślna długość generowanego hasła (ok. 92 bity entropii). */
export const GENERATED_PASSWORD_LENGTH = 16;

/** Format hooka, taki sam jak CHECK `profiles_hook_format` w bazie. */
const HOOK_PATTERN = /^([a-z0-9]+-)+[0-9a-f]{4}$/;

/** Słowo zastępcze, gdy z imienia i nazwiska nie zostaje żadna litera łacińska. */
const FALLBACK_SLUG = 'gracz';

/**
 * Postać hooka wpisanego przez użytkownika: bez spacji na brzegach i małymi literami.
 * Hooki są zawsze małymi literami, więc „Jan-Kowalski-3F9A” też zaloguje.
 */
export function normalizeHook(input: string): string {
  return input.trim().toLowerCase();
}

/** Czy tekst jest poprawnym hookiem (format i długość jak w bazie). */
export function isValidHook(hook: string): boolean {
  return hook.length <= HOOK_MAX_LENGTH && HOOK_PATTERN.test(hook);
}

/** Techniczny e-mail konta Auth dla hooka. Rzuca wyjątek dla niepoprawnego hooka. */
export function hookToEmail(hook: string): string {
  if (!isValidHook(hook)) {
    throw new Error(`Niepoprawny hook: "${hook}"`);
  }
  return `${hook}@${TECHNICAL_EMAIL_DOMAIN}`;
}

/** Hook z technicznego e-maila albo `null`, gdy adres nie jest adresem konta aplikacji. */
export function emailToHook(email: string): string | null {
  const suffix = `@${TECHNICAL_EMAIL_DOMAIN}`;
  if (!email.endsWith(suffix)) return null;
  const hook = email.slice(0, -suffix.length);
  return isValidHook(hook) ? hook : null;
}

/** Litery bez rozkładu Unicode (NFD nie zdejmuje z nich znaków diakrytycznych). */
const TRANSLITERATION: Readonly<Record<string, string>> = {
  ł: 'l',
  đ: 'd',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
  ð: 'd',
  ı: 'i',
};

/**
 * Część hooka z imienia i nazwiska: małe litery, transliteracja polskich znaków,
 * słowa rozdzielone myślnikami, np. „Łukasz Żółw” → `lukasz-zolw`.
 */
export function slugifyName(...parts: readonly string[]): string {
  const slug = parts
    .join(' ')
    .toLowerCase()
    .replace(/[łđøæœßþðı]/g, (char) => TRANSLITERATION[char] ?? char)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? FALLBACK_SLUG : slug;
}

/**
 * Hook z imienia, nazwiska i sufiksu, np. `lukasz-zolw-7c1e`. Długa nazwa jest
 * skracana tak, żeby hook mieścił się w {@link HOOK_MAX_LENGTH} znakach.
 */
export function createHook(firstName: string, lastName: string, suffix: string): string {
  if (!new RegExp(`^[0-9a-f]{${HOOK_SUFFIX_LENGTH}}$`).test(suffix)) {
    throw new Error(`Sufiks hooka musi mieć ${HOOK_SUFFIX_LENGTH} znaki szesnastkowe: "${suffix}"`);
  }
  const maxSlug = HOOK_MAX_LENGTH - HOOK_SUFFIX_LENGTH - 1;
  const slug = slugifyName(firstName, lastName).slice(0, maxSlug).replace(/-+$/, '');
  return `${slug}-${suffix}`;
}

/** Źródło losowości: `crypto.getRandomValues` (przeglądarka, Node, Deno). */
export type RandomSource = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const cryptoRandom: RandomSource = (bytes) => globalThis.crypto.getRandomValues(bytes);

/** Losowy sufiks hooka: 4 znaki szesnastkowe z generatora kryptograficznego. */
export function randomHookSuffix(random: RandomSource = cryptoRandom): string {
  const bytes = random(new Uint8Array(HOOK_SUFFIX_LENGTH / 2));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Znaki hasła: litery i cyfry bez łatwych do pomylenia (0/O, 1/l/I), żeby hasło dało się
 * przepisać z ekranu admina.
 */
export const PASSWORD_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Losowe hasło z generatora kryptograficznego. Odrzucanie bajtów spoza
 * wielokrotności alfabetu usuwa przewagę części znaków (bez błędu modulo).
 */
export function generatePassword(
  length: number = GENERATED_PASSWORD_LENGTH,
  random: RandomSource = cryptoRandom,
): string {
  if (!Number.isInteger(length) || length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`);
  }
  const size = PASSWORD_ALPHABET.length;
  const limit = 256 - (256 % size);
  let password = '';
  while (password.length < length) {
    for (const byte of random(new Uint8Array(length * 2))) {
      if (byte < limit && password.length < length)
        password += PASSWORD_ALPHABET.charAt(byte % size);
    }
  }
  return password;
}
