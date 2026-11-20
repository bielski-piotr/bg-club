/**
 * Wszystkie teksty interfejsu w jednym miejscu.
 * Komponenty nie zawierają literałów tekstowych; korzystają z `t` z `src/i18n`.
 * Parametry w nawiasach klamrowych (np. `{names}`) podstawia funkcja `format`.
 * Formy liczby mnogiej (`one` / `few` / `many`) wybiera funkcja `plural`.
 */
export const pl = {
  app: {
    name: 'BG Club',
  },
  ui: {
    /** Dopisek do imienia usuniętego członka (np. w etykiecie awatara). */
    removedSuffix: '(usunięty)',
  },
  hub: {
    mainLabel: 'Widżety klubu',
  },
  /** Menu konta pod awatarem w nagłówku. */
  avatarMenu: {
    label: 'Menu konta',
    trigger: 'Twoje konto: {name}',
    profile: 'Mój profil',
    settings: 'Ustawienia',
    signOut: 'Wyloguj się',
  },
} as const;

export type Messages = typeof pl;
