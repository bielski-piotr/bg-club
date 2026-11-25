import { applyTheme, readStoredPreference, storePreference, type ThemePreference } from './theme';

/*
 * Wybór motywu w karcie bez zależności od frameworka: hook React (`useTheme`) i akcesor Solid
 * (`src/solid/theme.ts`) czytają ten sam stan i słuchają tych samych zmian.
 */

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

/** Czy system ma ciemny motyw (`prefers-color-scheme`). */
export function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

function current(): ThemePreference {
  preference ??= readStoredPreference(storage());
  return preference;
}

/** Nasłuch zmian wyboru motywu i motywu systemu; zwraca funkcję wypisania. */
export function subscribeTheme(listener: () => void): () => void {
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
