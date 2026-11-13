/** Adres galerii komponentów. */
export const DESIGN_SYSTEM_PATH = '/design-system';

/** Widok aplikacji według ścieżki: hub (z popupami w `?p=…`), galeria albo nieznana strona. */
export type AppView = 'app' | 'designSystem' | 'notFound';

function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function viewForPath(pathname: string): AppView {
  const path = normalize(pathname);
  if (path === '/' || path === '/index.html') return 'app';
  if (path === DESIGN_SYSTEM_PATH) return 'designSystem';
  return 'notFound';
}
