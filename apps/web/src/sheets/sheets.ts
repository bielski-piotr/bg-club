import type { ScorePadSheet } from '@bg-club/score-pad';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/authContext';
import { SIGNED_URL_SECONDS, signedUrlQuery } from '../lib/storage';
import { t } from '../i18n';
import { meetingsKey } from '../meetings/meetings';
import type { MeetingPlay, PlayResult } from '../meetings/plays';
import { isUuid } from '../popups/routes';
import { SHEETS_BUCKET } from './sheetImages';

/*
 * Historia karteczek (PRD PAD-6, GAME-10, VIEW-3): zapisane partie z obrazem oderwanej
 * karteczki, wpisami kartki i wersją szablonu z chwili rozpoczęcia. Gra, notes i ich zmiany po
 * partii nie zmieniają karteczki: wpisy i szablon są niezmiennym snapshotem partii (GAME-9),
 * a usunięta gra i notes zostają w historii (miękkie usunięcie, GAME-8).
 */

/** Podpisany adres obrazu karteczki; bez ścieżki zapytanie jest wyłączone. */
export function useSheetImageUrl(path: string | null | undefined) {
  const { client } = useAuth();
  return useQuery(signedUrlQuery(client, SHEETS_BUCKET, path ?? null)).data;
}

/** Zapisana karteczka partii: powiększenie, wyniki, spotkanie i podgląd 3D. */
export interface SavedSheet {
  readonly id: string;
  readonly saved_at: string;
  /** Wpisy kartki (format `sheet` pliku notesu). */
  readonly sheet: ScorePadSheet | null;
  readonly sheet_image_path: string | null;
  /** Niezmienna wersja szablonu z chwili rozpoczęcia partii (GAME-9). */
  readonly scorepad_version_id: string;
  /** Nazwa notesu (także usuniętego). */
  readonly scorepad_name: string;
  readonly game: MeetingPlay['game'];
  readonly meeting: { readonly id: string; readonly title: string; readonly starts_at: string };
  readonly results: readonly PlayResult[];
}

interface SheetRow {
  readonly id: string;
  readonly status: 'draft' | 'saved';
  readonly saved_at: string | null;
  readonly sheet: unknown;
  readonly sheet_image_path: string | null;
  readonly scorepad_version_id: string;
  readonly game_id: string;
  readonly meeting_id: string;
  readonly games: MeetingPlay['game'] | null;
  readonly meetings: SavedSheet['meeting'] | null;
  readonly scorepad_versions: { readonly scorepads: { readonly name: string } | null } | null;
  readonly play_results: readonly PlayResult[];
}

const SHEET_COLUMNS =
  'id, status, saved_at, sheet, sheet_image_path, scorepad_version_id, game_id, meeting_id, ' +
  'games(id, title, cover_path), meetings!plays_meeting_id_fkey(id, title, starts_at), ' +
  'scorepad_versions(scorepads!scorepad_versions_scorepad_id_fkey(name)), ' +
  'play_results!play_results_play_id_meeting_id_fkey(profile_id, seat, ranking_value, place, points, is_win)';

const isSheetData = (value: unknown): value is ScorePadSheet =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { names?: unknown }).names) &&
  typeof (value as { cells?: unknown }).cells === 'object';

export function fromSheetRow(row: SheetRow): SavedSheet | null {
  // Szkic nie jest karteczką: partia w toku nie ma jeszcze wyników ani obrazu.
  if (row.status !== 'saved' || !row.saved_at) return null;
  return {
    id: row.id,
    saved_at: row.saved_at,
    sheet: isSheetData(row.sheet) ? row.sheet : null,
    sheet_image_path: row.sheet_image_path,
    scorepad_version_id: row.scorepad_version_id,
    scorepad_name: row.scorepad_versions?.scorepads?.name ?? '',
    game: row.games ?? { id: row.game_id, title: t.meetings.plays.unknownGame, cover_path: null },
    meeting: row.meetings ?? { id: row.meeting_id, title: '', starts_at: row.saved_at },
    results: row.play_results,
  };
}

export const sheetKey = (id: string) => [...meetingsKey, 'sheet', id] as const;

/** Karteczka zapisanej partii; `null` = nie ma takiej partii albo jeszcze trwa. */
export function useSavedSheet(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: sheetKey(id),
    queryFn: async (): Promise<SavedSheet | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client
        .from('plays')
        .select(SHEET_COLUMNS)
        .eq('id', id)
        .maybeSingle<SheetRow>();
      if (error) throw error;
      return data ? fromSheetRow(data) : null;
    },
  });
}

/** Karteczka w galerii gry (GAME-10). */
export interface GallerySheet {
  readonly id: string;
  readonly saved_at: string;
  readonly sheet_image_path: string | null;
  /** Podpisany adres obrazu (jedno żądanie dla całej galerii). */
  readonly image_url: string | null;
  readonly meeting_title: string;
  readonly winners: readonly string[];
}

interface GalleryRow {
  readonly id: string;
  readonly saved_at: string;
  readonly sheet_image_path: string | null;
  readonly meetings: { readonly title: string } | null;
  readonly play_results: readonly {
    readonly profile_id: string;
    readonly is_win: boolean | null;
  }[];
}

export const gameSheetsKey = (gameId: string) => [...meetingsKey, 'game-sheets', gameId] as const;

/**
 * Wszystkie oderwane karteczki gry od najnowszej (GAME-10, §5.6.6: `saved_at`, potem `id`).
 * Także po edycji i usunięciu notesu: partie wskazują niezmienne wersje szablonu.
 */
export function useGameSheets(client: SupabaseClient, gameId: string) {
  return useQuery({
    queryKey: gameSheetsKey(gameId),
    staleTime: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
    queryFn: async (): Promise<GallerySheet[]> => {
      if (!isUuid(gameId)) return [];
      const { data, error } = await client
        .from('plays')
        .select(
          'id, saved_at, sheet_image_path, meetings!plays_meeting_id_fkey(title), ' +
            'play_results!play_results_play_id_meeting_id_fkey(profile_id, is_win)',
        )
        .eq('game_id', gameId)
        .eq('status', 'saved')
        .order('saved_at', { ascending: false })
        .order('id', { ascending: false })
        .returns<GalleryRow[]>();
      if (error) throw error;
      const paths = data.flatMap((row) => (row.sheet_image_path ? [row.sheet_image_path] : []));
      const urls = new Map<string, string>();
      if (paths.length > 0) {
        const signed = await client.storage
          .from(SHEETS_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_SECONDS);
        // Bez adresów galeria pokazuje karteczki zastępcze; zapytanie się nie wywraca.
        for (const item of signed.data ?? []) {
          if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
        }
      }
      return data.map((row) => ({
        id: row.id,
        saved_at: row.saved_at,
        sheet_image_path: row.sheet_image_path,
        image_url: row.sheet_image_path ? (urls.get(row.sheet_image_path) ?? null) : null,
        meeting_title: row.meetings?.title ?? '',
        winners: row.play_results.filter((r) => r.is_win).map((r) => r.profile_id),
      }));
    },
  });
}
