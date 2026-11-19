import { format, plural, t } from '../i18n';

/** Liczba graczy gry: „2–4 graczy” albo „2 graczy” przy min = max. */
export function playersLabel(game: {
  readonly min_players: number;
  readonly max_players: number;
}): string {
  if (game.min_players === game.max_players) {
    return plural(game.min_players, t.games.playersExact);
  }
  return format(t.games.players, { min: game.min_players, max: game.max_players });
}
