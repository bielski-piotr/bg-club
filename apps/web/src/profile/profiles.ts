import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { signedUrlQuery } from '../lib/storage';
import { isUuid } from '../popups/routes';
import type { AvatarPerson } from '../ui';

/** Profil gracza widoczny dla członków klubu (PRD §5.2, RLS: odczyt dla aktywnych kont). */
export interface Profile {
  readonly id: string;
  readonly hook: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly role: 'admin' | 'player';
  /** Zdjęcie w buckecie `avatars` (`<id>/<plik>`, USR-3); `null` = monogram (USR-2). */
  readonly avatar_path: string | null;
  /** Usunięty członek (MEM-4, MEM-5); `null` = aktywny. */
  readonly deleted_at: string | null;
}

export const PROFILE_COLUMNS = 'id, hook, first_name, last_name, role, avatar_path, deleted_at';

/** Bucket ze zdjęciami profilowymi (prywatny, zapis: właściciel folderu `<id>/`). */
export const AVATARS_BUCKET = 'avatars';

/** Korzeń kluczy profili: profile członków, listy i (E5/E6) statystyki. */
export const profilesKey = ['profiles'] as const;
export const profileKey = (id: string) => ['profiles', 'byId', id] as const;

/** Klucz własnego profilu zalogowanego (`ownProfileKey`): rola i ustawienia, nie statystyki. */
export function isOwnProfileKey(key: readonly unknown[]): boolean {
  return key[0] === profilesKey[0] && key[1] === 'own';
}
export const membersKey = ['profiles', 'members'] as const;

export function fullName(profile: Pick<Profile, 'first_name' | 'last_name'>): string {
  return `${profile.first_name} ${profile.last_name}`;
}

/** Kolejność osób na listach: imię i nazwisko po polsku, remis rozstrzyga `id`. */
export function compareProfiles(
  a: Pick<Profile, 'id' | 'first_name' | 'last_name'>,
  b: Pick<Profile, 'id' | 'first_name' | 'last_name'>,
): number {
  return fullName(a).localeCompare(fullName(b), 'pl') || a.id.localeCompare(b.id);
}

/**
 * Dane awatara (DS §8). Kolor monogramu wynika deterministycznie z hooka (USR-2): hook jest
 * niezmienny, więc kolor nie zmienia się po zmianie imienia i jest ten sam na każdym urządzeniu.
 * `src` to adres zdjęcia (`useAvatarUrl`); bez niego monogram.
 */
export function avatarPerson(
  profile: Pick<Profile, 'hook' | 'first_name' | 'last_name' | 'deleted_at'>,
  src?: string,
): AvatarPerson {
  return { id: profile.hook, name: fullName(profile), removed: profile.deleted_at !== null, src };
}

/**
 * Adres zdjęcia profilowego z prywatnego bucketu (USR-3). Każde wgranie ma nową nazwę pliku,
 * więc adres z cache'u nigdy nie pokaże starego zdjęcia. Bez ścieżki: brak zapytania.
 */
export function useAvatarUrl(client: SupabaseClient, path: string | null) {
  return useQuery(signedUrlQuery(client, AVATARS_BUCKET, path));
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

export const allProfilesKey = ['profiles', 'all'] as const;

/**
 * Wszystkie profile klubu, także usunięte (MEM-5: usunięty zostaje w historii, np. jako
 * zwycięzca spotkania w timeline albo uczestnik w kalendarzu), po `id`.
 */
export function useAllProfiles(client: SupabaseClient) {
  return useQuery({
    queryKey: allProfilesKey,
    queryFn: async (): Promise<ReadonlyMap<string, Profile>> => {
      const { data, error } = await client.from('profiles').select(PROFILE_COLUMNS);
      if (error) throw error;
      return new Map((data as Profile[]).map((profile) => [profile.id, profile]));
    },
  });
}
