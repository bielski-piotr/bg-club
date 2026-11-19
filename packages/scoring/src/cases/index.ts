/**
 * Wspólny zestaw przypadków wyników: TypeScript liczy z nich miejsca i punkty,
 * a baza punkty (`public.play_points`, test pgTAP generowany przez `../sql.ts`).
 */
import type { PlayerEntry } from '../ranking';
import type { ScoringTemplate } from '../template';
import data from './play-cases.json';

export interface ExpectedResult {
  readonly seat: number;
  readonly rankingValue: number | null;
  readonly place: number;
  readonly tiedWith: readonly number[];
  readonly points: number;
}

export interface PlayCase {
  readonly name: string;
  readonly template: ScoringTemplate;
  /** Punktacja miejsc gry (snapshot partii). */
  readonly points: readonly number[];
  readonly players: readonly PlayerEntry[];
  /**
   * Notes z zespołami: liczba członków zespołu na miejscu kartki (klucz: miejsce od 0). Brak
   * klucza = jeden gracz.
   */
  readonly teams?: Readonly<Record<string, number>>;
  /** Wyniki w kolejności miejsc. */
  readonly expected: readonly ExpectedResult[];
}

/** Miejsca, z których baza i `placementPoints` nie policzą punktów. */
export interface InvalidPlacingCase {
  readonly name: string;
  readonly places: readonly number[];
  readonly points: readonly number[];
}

// JSON ma szersze typy (np. `kind: string`); kształt pilnuje test `cases.test.ts`.
export const playCases = data.cases as unknown as readonly PlayCase[];
export const invalidPlacings = data.invalidPlacings as readonly InvalidPlacingCase[];

/** Liczba graczy na miejscu kartki `seat` (od 0). */
export const teamSize = (c: PlayCase, seat: number): number => c.teams?.[String(seat)] ?? 1;

/** Miejsca i oczekiwane punkty w kolejności graczy z `players` (nie w kolejności miejsc). */
export function placesInSeatOrder(c: PlayCase): { places: number[]; points: number[] } {
  const bySeat = new Map(c.expected.map((e) => [e.seat, e]));
  const rows = c.players.map((p) => {
    const e = bySeat.get(p.seat);
    if (!e) throw new Error(`Przypadek „${c.name}”: brak wyniku dla miejsca ${p.seat}.`);
    return e;
  });
  return { places: rows.map((e) => e.place), points: rows.map((e) => e.points) };
}

/** Identyfikator `k`-tego (od 0) gracza na miejscu kartki `seat` (od 0) w testach SQL. */
export const caseMemberId = (seat: number, k = 0): string =>
  `00000000-0000-4000-a000-${String(k === 0 ? 100 + seat : 200 + seat * 10 + k).padStart(12, '0')}`;

/** Gracze na miejscach kartki przypadku: miejsce (od 1) → członkowie. */
export function caseSeats(c: PlayCase): Map<number, string[]> {
  return new Map(
    c.players.map((p) => [
      p.seat + 1,
      Array.from({ length: teamSize(c, p.seat) }, (_, k) => caseMemberId(p.seat, k)),
    ]),
  );
}
