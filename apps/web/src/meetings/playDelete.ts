import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/query-core';
import { gamesKey } from '../games/games';
import { isOwnProfileKey, profilesKey } from '../profile/profileQueries';
import { removeSheetImages } from '../sheets/sheetImages';
import { meetingsKey } from './meetings';

/*
 * Usunięcie zapisanej partii przez admina (migracja): RPC
 * `delete_play` w jednej transakcji usuwa partię, wyniki i kartkę oraz przelicza zależne dane,
 * a potem aplikacja usuwa obraz karteczki z bucketu `sheets`. Błąd Storage nie przywraca
 * partii: obraz można usunąć ponownie, a plik bez partii posprząta też `orphan_sheet_images`.
 */

export type PlayDeleteFailure =
  /** Tylko admin usuwa partie. */
  | 'forbidden'
  /** Partia jest w toku: porzuca się ją, nie usuwa. */
  | 'draft'
  /** Brak połączenia albo inny błąd serwera: ponowienie może pomóc. */
  | 'server';

export class PlayDeleteError extends Error {
  constructor(readonly reason: PlayDeleteFailure) {
    super(`delete play: ${reason}`);
    this.name = 'PlayDeleteError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly hint?: string | null | undefined;
}

export function playDeleteFailure(error: PostgrestLikeError): PlayDeleteFailure {
  if (error.code === '42501') return 'forbidden';
  if (error.hint === 'plays_not_saved') return 'draft';
  return 'server';
}

export interface DeletedPlay {
  /** Obraz karteczki do usunięcia ze Storage; `null` = partia nie miała obrazu. */
  readonly imagePath: string | null;
  /** `false`: partii już nie było (np. ponowienie po zerwanym połączeniu). */
  readonly deleted: boolean;
}

/**
 * Usuwa zapisaną partię. Partia, której już nie ma (równoległe usunięcie, ponowienie po
 * utracie odpowiedzi), to sukces: wynik nie wraca, a jej obraz posprząta `orphan_sheet_images`.
 */
export async function deletePlay(client: SupabaseClient, playId: string): Promise<DeletedPlay> {
  const { data, error } = await client.rpc('delete_play', { play_id: playId });
  if (!error) return { imagePath: typeof data === 'string' ? data : null, deleted: true };
  if (error.hint === 'plays_not_found') return { imagePath: null, deleted: false };
  throw new PlayDeleteError(playDeleteFailure(error));
}

/**
 * Usuwa obraz karteczki usuniętej partii. `false` = błąd Storage albo sieci (plik zostaje
 * i można ponowić). Pusta lista usuniętych bez błędu znaczy, że pliku już nie ma (admin może
 * usuwać każdy obraz karteczki, polityka `bg_club_sheets_delete_admin`).
 */
export function removeDeletedPlayImage(client: SupabaseClient, path: string): Promise<boolean> {
  return removeSheetImages(client, [path]);
}

/** Klucze pamięci podręcznej widoków liczonych z zapisanych partii. */
export const PLAY_DEPENDENT_KEYS: readonly (readonly string[])[] = [
  // Spotkania: lista partii, podsumowanie, timeline, kalendarz, karteczki, galerie gier.
  meetingsKey,
  // Kolekcja: „ostatnio grane”.
  gamesKey,
  // Profile: statystyki, rankingi i serie (E5/E6); bez własnego profilu
  // zalogowanego (rola, motyw), którego partie nie zmieniają.
  profilesKey,
];

/**
 * Odświeża widoki zależne od zapisanych partii po ich zmianie: przeliczenie w bazie
 * zmienia rankingi, serie i rekordy, więc nieaktualne są wszystkie widoki
 * `PLAY_DEPENDENT_KEYS`. Aktywne pobierają się od razu, pozostałe przy następnym otwarciu.
 */
export async function invalidatePlayData(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    PLAY_DEPENDENT_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
        predicate: (query) => !isOwnProfileKey(query.queryKey),
      }),
    ),
  );
}
