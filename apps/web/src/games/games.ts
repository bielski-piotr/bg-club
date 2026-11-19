import type { SupabaseClient } from '@supabase/supabase-js';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import type { ScaledImage } from '../club/image';
import { COVERS_BUCKET } from '../hub/club';
import { isUuid } from '../popups/routes';
import { gameRow, type GameFormValues } from './form';

/**
 * Gra z kolekcji z widoku `game_collection`: tylko aktywne gry i data
 * ostatniej zapisanej partii (kolejność widżetu).
 */
export interface Game {
  readonly id: string;
  readonly title: string;
  /** Ścieżka w buckecie `covers` (`games/<plik>`); `null` = monogram tytułu. */
  readonly cover_path: string | null;
  readonly min_players: number;
  readonly max_players: number;
  /** Punkty za miejsca 1…max_players, do dwóch miejsc po przecinku. */
  readonly placement_points: readonly number[];
  /** Skomplikowanie 1…5; `null` tylko w grach dodanych przed wprowadzeniem pola. */
  readonly complexity: number | null;
  readonly created_at: string;
  /** `saved_at` ostatniej zapisanej partii; `null` = jeszcze nie grana. */
  readonly last_played_at: string | null;
}

export const GAME_COLUMNS =
  'id, title, cover_path, min_players, max_players, placement_points, complexity, created_at, last_played_at';

/** Ile gier pokazuje widżet (domyślnie 5). */
export const COLLECTION_WIDGET_SIZE = 5;

/** Wszystkie zapytania o gry; zapis gry odświeża je razem. */
export const gamesKey = ['games'] as const;
export const collectionWidgetKey = [...gamesKey, 'widget'] as const;
export const gameSearchKey = (query: string) => [...gamesKey, 'search', query] as const;
export const gameKey = (id: string) => [...gamesKey, 'byId', id] as const;

export interface CollectionWidgetData {
  readonly games: readonly Game[];
  /** Liczba wszystkich aktywnych gier (licznik w nagłówku). */
  readonly total: number;
}

/**
 * Widżet kolekcji: najpierw gry z zapisanymi partiami według daty ostatniej
 * partii malejąco, potem pozostałe według daty dodania malejąco; remisy rozstrzyga `id`.
 */
export function collectionWidgetQuery(client: SupabaseClient) {
  return queryOptions({
    queryKey: collectionWidgetKey,
    queryFn: async (): Promise<CollectionWidgetData> => {
      const { data, error, count } = await client
        .from('game_collection')
        .select(GAME_COLUMNS, { count: 'exact' })
        .order('last_played_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id')
        .limit(COLLECTION_WIDGET_SIZE)
        .returns<Game[]>();
      if (error) throw error;
      return { games: data, total: count ?? data.length };
    },
  });
}

export function useCollectionWidget(client: SupabaseClient) {
  return useQuery(collectionWidgetQuery(client));
}

/**
 * Gry pasujące do wyszukiwania według tytułu. Porównanie robi baza (`search_games`:
 * unaccent + lower), więc „zolw” znajdzie „Żółwie”. Puste zapytanie = cała kolekcja. Przy
 * zmianie zapytania widać poprzednie wyniki, dopóki nie przyjdą nowe.
 */
export function useGameSearch(client: SupabaseClient, query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: gameSearchKey(normalized),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Game[]> => {
      const { data, error } = await client
        .rpc('search_games', { query: normalized })
        .select(GAME_COLUMNS);
      if (error) throw error;
      return data as unknown as Game[];
    },
  });
}

/** Aktywna gra; `null` = nie ma takiej gry albo została usunięta. */
export function useGame(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: gameKey(id),
    queryFn: async (): Promise<Game | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client
        .from('game_collection')
        .select(GAME_COLUMNS)
        .eq('id', id)
        .maybeSingle<Game>();
      if (error) throw error;
      return data;
    },
  });
}

/** Co zrobić z okładką przy zapisie formularza. */
export type CoverChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'new'; readonly image: ScaledImage };

