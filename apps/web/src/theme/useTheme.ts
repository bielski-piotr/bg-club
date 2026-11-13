import { useCallback, useSyncExternalStore } from 'react';
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
let preference: ThemePreference | undefined;

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

function current(): ThemePreference {
  preference ??= readStoredPreference(storage());
  return preference;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  // Motyw systemowy obsługuje CSS (`prefers-color-scheme`); tu tylko odświeżamy `resolved`.
  media?.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', listener);
  };
}

/** Bieżący wybór motywu (z `localStorage` albo ustawiony w tej karcie). */
export function getThemePreference(): ThemePreference {
  return current();
}

/** Ustawia motyw w całej aplikacji i zapamiętuje wybór. */
export function setThemePreference(next: ThemePreference): void {
  preference = next;
  storePreference(storage(), next);
  applyTheme(document.documentElement, next);
  listeners.forEach((listener) => listener());
}

/** Stosuje zapamiętany motyw przy starcie (uzupełnia skrypt z `index.html`). */
export function initTheme(): void {
  applyTheme(document.documentElement, current());
}

export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (next: ThemePreference) => void;
}

export function useTheme(): ThemeState {
  const pref = useSyncExternalStore(subscribe, current, () => 'system' as const);
  const dark = useSyncExternalStore(subscribe, systemDark, () => false);
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return { preference: pref, resolved: resolveTheme(pref, dark), setPreference };
}
