import { useContext, type Accessor } from 'solid-js';
import { clubQuery, COVERS_BUCKET } from './club';
import { signedUrlQuery } from '../lib/storage';
import { AuthContext } from '../auth/authContext';
import { createQuery, ifEnabled } from '../lib/query';

/** Klub albo `null`, gdy nie został jeszcze założony. */
export function createClub() {
  const auth = useContext(AuthContext);
  return createQuery(() => clubQuery(auth.client));
}

/** Adres pliku z prywatnego bucketu `covers` (okładki, logo); `null` = bez zapytania. */
export function createCoverUrl(path: Accessor<string | null>) {
  const auth = useContext(AuthContext);
  return createQuery(() => ifEnabled(signedUrlQuery(auth.client, COVERS_BUCKET, path())));
}
