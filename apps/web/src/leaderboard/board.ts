import { useContext, type Accessor } from 'solid-js';
import { t } from '../i18n';
import { AuthContext } from '../solid/context';
import { createAllProfiles } from '../solid/profile/profiles';
import { createQuery } from '../solid/query';
import type { LeaderboardFilters } from './filters';
import { LEADERBOARD_KINDS, leaderboardQuery, type LeaderboardKind } from './leaderboard';

export const kindTabs = LEADERBOARD_KINDS.map((id) => ({ id, label: t.leaderboard.tabs[id] }));

/**
 * Ranking z profilami do awatarów. Dane z cache'u mają pierwszeństwo przed błędem odświeżania;
 * błąd bez danych pokazuje banner z ponowieniem.
 */
export function createBoardData(
  kind: Accessor<LeaderboardKind>,
  filters: Accessor<LeaderboardFilters>,
) {
  const auth = useContext(AuthContext);
  const board = createQuery(() => leaderboardQuery(auth.client, kind(), filters()));
  const profiles = createAllProfiles();
  return {
    entries: () => board().data,
    profiles: () => profiles().data,
    failed: () => (board().isError && !board().data) || (profiles().isError && !profiles().data),
    retry: () => {
      if (board().isError) void board().refetch();
      if (profiles().isError) void profiles().refetch();
    },
  };
}
