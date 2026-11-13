/**
 * Miejsca w partii (PRD §5.6.1, EDT-2…EDT-4, EDT-7).
 *
 * 1. Gracze są sortowani po kategorii decydującej w wybranym kierunku.
 * 2. Remisy rozstrzygają reguły po kolei; reguła k+1 dotyczy tylko graczy nadal zremisowanych
 *    po regułach 1…k (remisy w remisach).
 * 3. Gracze nadal zremisowani zajmują wspólne miejsce, kolejny gracz zajmuje pierwsze miejsce
 *    po nich (numeracja „1, 1, 3”).
 */
import type { Direction, LineValues, Ranking, ScoringTemplate } from './template';
import { FINAL_TOTAL, isNumeric } from './template';
import { computeTotals, finalTotalIndex } from './totals';

/**
 * Porównuje dwie wartości tak, że wynik ujemny oznacza lepszy wynik `a`. Puste pole (`null`)
 * jest zawsze gorsze od każdej liczby, niezależnie od kierunku; dwa puste pola remisują.
 */
export function compareByDirection(a: number | null, b: number | null, dir: Direction): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return dir === 'desc' ? b - a : a - b;
}

/**
 * Reguła miejsc notesu: jawna `template.ranking` albo, dla starszych plików, najwyższa suma
 * końcowa (EDT-7). Notes bez sumy `total` rozstrzyga sumą wszystkich punktacji i premii.
 */
export function rankingOf(t: ScoringTemplate): Ranking {
  if (t.ranking) return t.ranking;
  const final = t.lines[finalTotalIndex(t)];
  return { line: final ? final.id : FINAL_TOTAL, dir: 'desc', tiebreak: [] };
}

/** Wpisy jednego gracza: miejsce na kartce (0…n−1) i wartości punktacji. */
export interface PlayerEntry {
  readonly seat: number;
  readonly values: LineValues;
}

/** Wynik gracza z miejscem (część `players` zdarzenia z PAD-7). */
export interface RankedPlayer {
  readonly seat: number;
  readonly values: LineValues;
  /** Sumy, premie i `FINAL_TOTAL`. */
  readonly totals: Readonly<Record<string, number | null>>;
  /** Wartość kategorii decydującej (`play_results.ranking_value`). */
  readonly rankingValue: number | null;
  readonly place: number;
  readonly tied: boolean;
  /** Pozostali gracze na tym samym miejscu (numery miejsc na kartce). */
  readonly tiedWith: readonly number[];
}

/** Błąd reguły, której nie da się zastosować (np. kategoria spoza notesu). */
export class RankingError extends Error {
  override readonly name = 'RankingError';
}

type Criterion = { readonly line: string; readonly dir: Direction };

/**
 * Wyznacza miejsca graczy. Wynik jest w kolejności miejsc; gracze na wspólnym miejscu są
 * uporządkowani według numeru miejsca na kartce.
 */
export function rankPlayers(t: ScoringTemplate, players: readonly PlayerEntry[]): RankedPlayer[] {
  const ranking = rankingOf(t);
  const lines = new Map(t.lines.map((l) => [l.id, l]));
  const seats = new Set<number>();
  for (const p of players) {
    if (seats.has(p.seat))
      throw new RankingError(`Miejsce na kartce ${p.seat} występuje dwa razy.`);
    seats.add(p.seat);
  }

  const criterion = (line: string, dir: Direction): Criterion => {
    const ln = lines.get(line);
    if (line !== FINAL_TOTAL && !(ln && isNumeric(ln.kind)))
      throw new RankingError(`Kategoria „${line}” nie może decydować o miejscu.`);
    return { line, dir };
  };
  // Reguły po pierwszym „wspólnym miejscu” (albo „rozstrzyga prowadzący”) nie mają już działania.
  const criteria: Criterion[] = [criterion(ranking.line, ranking.dir)];
  for (const rule of ranking.tiebreak) {
    if (rule.type !== 'line') break;
    criteria.push(criterion(rule.line, rule.dir));
  }

  const scored = players.map((p) => {
    const totals = computeTotals(t, p.values);
    const value = (line: string): number | null => {
      if (line === FINAL_TOTAL || lines.get(line)?.kind !== 'input') return totals[line] ?? null;
      return p.values[line] ?? null;
    };
    return { player: p, totals, key: criteria.map((c) => value(c.line)) };
  });
  type Scored = (typeof scored)[number];

  const resolve = (group: Scored[], level: number): Scored[][] => {
    const c = criteria[level];
    if (group.length <= 1 || !c) return [group];
    const sorted = [...group].sort((a, b) =>
      compareByDirection(a.key[level] ?? null, b.key[level] ?? null, c.dir),
    );
    const runs: Scored[][] = [];
    for (const s of sorted) {
      const run = runs[runs.length - 1];
      const head = run?.[0];
      if (run && head && (head.key[level] ?? null) === (s.key[level] ?? null)) run.push(s);
      else runs.push([s]);
    }
    return runs.flatMap((run) => resolve(run, level + 1));
  };

  const out: RankedPlayer[] = [];
  let position = 0;
  for (const group of resolve(scored, 0)) {
    const place = position + 1;
    position += group.length;
    const groupSeats = group.map((s) => s.player.seat).sort((a, b) => a - b);
    for (const s of [...group].sort((a, b) => a.player.seat - b.player.seat))
      out.push({
        seat: s.player.seat,
        values: s.player.values,
        totals: s.totals,
        rankingValue: s.key[0] ?? null,
        place,
        tied: group.length > 1,
        tiedWith: groupSeats.filter((x) => x !== s.player.seat),
      });
  }
  return out;
}
