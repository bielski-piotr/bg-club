import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { PROFILE_COLUMNS, type Profile } from '../react-shared/profiles';
import type { ThemePreference } from '../theme/theme';

/** Profil zalogowanego użytkownika (PRD §5.2) z ustawieniami widocznymi tylko dla niego. */
export interface OwnProfile extends Profile {
  /** Motyw zapisany w profilu (USR-8); `localStorage` jest tylko podręczną kopią. */
  readonly theme: ThemePreference;
  /** Konto ma jeszcze wygenerowane hasło: proponujemy jego zmianę (AUTH-6). */
  readonly password_change_suggested: boolean;
}

export const ownProfileKey = (userId: string) => ['profiles', 'own', userId] as const;

export const OWN_PROFILE_COLUMNS = `${PROFILE_COLUMNS}, theme, password_change_suggested`;

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
        .select(OWN_PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle<OwnProfile>();
      if (error) throw error;
      return data;
    },
  });
}