/** Powód nieudanego zapisu lub usunięcia (komunikaty w `t.games.form.errors`). */
export type GameSaveFailure = 'forbidden' | 'upload' | 'save' | 'gone';

export class GameSaveError extends Error {
  constructor(readonly reason: GameSaveFailure) {
    super(`game: ${reason}`);
    this.name = 'GameSaveError';
  }
}

/** Nazwa pliku okładki: zawsze nowa, więc podpisany URL starej nie pokaże nowego obrazu. */
export function newCoverPath(gameId: string, extension: string): string {
  return `games/${gameId}-${crypto.randomUUID()}.${extension}`;
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly message?: string | undefined;
}

function failureFor(error: PostgrestLikeError): GameSaveFailure {
  // 42501: RLS lub brak uprawnień (gracz).
  if (error.code === '42501') return 'forbidden';
  // PGRST116: UPDATE nie objął wiersza (gra usunięta albo RLS); 23514 games_deleted_immutable.
  if (error.code === 'PGRST116') return 'gone';
  if (error.code === '23514' && error.message?.includes('is deleted')) return 'gone';
  return 'save';
}

export interface GameDraft {
  /** Id nowej gry nadaje formularz (kolor monogramu jest od razu ten sam co po zapisie). */
  readonly id: string;
  readonly values: GameFormValues;
  readonly cover: CoverChange;
}

const SAVED_COLUMNS =
  'id, title, cover_path, min_players, max_players, placement_points, complexity, created_at';

/**
 * Dodaje grę (gdy `existing` = `null`) albo zapisuje zmiany. Nowa okładka trafia do
 * Storage przed zapisem wiersza; gdy zapis się nie uda, wysłany plik jest usuwany, a po udanym
 * zapisie usuwany jest poprzedni plik okładki. Zmiana punktacji dotyczy tylko kolejnych partii:
 * rozpoczęte mają snapshot w bazie.
 */
export async function saveGame(
  client: SupabaseClient,
  existing: Pick<Game, 'id' | 'cover_path'> | null,
  draft: GameDraft,
): Promise<void> {
  const storage = client.storage.from(COVERS_BUCKET);
  const id = existing?.id ?? draft.id;
  let uploaded: string | null = null;
  if (draft.cover.kind === 'new') {
    const { image } = draft.cover;
    const path = newCoverPath(id, image.extension);
    const { error } = await storage.upload(path, image.blob, {
      contentType: image.blob.type,
      upsert: false,
    });
    if (error) throw new GameSaveError('upload');
    uploaded = path;
  }

  const coverPath =
    draft.cover.kind === 'keep'
      ? (existing?.cover_path ?? null)
      : draft.cover.kind === 'new'
        ? uploaded
        : null;
  const row = { ...gameRow(draft.values), cover_path: coverPath };
  const result = existing
    ? await client
        .from('games')
        .update(row)
        .eq('id', id)
        .is('deleted_at', null)
        .select(SAVED_COLUMNS)
        .single()
    : await client
        .from('games')
        .insert({ ...row, id })
        .select(SAVED_COLUMNS)
        .single();

  if (result.error) {
    if (uploaded) await storage.remove([uploaded]).catch(() => undefined);
    throw new GameSaveError(failureFor(result.error));
  }

  const previous = existing?.cover_path ?? null;
  if (previous && previous !== coverPath) {
    // Stary plik jest już nieużywany; błąd usuwania nie psuje zapisu (zostaje sierotą).
    await storage.remove([previous]).catch(() => undefined);
  }
}

/**
 * Usuwa grę z kolekcji. Usunięcie jest miękkie: okładka i wiersz zostają dla historii
 * („usunięta z kolekcji”), a baza ustawia znacznik czasu i usuwa grę z głosowań zaplanowanych
 * spotkań. Ponowne usunięcie niczego nie zmienia (idempotentne).
 */
export async function deleteGame(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('games')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new GameSaveError(error.code === '42501' ? 'forbidden' : 'save');
}
