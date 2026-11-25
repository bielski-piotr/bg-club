import { createSignal, onSettled, type Accessor } from 'solid-js';
import { resolveTheme, type ResolvedTheme, type ThemePreference } from '../theme/theme';
import {
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  systemDark,
} from '../theme/themeStore';

export interface ThemeAccessors {
  readonly preference: Accessor<ThemePreference>;
  readonly resolved: Accessor<ResolvedTheme>;
  readonly setPreference: (next: ThemePreference) => void;
}

/** Wybór motywu w karcie (wersja Solid `useTheme`): ten sam stan co w React. */
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
