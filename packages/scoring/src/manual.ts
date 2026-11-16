import { rankingOf, RankingError, type RankedPlayer } from './ranking';
import type { ScoringTemplate } from './template';

/** Manual is terminal, like shared. Only its unresolved groups may be reordered. */
export function hasManualTiebreak(template: ScoringTemplate): boolean {
  return rankingOf(template).tiebreak.find((rule) => rule.type !== 'line')?.type === 'manual';
}

/** Groups use zero-based sheet seats, in their already established order. */
export function manualTieGroups(
  template: ScoringTemplate,
  ranked: readonly RankedPlayer[],
): number[][] {
  if (!hasManualTiebreak(template)) return [];
  return [...new Set(ranked.filter((r) => r.tied).map((r) => r.place))].map((place) =>
    ranked.filter((r) => r.place === place).map((r) => r.seat),
  );
}

/**
 * Ordered subgroups within each unresolved tie. Seats in one subgroup stay tied.
 * Every original group must be covered exactly once; crossing group boundaries fails.
 */
export function resolveManualTies(
  template: ScoringTemplate,
  ranked: readonly RankedPlayer[],
  decisions: readonly (readonly (readonly number[])[])[],
): RankedPlayer[] {
  const groups = manualTieGroups(template, ranked);
  if (decisions.length !== groups.length) throw new RankingError('Brak decyzji dla remisu.');
  const resolved = new Map<number, RankedPlayer>();
  groups.forEach((seats, index) => {
    const decision = decisions[index] ?? [];
    const flat = decision.flat();
    if (
      decision.some((part) => part.length === 0) ||
      flat.length !== seats.length ||
      new Set(flat).size !== seats.length ||
      flat.some((seat) => !seats.includes(seat))
    )
      throw new RankingError('Decyzja musi obejmować wyłącznie graczy tego remisu.');
    let place = ranked.find((r) => r.seat === seats[0])?.place ?? 1;
    for (const part of decision) {
      for (const seat of part) {
        const row = ranked.find((r) => r.seat === seat);
        if (!row) throw new RankingError('Brak gracza w remisie.');
        resolved.set(seat, {
          ...row,
          place,
          tied: part.length > 1,
          tiedWith: part.filter((s) => s !== seat),
        });
      }
      place += part.length;
    }
  });
  return ranked
    .map((row) => resolved.get(row.seat) ?? row)
    .sort((a, b) => a.place - b.place || a.seat - b.seat);
}
