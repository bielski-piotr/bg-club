import type { SupabaseClient } from '@supabase/supabase-js';
import { keepPreviousData } from '@tanstack/query-core';
import { COVERS_BUCKET } from '../club/club';
import { isUuid } from '../popups/routes';
import type { CroppedCover } from './cover';
import { gameRow, type GameFormValues } from './form';

/**
 * Gra z kolekcji (PRD §5.4) z widoku `game_collection`: tylko aktywne gry (GAME-8) i data
 * ostatniej zapisanej partii (kolejność widżetu, GAME-1).
 */
export interface Game {
  readonly id: string;
  readonly title: string;
  /** Ścieżka w buckecie `covers` (`games/<plik>`); `null` = monogram tytułu (GAME-6). */
  readonly cover_path: string | null;
  readonly min_players: number;
  readonly max_players: number;
  /** Punkty za miejsca 1…max_players (GAME-5), do dwóch miejsc po przecinku. */
  readonly placement_points: readonly number[];
  /** Skomplikowanie 1…5; `null` tylko w grach dodanych przed wprowadzeniem pola. */
  readonly complexity: number | null;
  readonly created_at: string;
  /** `saved_at` ostatniej zapisanej partii (dodatku: partii z nim); `null` = jeszcze nie grana. */
  readonly last_played_at: string | null;
  /** Gra podstawowa dodatku; `null` = gra podstawowa (tylko te są w kolekcji i głosowaniu). */
  readonly base_game_id: string | null;
  /** Oryginał okładki w buckecie `covers` (ponowne kadrowanie); `null` = kadruje się okładkę. */
  readonly cover_source_path: string | null;
  /** Kadr okładki z oryginału (`StoredCrop`); `null` = bez zapisanego kadru. */
  readonly cover_crop: unknown;
  /** Dodatek: liczba zapisanych partii z nim; gra podstawowa: `null`. */
  readonly play_count: number | null;
  /**
   * Dostępność: niedostępna gra jest w kolekcji (wyszarzona) i w filtrach, ale nie da się jej
   * wybrać w głosowaniu, publikacji ani w partii (niedostępnego dodatku też nie).
   */
  readonly available: boolean;
}

export const GAME_COLUMNS =
  'id, title, cover_path, min_players, max_players, placement_points, complexity, created_at, last_played_at, ' +
  'base_game_id, cover_source_path, cover_crop, play_count, available';

/** Ile gier pokazuje widżet (GAME-1: domyślnie 5). */
export const COLLECTION_WIDGET_SIZE = 5;

/** Wszystkie zapytania o gry; zapis gry odświeża je razem. */
export const gamesKey = ['games'] as const;
export const collectionWidgetKey = [...gamesKey, 'widget'] as const;
export const gameSearchKey = (query: string) => [...gamesKey, 'search', query] as const;
export const gameKey = (id: string) => [...gamesKey, 'byId', id] as const;
export const expansionsKey = (baseId: string) => [...gamesKey, 'expansions', baseId] as const;

export interface CollectionWidgetData {
  readonly games: readonly Game[];
  /** Liczba wszystkich aktywnych gier (licznik w nagłówku). */
  readonly total: number;
}

/**
 * Widżet kolekcji (GAME-1, Q11): najpierw gry z zapisanymi partiami według daty ostatniej
 * partii malejąco, potem pozostałe według daty dodania malejąco; remisy rozstrzyga `id`.
 */
export function collectionWidgetQuery(client: SupabaseClient) {
  return {
    queryKey: collectionWidgetKey,
    queryFn: async (): Promise<CollectionWidgetData> => {
      const { data, error, count } = await client
        .from('game_collection')
        .select(GAME_COLUMNS, { count: 'exact' })
        .is('base_game_id', null)
        .order('last_played_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id')
        .limit(COLLECTION_WIDGET_SIZE)
        .returns<Game[]>();
      if (error) throw error;
      return { games: data, total: count ?? data.length };
    },
  };
}

/*
 * Opcje zapytań o gry bez frameworka (akcesory: `games/gameData.ts`; prefetch w `SignedInScreen`).
 */

/**
 * Gry pasujące do wyszukiwania (GAME-2) według tytułu. Porównanie robi baza (`search_games`:
 * unaccent + lower), więc „zolw” znajdzie „Żółwie”. Puste zapytanie = cała kolekcja. Przy
 * zmianie zapytania widać poprzednie wyniki, dopóki nie przyjdą nowe.
 */
export function gameSearchQuery(client: SupabaseClient, query: string, enabled = true) {
  const normalized = query.trim();
  return {
    queryKey: gameSearchKey(normalized),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Game[]> => {
      const { data, error } = await client
        .rpc('search_games', { query: normalized })
        .select(GAME_COLUMNS);
      if (error) throw error;
      return data as unknown as Game[];
    },
  };
}

/** Aktywna gra; `null` = nie ma takiej gry albo została usunięta (GAME-8). */
export function gameQuery(client: SupabaseClient, id: string) {
  return {
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
  };
}

/**
 * Aktywne dodatki gry (widok gry podstawowej): alfabetycznie. Dodatków nie ma w kolekcji,
 * filtrach ani głosowaniu.
 */
export function expansionsQuery(client: SupabaseClient, baseId: string, enabled = true) {
  return {
    queryKey: expansionsKey(baseId),
    enabled,
    queryFn: async (): Promise<Game[]> => {
      if (!isUuid(baseId)) return [];
      const { data, error } = await client
        .from('game_collection')
        .select(GAME_COLUMNS)
        .eq('base_game_id', baseId)
        .order('title_search')
        .order('id')
        .returns<Game[]>();
      if (error) throw error;
      return data;
    },
  };
}

