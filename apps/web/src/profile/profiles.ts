import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { isUuid } from '../popups/routes';
import type { AvatarPerson } from '../ui';

/** Profil gracza widoczny dla członków klubu (PRD §5.2, RLS: odczyt dla aktywnych kont). */
export interface Profile {
  readonly id: string;
  readonly hook: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly role: 'admin' | 'player';
  /** Usunięty członek (MEM-4, MEM-5); `null` = aktywny. */
  readonly deleted_at: string | null;
}

const PROFILE_COLUMNS = 'id, hook, first_name, last_name, role, deleted_at';

export const profileKey = (id: string) => ['profiles', 'byId', id] as const;
export const membersKey = ['profiles', 'members'] as const;

export function fullName(profile: Pick<Profile, 'first_name' | 'last_name'>): string {
  return `${profile.first_name} ${profile.last_name}`;
}

/** Dane awatara (DS §8). Kolor monogramu zależy od id, jak w całej aplikacji. */
export function avatarPerson(profile: Profile): AvatarPerson {
  return { id: profile.id, name: fullName(profile), removed: profile.deleted_at !== null };
}

/**
 * Profil dowolnego gracza, także usuniętego (MEM-5). `null` = nie ma takiego profilu albo
 * identyfikator nie jest poprawnym uuid (wtedy bez zapytania).
 */
export function useProfile(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: profileKey(id),
    queryFn: async (): Promise<Profile | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', id)
        .maybeSingle<Profile>();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Aktywni członkowie klubu (MEM-1, MEM-2, MEM-5: bez usuniętych), alfabetycznie.
 * Kolejność ustala zapytanie, a remisy rozstrzyga `id`, więc lista jest stabilna.
 */
export function useMembers(client: SupabaseClient) {
  return useQuery({
    queryKey: membersKey,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await client
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .is('deleted_at', null)
        .order('first_name')
        .order('last_name')
        .order('id');
      if (error) throw error;
      return data as Profile[];
    },
  });
}
