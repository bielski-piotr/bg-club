import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';

/** Profil zalogowanego użytkownika (PRD §5.2). */
export interface OwnProfile {
  readonly id: string;
  readonly hook: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly role: 'admin' | 'player';
  readonly avatar_path: string | null;
}

export const ownProfileKey = (userId: string) => ['profiles', 'own', userId] as const;

/**
 * Własny profil. `null` oznacza, że RLS go nie zwrócił: konto zostało usunięte (albo nie ma
 * profilu), a token dostępu jest jeszcze ważny (AUTH-7). Aplikacja kończy wtedy sesję.
 */
export function useOwnProfile(client: SupabaseClient, userId: string) {
  return useQuery({
    queryKey: ownProfileKey(userId),
    queryFn: async (): Promise<OwnProfile | null> => {
      const { data, error } = await client
        .from('profiles')
        .select('id, hook, first_name, last_name, role, avatar_path')
        .eq('id', userId)
        .maybeSingle<OwnProfile>();
      if (error) throw error;
      return data;
    },
  });
}
