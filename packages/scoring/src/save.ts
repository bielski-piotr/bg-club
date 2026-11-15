/**
 * Wyniki partii dla RPC `save_play` (PRD PAD-5, PAD-7, §5.6.2, migracja `…_save_play.sql`).
 *
 * Klient przysyła tylko to, co wynika z kartki: gracza, miejsce w notesie, miejsce w partii,
 * wartości kategorii i wartość kategorii decydującej. Punkty, remisy i wygrane liczy baza
 * ze snapshotu punktacji partii, więc w ładunku ich nie ma (baza odrzuca inne klucze).
 */
import type { LineValues } from './template';

/** Wynik gracza z miejscami (np. `RankedPlayer` albo wynik `scorepad:save`). */
export interface RankedEntry {
  /** Miejsce na kartce, od 0. */
  readonly seat: number;
  readonly values: LineValues;
  readonly rankingValue: number | null;
  readonly place: number;
}

/** Jeden element tablicy `results` w `save_play`. */
export interface SavePlayResult {
  readonly profile_id: string;
  /** Miejsce w notesie, od 1 (`play_results.seat`). */
  readonly seat: number;
  readonly place: number;
  /** Wartości punktacji (`values` z PAD-7); puste pole to `null`. */
  readonly scores: Readonly<Record<string, number | null>>;
  readonly ranking_value: number | null;
}

/** Błąd: wynik bez gracza w tym miejscu notesu albo gracz bez wyniku. */
export class SavePlayResultsError extends Error {
  override readonly name = 'SavePlayResultsError';
}

const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Ładunek `results` dla `save_play`. `players` mapuje miejsce w notesie (od 1) na gracza partii;
 * każdy gracz musi mieć wynik, a każdy wynik gracza. Kolejność: według miejsca w notesie.
 */
export function savePlayResults(
  ranked: readonly RankedEntry[],
  players: ReadonlyMap<number, string>,
): SavePlayResult[] {
  const bySeat = new Map(ranked.map((r) => [r.seat + 1, r]));
  if (bySeat.size !== ranked.length)
    throw new SavePlayResultsError('Miejsce na kartce występuje dwa razy.');
  for (const seat of bySeat.keys())
    if (!players.has(seat)) throw new SavePlayResultsError(`Brak gracza na miejscu ${seat}.`);
  return [...players.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seat, profileId]) => {
      const r = bySeat.get(seat);
      if (!r) throw new SavePlayResultsError(`Brak wyniku gracza na miejscu ${seat}.`);
      const scores: Record<string, number | null> = {};
      for (const [line, value] of Object.entries(r.values))
        if (value !== undefined) scores[line] = finite(value);
      return {
        profile_id: profileId,
        seat,
        place: r.place,
        scores,
        ranking_value: finite(r.rankingValue),
      };
    });
}
