import { useContext, type Accessor } from 'solid-js';
import { AuthContext } from '../auth/authContext';
import { createQuery } from '../lib/query';
import { gameSheetsQuery, savedSheetQuery, sheetImageUrlQuery } from './sheets';

/*
 * Zapytania o karteczki: opcje z `sheets.ts` na wspólnym cache. Parametry jako akcesory.
 */

/** Podpisany adres obrazu karteczki; bez ścieżki zapytanie jest wyłączone. */
export function createSheetImageUrl(path: Accessor<string | null | undefined>) {
  const auth = useContext(AuthContext);
  return createQuery(() => sheetImageUrlQuery(auth.client, path()));
}

/** Karteczka zapisanej partii (`savedSheetQuery`). */
export function createSavedSheet(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => savedSheetQuery(auth.client, id()));
}

/** Galeria karteczek gry (`gameSheetsQuery`). */
export function createGameSheets(gameId: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameSheetsQuery(auth.client, gameId()));
}
