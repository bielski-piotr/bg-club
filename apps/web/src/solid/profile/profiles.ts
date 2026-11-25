import { useContext, type Accessor } from 'solid-js';
import {
  allProfilesQuery,
  avatarUrlQuery,
  membersQuery,
  profileQuery,
} from '../../profile/profileQueries';
import { AuthContext } from '../context';
import { createQuery } from '../query';

/*
 * Profile graczy w Solid: te same zapytania co hooki React (`profile/profiles.ts`) na wspólnym
 * cache. Klient Supabase z `AuthContext`; parametry jako akcesory.
 */

/** Aktywni członkowie klubu (`membersQuery`). */
export function createMembers() {
  const auth = useContext(AuthContext);
  return createQuery(() => membersQuery(auth.client));
}

/** Profil dowolnego gracza, także usuniętego (`profileQuery`). */
export function createProfile(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => profileQuery(auth.client, id()));
}

/** Wszystkie profile klubu, także usunięte (`allProfilesQuery`). */
export function createAllProfiles() {
  const auth = useContext(AuthContext);
  return createQuery(() => allProfilesQuery(auth.client));
}

/** Adres zdjęcia profilowego (`avatarUrlQuery`); `null` = bez zapytania. */
export function createAvatarUrl(path: Accessor<string | null>) {
  const auth = useContext(AuthContext);
  return createQuery(() => avatarUrlQuery(auth.client, path()));
}
