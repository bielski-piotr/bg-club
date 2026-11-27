import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaderboardFilters } from '../leaderboard/filters';
import { isUuid } from '../popups/routes';
import { profilesKey } from './profileQueries';
import { filterArgs, filtersKey } from './playerStatsData';

/**
 * Meeting with the player's saved plays from `player_meetings(profile_id, date_from, date_to,
 * game_ids)`: plays, wins and points count only plays of the filtered games.
 */
export interface PlayerMeeting {
  readonly meeting_id: string;
  readonly title: string;
  readonly starts_at: string;
  readonly plays: number;
  readonly wins: number;
  readonly points: number;
}

/** In `profilesKey`, so saving and deleting a play refresh it with the stats. */
export const playerMeetingsKey = (id: string, filters: LeaderboardFilters) =>
  [...profilesKey, 'meetings', id, ...filtersKey(filters)] as const;

/** The player's meetings, newest first (query options). */
export function playerMeetingsQuery(
  client: SupabaseClient,
  id: string,
  filters: LeaderboardFilters,
) {
  return {
    queryKey: playerMeetingsKey(id, filters),
    queryFn: async (): Promise<readonly PlayerMeeting[]> => {
      if (!isUuid(id)) return [];
      const { data, error } = await client.rpc('player_meetings', {
        profile_id: id,
        ...filterArgs(filters),
      });
      if (error) throw error;
      return (data ?? []) as PlayerMeeting[];
    },
    // A filter change keeps the previous list on screen until the new one arrives.
    placeholderData: (
      previous: readonly PlayerMeeting[] | undefined,
      query: { readonly queryKey: readonly unknown[] } | undefined,
    ) => (query?.queryKey[2] === id ? previous : undefined),
  };
}
