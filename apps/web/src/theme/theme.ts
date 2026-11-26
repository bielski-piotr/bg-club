/**
 * Motyw aplikacji: jasny, ciemny albo systemowy.
 *
 * Wybór trafia do atrybutu `data-theme` na <html>; brak atrybutu oznacza motyw systemowy
 * (`prefers-color-scheme`). Do czasu zapisu w profilu  preferencja jest pamiętana
 * w `localStorage`. Ten sam klucz czyta skrypt w `index.html`, żeby uniknąć mignięcia motywu.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bg-club.theme';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Kolor paska przeglądarki (`theme-color`) = tło strony w danym motywie. */
export const THEME_COLOR: Readonly<Record<ResolvedTheme, string>> = {
  light: '#F3F4F8',
  dark: '#0F1220',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readStoredPreference(
  storage: Pick<Storage, 'getItem'> | undefined,
): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function storePreference(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
  preference: ThemePreference,
): void {
  try {
    if (preference === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Prywatne okno lub zablokowana pamięć: motyw działa do przeładowania strony.
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/** Ustawia `data-theme` i jednolity `theme-color` dla wybranego motywu. */
export function applyTheme(root: HTMLElement, preference: ThemePreference): void {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);

  const doc = root.ownerDocument;
  const metas = doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((meta) => {
    // Motyw systemowy: każdy wpis ma kolor swojego `media`. Wymuszony: oba ten sam kolor.
    const own = (meta.getAttribute('media') ?? '').includes('dark')
      ? THEME_COLOR.dark
      : THEME_COLOR.light;
    meta.content = preference === 'system' ? own : THEME_COLOR[preference];
  });
}
