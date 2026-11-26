import { createEffect, createMemo, createSignal, onSettled, type Accessor } from 'solid-js';
import { resolveTheme, type ResolvedTheme, type ThemePreference } from './theme';
import { getThemePreference, setThemePreference, subscribeTheme, systemDark } from './themeStore';

export interface ThemeAccessors {
  readonly preference: Accessor<ThemePreference>;
  readonly resolved: Accessor<ResolvedTheme>;
  readonly setPreference: (next: ThemePreference) => void;
}

/** Wybór motywu w karcie: stan z `themeStore`, odświeżany przy każdej zmianie. */
export function createTheme(): ThemeAccessors {
  const [preference, setPreference] = createSignal(getThemePreference());
  const [dark, setDark] = createSignal(systemDark());
  onSettled(() =>
    subscribeTheme(() => {
      setPreference(getThemePreference());
      setDark(systemDark());
    }),
  );
  return {
    preference,
    resolved: () => resolveTheme(preference(), dark()),
    setPreference: (next) => setThemePreference(next),
  };
}

/**
 * Motyw z profilu jest źródłem prawdy (USR-8): działa na każdym urządzeniu. `localStorage` to
 * tylko podręczna kopia, którą skrypt w `index.html` stosuje przed pierwszym renderem, żeby
 * motyw nie migał. Gdy profil ma inny motyw (zmiana na innym urządzeniu), stosujemy go i
 * zapisujemy kopię. Reaguje tylko na zmianę wartości w profilu (memo), więc lokalny wybór
 * w ustawieniach (zapisywany równolegle do profilu) nie jest cofany.
 */
export function createProfileTheme(theme: Accessor<ThemePreference | undefined>): void {
  const value = createMemo(theme);
  createEffect(value, (next) => {
    if (next !== undefined && next !== getThemePreference()) setThemePreference(next);
  });
}
