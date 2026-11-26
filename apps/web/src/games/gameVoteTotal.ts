import type { SupabaseClient } from '@supabase/supabase-js';
import { meetingsKey } from '../meetings/meetings';
import { isUuid } from '../popups/routes';

/** Edycja uczestników, publikacja i usunięcie spotkania odświeżają też sumy głosów. */
export const gameVoteTotalsKey = [...meetingsKey, 'game-vote-totals'] as const;
export const gameVoteTotalKey = (id: string) => [...gameVoteTotalsKey, id] as const;

export function gameVoteTotalQuery(client: SupabaseClient, id: string) {
  return {
    queryKey: gameVoteTotalKey(id),
    // Ponowne otwarcie szczegółów pobiera też zmiany z innych sesji.
    staleTime: 0,
    queryFn: async (): Promise<number | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client.rpc('game_vote_total', { game_id: id });
      if (error) throw error;
      return data as number | null;
    },
  };
}
