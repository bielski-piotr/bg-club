/** Widok aplikacji według ścieżki: hub (z popupami w `?p=…`) albo nieznana strona. */
export type AppView = 'app' | 'notFound';

function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function viewForPath(pathname: string): AppView {
  const path = normalize(pathname);
  return path === '/' || path === '/index.html' ? 'app' : 'notFound';
}
