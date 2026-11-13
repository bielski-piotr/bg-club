import { useEffect } from 'react';
import type { ThemePreference } from './theme';
import { getThemePreference, setThemePreference } from './useTheme';

/**
 * Motyw z profilu jest źródłem prawdy (USR-8): działa na każdym urządzeniu. `localStorage` to
 * tylko podręczna kopia, którą skrypt w `index.html` stosuje przed pierwszym renderem, żeby
 * motyw nie migał. Gdy profil ma inny motyw (zmiana na innym urządzeniu), stosujemy go i
 * zapisujemy kopię. Efekt reaguje tylko na zmianę wartości w profilu, więc lokalny wybór
 * w ustawieniach (zapisywany równolegle do profilu) nie jest cofany.
 */
export function useProfileTheme(theme: ThemePreference | undefined): void {
  useEffect(() => {
    if (theme !== undefined && theme !== getThemePreference()) setThemePreference(theme);
  }, [theme]);
}
