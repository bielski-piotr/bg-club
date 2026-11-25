import { useAuth } from '../auth/authContext';
import { t } from '../i18n';
import { useAllProfiles } from '../react-shared/profiles';
import type { LeaderboardFilters } from './filters';
import { LEADERBOARD_KINDS, useLeaderboard, type LeaderboardKind } from './leaderboard';

export const kindTabs = LEADERBOARD_KINDS.map((id) => ({ id, label: t.leaderboard.tabs[id] }));

/**
 * Ranking z profilami do awatarów. Dane z cache'u mają pierwszeństwo przed błędem odświeżania;
 * błąd bez danych pokazuje banner z ponowieniem.
 */
export function useBoardData(kind: LeaderboardKind, filters: LeaderboardFilters) {
  const { client } = useAuth();
  const board = useLeaderboard(client, kind, filters);
  const profiles = useAllProfiles(client);
  const failed = (board.isError && !board.data) || (profiles.isError && !profiles.data);
  return {
    entries: board.data,
    profiles: profiles.data,
    failed,
    retry: () => {
      if (board.isError) void board.refetch();
      if (profiles.isError) void profiles.refetch();
    },
  };
}
