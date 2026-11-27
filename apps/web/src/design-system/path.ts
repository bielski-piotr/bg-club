import { parsePage } from '../popups/routes';

/** Adres galerii komponentów. */
export const DESIGN_SYSTEM_PATH = '/design-system';

/** Widok aplikacji według ścieżki: strony aplikacji (z popupami w `?p=…`), galeria albo nieznana strona. */
export type AppView = 'app' | 'designSystem' | 'notFound';

export function viewForPath(pathname: string): AppView {
  if (parsePage(pathname)) return 'app';
  if ((pathname.replace(/\/+$/, '') || '/') === DESIGN_SYSTEM_PATH) return 'designSystem';
  return 'notFound';
}
