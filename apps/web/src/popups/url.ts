import { stackSearch } from './routes';

/**
 * Usuwa popupy z bieżącego adresu bez nowego wpisu historii. Używane po wylogowaniu, żeby
 * kolejna osoba logująca się na tym urządzeniu nie trafiła w popupy poprzedniej sesji.
 */
export function clearPopupsFromUrl(): void {
  const { pathname, search, hash } = window.location;
  const next = stackSearch(search, []);
  if (next !== search) window.history.replaceState(null, '', `${pathname}${next}${hash}`);
}
