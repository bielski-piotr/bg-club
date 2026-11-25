import { useCallback, useSyncExternalStore } from 'react';
import { resolveTheme, type ResolvedTheme, type ThemePreference } from './theme';
import { getThemePreference, setThemePreference, subscribeTheme, systemDark } from './themeStore';

export { getThemePreference, initTheme, setThemePreference } from './themeStore';

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (next: ThemePreference) => void;
}

export function useTheme(): ThemeState {
  const pref = useSyncExternalStore(subscribeTheme, getThemePreference, () => 'system' as const);
  const dark = useSyncExternalStore(subscribeTheme, systemDark, () => false);
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return { preference: pref, resolved: resolveTheme(pref, dark), setPreference };
}
