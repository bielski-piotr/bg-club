import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { sheetImageUrlQuery } from '../sheets/sheets';

/*
 * Hook React karteczek dla obszarów jeszcze w React (do etapu 8 migracji na Solid,
 * docs/solidjs-2-migration.md); opcje zapytań są w `sheets/sheets.ts`.
 */

/** Podpisany adres obrazu karteczki; bez ścieżki zapytanie jest wyłączone. */
export function useSheetImageUrl(path: string | null | undefined) {
  const { client } = useAuth();
  return useQuery(sheetImageUrlQuery(client, path));
}
