import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';

/** Jedyny klub instancji (PRD §1.1, CLUB-2). Zakładanie klubu: zadanie [008]. */
export interface Club {
  readonly name: string;
  readonly logo_path: string | null;
}

export const clubKey = ['club'] as const;

/** Klub albo `null`, gdy nie został jeszcze założony. */
export function useClub(client: SupabaseClient) {
  return useQuery({
    queryKey: clubKey,
    queryFn: async (): Promise<Club | null> => {
      const { data, error } = await client
        .from('club')
        .select('name, logo_path')
        .maybeSingle<Club>();
      if (error) throw error;
      return data;
    },
  });
}
