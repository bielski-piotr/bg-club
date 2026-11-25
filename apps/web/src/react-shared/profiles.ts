import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import {
  allProfilesQuery,
  avatarUrlQuery,
  membersQuery,
  profileQuery,
} from '../profile/profileQueries';

/*
 * Hooki React profili dla obszarów jeszcze w React (do etapu 8 migracji na Solid,
 * docs/solidjs-2-migration.md). Typy, klucze i zapytania są w `profile/profileQueries.ts` (bez
 * frameworka, wspólne z kodem Solid); ten moduł je re-eksportuje.
 */
export * from '../profile/profileQueries';

/** Adres zdjęcia profilowego (`avatarUrlQuery`). */
export function useAvatarUrl(client: SupabaseClient, path: string | null) {
  return useQuery(avatarUrlQuery(client, path));
}

/** Profil dowolnego gracza, także usuniętego (`profileQuery`). */
export function useProfile(client: SupabaseClient, id: string) {
  return useQuery(profileQuery(client, id));
}

/** Aktywni członkowie klubu (`membersQuery`). */
export function useMembers(client: SupabaseClient) {
  return useQuery(membersQuery(client));
}

/** Wszystkie profile klubu, także usunięte (`allProfilesQuery`). */
export function useAllProfiles(client: SupabaseClient) {
  return useQuery(allProfilesQuery(client));
}
