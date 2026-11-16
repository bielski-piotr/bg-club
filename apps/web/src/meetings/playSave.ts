import type { ScorePadSheet } from '@bg-club/score-pad';
import {
  placementPoints,
  savePlayResults,
  type RankedPlayer,
  type SavePlayResult,
} from '@bg-club/scoring';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseAchievementNotifications,
  type AchievementNotification,
} from '../profile/achievementNotifications';

/*
 * Zakończenie partii (PRD PAD-5, PAD-7, §5.6, migracja [029]): po oderwaniu karteczki notes
 * podaje wyniki graczy (miejsca według reguły notesu), aplikacja pokazuje podsumowanie
 * z punktami leaderboardu, a po potwierdzeniu `save_play` zapisuje kartkę i wyniki w jednej
 * transakcji. Punkty, remisy i wygrane liczy baza; podgląd w podsumowaniu liczy je tymi samymi
 * regułami (`placementPoints`) ze snapshotu punktacji partii.
 *
 * Zapis jest idempotentny: ponowienie z tą samą treścią (po błędzie sieci albo przekroczeniu
 * czasu, także z drugiej karty) zwraca zapisaną partię zamiast tworzyć drugą.
 */

/** Wiersz podsumowania: gracz partii z miejscem, wynikiem i punktami (w kolejności miejsc). */
export interface SummaryRow {
  /** Miejsce w notesie, od 1. */
  readonly seat: number;
  readonly profileId: string;
  readonly place: number;
  readonly tied: boolean;
  /** Wartość kategorii decydującej. */
  readonly value: number | null;
  /** Podgląd punktów leaderboardu (bazę liczy je sama). */
  readonly points: number | null;
  readonly win: boolean;
}

export interface PlaySummary {
  readonly rows: readonly SummaryRow[];
  /** Ładunek `results` dla `save_play`. */
  readonly results: readonly SavePlayResult[];
  readonly sheet: ScorePadSheet;
}

/** Gracze partii na miejscach notesu (od 1). */
export interface PlaySeats {
  readonly seats: readonly { readonly profile_id: string; readonly seat: number }[];
  readonly points_snapshot: readonly number[];
}

/**
 * Podsumowanie oderwanej kartki. `null`, gdy wyniki nie pasują do graczy partii (np. kartka
 * bez graczy na miejscach) albo nikt nie ma wartości kategorii decydującej: takiej kartki nie
 * da się zapisać.
 */
export function playSummary(
  play: PlaySeats,
  sheet: ScorePadSheet,
  ranked: readonly RankedPlayer[],
): PlaySummary | null {
  const players = new Map(play.seats.map((s) => [s.seat, s.profile_id]));
  if (!ranked.some((r) => r.rankingValue !== null)) return null;
  // Notes liczy wyniki graczy z imieniem albo wpisem; każdy musi być graczem partii i odwrotnie.
  let results: SavePlayResult[];
  try {
    results = savePlayResults(ranked, players);
  } catch {
    return null;
  }
  const tied = new Map(ranked.map((r) => [r.seat + 1, r.tied]));
  let points: number[] | null = null;
  try {
    points = placementPoints(
      results.map((r) => r.place),
      play.points_snapshot,
    );
  } catch {
    points = null;
  }
  const rows = results
    .map((r, i): SummaryRow => ({
      seat: r.seat,
      profileId: r.profile_id,
      place: r.place,
      tied: tied.get(r.seat) ?? false,
      value: r.ranking_value,
      points: points?.[i] ?? null,
      win: r.place === 1,
    }))
    .sort((a, b) => a.place - b.place || a.seat - b.seat);
  return { rows, results, sheet };
}

/** Powód nieudanego zapisu partii (komunikaty w `t.meetings.play.summary.errors`). */
export type PlaySaveFailure =
  /** Partii już nie ma (porzucona na innym urządzeniu). */
  | 'gone'
  /** Partię zapisano już z inną kartką (np. na innym urządzeniu). */
  | 'saved'
  /** Spotkanie nie jest w trakcie. */
  | 'closed'
  | 'forbidden'
  /** Notes partii zmienił się albo wyniki nie pasują do partii; ponowienie nie pomoże. */
  | 'invalid'
  /** Brak połączenia albo przekroczony czas: ponowienie jest bezpieczne. */
  | 'network'
  | 'server';

