import { useContext, type Accessor } from 'solid-js';
import { allProfilesQuery, avatarUrlQuery, membersQuery, profileQuery } from './profileQueries';
import { AuthContext } from '../auth/authContext';
import { createQuery, ifEnabled } from '../lib/query';

/*
 * Profile graczy: zapytania z `profileQueries.ts` na wspólnym cache. Akcesory danych czekają pod
 * `<Loading>` (`createQuery`); parametry jako akcesory.
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
  return createQuery(() => ifEnabled(avatarUrlQuery(auth.client, path())));
}