/** Wszystkie aktywne dodatki (kreator partii i przenoszenie notesu), alfabetycznie. */
export function allExpansionsQuery(client: SupabaseClient, enabled = true) {
  return {
    queryKey: [...gamesKey, 'expansions', 'all'] as const,
    enabled,
    queryFn: async (): Promise<Game[]> => {
      const { data, error } = await client
        .from('game_collection')
        .select(GAME_COLUMNS)
        .not('base_game_id', 'is', null)
        .order('title_search')
        .order('id')
        .returns<Game[]>();
      if (error) throw error;
      return data;
    },
  };
}

/** Tytuły gier i dodatków (także usuniętych) po id: dodatki partii w historii spotkań. */
export function gameTitlesQuery(client: SupabaseClient, ids: readonly string[]) {
  const sorted = [...new Set(ids)].filter(isUuid).sort();
  return {
    queryKey: [...gamesKey, 'titles', sorted.join(',')] as const,
    enabled: sorted.length > 0,
    queryFn: async (): Promise<ReadonlyMap<string, string>> => {
      const { data, error } = await client
        .from('games')
        .select('id, title')
        .in('id', sorted)
        .returns<{ id: string; title: string }[]>();
      if (error) throw error;
      return new Map(data.map((row) => [row.id, row.title]));
    },
  };
}

/** Co zrobić z okładką przy zapisie formularza. */
export type CoverChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | ({ readonly kind: 'new' } & CroppedCover);

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

/** Nazwa pliku oryginału okładki (do ponownego kadrowania). */
export function newCoverSourcePath(gameId: string, extension: string): string {
  return `games/${gameId}-source-${crypto.randomUUID()}.${extension}`;
}

/** Pliki poprzedniej okładki, których nowa nie używa (do usunięcia po zapisie). */
export function unusedCoverFiles(
  previous: readonly (string | null)[],
  next: readonly (string | null)[],
): string[] {
  const kept = new Set(next.filter((path): path is string => path !== null));
  return [...new Set(previous.filter((path): path is string => path !== null && !kept.has(path)))];
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
  /** Nowy dodatek: gra podstawowa (przy edycji ignorowane: `base_game_id` jest niezmienne). */
  readonly baseGameId?: string | null | undefined;
}

const SAVED_COLUMNS =
  'id, title, cover_path, min_players, max_players, placement_points, complexity, created_at';

/**
 * Dodaje grę albo dodatek (gdy `existing` = `null`) albo zapisuje zmiany (GAME-3). Nowa okładka
 * (wynik kadru) i jej oryginał trafiają do Storage przed zapisem wiersza; gdy zapis się nie
 * uda, wysłane pliki są usuwane, a po udanym zapisie usuwane są pliki poprzedniej okładki, których
 * nowa nie używa (ponowne kadrowanie zostawia oryginał). Zmiana punktacji dotyczy tylko kolejnych
 * partii: rozpoczęte mają snapshot w bazie (GAME-9).
 */
export async function saveGame(
  client: SupabaseClient,
  existing: Pick<Game, 'id' | 'cover_path' | 'cover_source_path'> | null,
  draft: GameDraft,
): Promise<void> {
  const storage = client.storage.from(COVERS_BUCKET);
  const id = existing?.id ?? draft.id;
  const uploaded: string[] = [];
  const upload = async (path: string, image: { readonly blob: Blob }) => {
    const { error } = await storage.upload(path, image.blob, {
      contentType: image.blob.type,
      upsert: false,
    });
    if (error) {
      if (uploaded.length > 0) await storage.remove(uploaded).catch(() => undefined);
      throw new GameSaveError('upload');
    }
    uploaded.push(path);
    return path;
  };

  const cover = draft.cover;
  let files: {
    cover_path: string | null;
    cover_source_path: string | null;
    cover_crop: unknown;
  } | null = null;
  if (cover.kind === 'new') {
    const coverPath = await upload(newCoverPath(id, cover.image.extension), cover.image);
    const sourcePath =
      cover.source.kind === 'upload'
        ? await upload(newCoverSourcePath(id, cover.source.image.extension), cover.source.image)
        : cover.source.path;
    files = { cover_path: coverPath, cover_source_path: sourcePath, cover_crop: cover.crop };
  } else if (cover.kind === 'remove') {
    files = { cover_path: null, cover_source_path: null, cover_crop: null };
  }

  const row = { ...gameRow(draft.values), ...(files ?? {}) };
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
        .insert({ ...row, id, base_game_id: draft.baseGameId ?? null })
        .select(SAVED_COLUMNS)
        .single();

  if (result.error) {
    if (uploaded.length > 0) await storage.remove(uploaded).catch(() => undefined);
    throw new GameSaveError(failureFor(result.error));
  }

  if (existing && files) {
    // Stare pliki są już nieużywane; błąd usuwania nie psuje zapisu (zostają sierotami).
    const unused = unusedCoverFiles(
      [existing.cover_path, existing.cover_source_path],
      [files.cover_path, files.cover_source_path],
    );
    if (unused.length > 0) await storage.remove(unused).catch(() => undefined);
  }
}

/**
 * Usuwa grę z kolekcji (GAME-8). Usunięcie jest miękkie: okładka i wiersz zostają dla historii
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
