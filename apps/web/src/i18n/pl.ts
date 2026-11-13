/**
 * Wszystkie teksty interfejsu w jednym miejscu (PRD §1.1).
 * Komponenty nie zawierają literałów tekstowych; korzystają z `t` z `src/i18n`.
 * Parametry w nawiasach klamrowych (np. `{names}`) podstawia funkcja `format`.
 */
export const pl = {
  app: {
    name: 'BG Club',
    tagline: 'Aplikacja klubu planszówkowego',
  },
  start: {
    title: 'Szkielet aplikacji działa',
    body: 'Logowanie, zakładanie klubu i widok Klubu pojawią się w kolejnych etapach.',
    backendLabel: 'Supabase',
  },
  config: {
    errorTitle: 'Brak konfiguracji aplikacji',
    errorBody:
      'Aplikacja nie może połączyć się z Supabase. Uzupełnij zmienne środowiskowe i uruchom ją ponownie.',
    missing: 'Brakujące zmienne: {names}.',
    invalidUrl: 'Zmienna {name} musi być adresem http:// lub https://.',
    hint: 'Skopiuj apps/web/.env.example do apps/web/.env.local i wpisz wartości z `pnpm db:start`.',
  },
} as const;

/** Kształt słownika tekstów; kolejne języki muszą go spełniać. */
export type Messages = DeepStringRecord<typeof pl>;

type DeepStringRecord<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};
