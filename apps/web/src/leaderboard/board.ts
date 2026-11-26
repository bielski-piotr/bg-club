import { useContext, type Accessor } from 'solid-js';
import { t } from '../i18n';
import { AuthContext } from '../auth/authContext';
import { createAllProfiles } from '../profile/profiles';
import { createQuery } from '../lib/query';
import type { LeaderboardFilters } from './filters';
import { LEADERBOARD_KINDS, leaderboardQuery, type LeaderboardKind } from './leaderboard';

export const kindTabs = LEADERBOARD_KINDS.map((id) => ({ id, label: t.leaderboard.tabs[id] }));

/**
 * Ranking z profilami do awatarów. Akcesory czekają na dane pod `BoardBoundary` (błąd bez danych
 * trafia do jej banera z ponowieniem); `.current()` to dane z cache bez czekania (licznik, linki
 * w nagłówku). Dane z cache'u mają pierwszeństwo przed błędem odświeżania.
 */
export function createBoardData(
  kind: Accessor<LeaderboardKind>,
  filters: Accessor<LeaderboardFilters>,
) {
  const auth = useContext(AuthContext);
  return {
    entries: createQuery(() => leaderboardQuery(auth.client, kind(), filters())),
    profiles: createAllProfiles(),
  };
}