export class PlaySaveError extends Error {
  constructor(readonly reason: PlaySaveFailure) {
    super(`save play: ${reason}`);
    this.name = 'PlaySaveError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly hint?: string | null | undefined;
}

const HINTS: Readonly<Record<string, PlaySaveFailure>> = {
  plays_not_found: 'gone',
  plays_already_saved: 'saved',
  plays_meeting_in_progress: 'closed',
  plays_scorepad_version_mismatch: 'invalid',
  plays_sheet_invalid: 'invalid',
  plays_sheet_too_large: 'invalid',
  plays_results_invalid: 'invalid',
  plays_results_players: 'invalid',
  plays_results_places: 'invalid',
  plays_results_ranking: 'invalid',
  plays_results_empty: 'invalid',
  plays_points_snapshot: 'invalid',
};

/**
 * Błąd PostgREST → powód (HINT z migracji [029]); bez kodu to błąd sieci. Naruszenie reguły
 * bez znanego HINT (np. z wyzwalacza: SQLSTATE 22…, 23…, P0…) też jest ostateczne: ponowienie
 * tej samej treści nic nie zmieni.
 */
export function playSaveFailure(error: PostgrestLikeError): PlaySaveFailure {
  const byHint = error.hint ? HINTS[error.hint] : undefined;
  if (byHint) return byHint;
  if (error.code === '42501') return 'forbidden';
  if (!error.code) return 'network';
  if (/^(22|23|P0)/.test(error.code)) return 'invalid';
  return 'server';
}

/** Ponowienie może się udać (zapis jest idempotentny). */
export const isRetryableSave = (reason: PlaySaveFailure): boolean =>
  reason === 'network' || reason === 'server';

/** Opóźnienia automatycznych ponowień zapisu po błędzie sieci (ms). */
export const SAVE_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];
/** Po tylu ms bez odpowiedzi żądanie jest przerywane i ponawiane. */
export const SAVE_TIMEOUT_MS = 15_000;

export interface SavePlayOptions {
  /** Stały dla automatycznych i ręcznych ponowień na urządzeniu zapisującym. */
  readonly requestId?: string | undefined;
  readonly retryDelays?: readonly number[] | undefined;
  readonly timeoutMs?: number | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sygnał przerwania po `ms` (`AbortSignal.timeout` nie ma np. Safari przed 16). */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms);
  return controller.signal;
}

/**
 * `save_play` z automatycznym ponowieniem po błędzie sieci albo przekroczeniu czasu. Każda
 * próba wysyła tę samą treść, więc baza zapisze partię najwyżej raz.
 */
export async function savePlay(
  client: SupabaseClient,
  play: { readonly id: string; readonly scorepad_version_id: string },
  summary: Pick<PlaySummary, 'sheet' | 'results'>,
  options: SavePlayOptions = {},
): Promise<readonly AchievementNotification[]> {
  const requestId = options.requestId ?? crypto.randomUUID();
  const delays = options.retryDelays ?? SAVE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? wait;
  for (let attempt = 0; ; attempt++) {
    let reason: PlaySaveFailure;
    try {
      const { data, error } = await client
        .rpc('save_play_with_achievements', {
          play_id: play.id,
          scorepad_version_id: play.scorepad_version_id,
          sheet: summary.sheet,
          results: summary.results,
          request_id: requestId,
        })
        .abortSignal(timeoutSignal(options.timeoutMs ?? SAVE_TIMEOUT_MS));
      if (!error) return parseAchievementNotifications(data);
      reason = playSaveFailure(error);
    } catch {
      reason = 'network';
    }
    const delay = delays[attempt];
    if (!isRetryableSave(reason) || delay === undefined) throw new PlaySaveError(reason);
    await sleep(delay);
  }
}
