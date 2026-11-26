import { useContext, type Accessor } from 'solid-js';
import { signedUrlQuery } from '../lib/storage';
import { AuthContext } from '../solid/context';
import { createQuery } from '../solid/query';
import {
  activeScorepadsQuery,
  gameScorepadsQuery,
  scorepadQuery,
  scorepadTemplateQuery,
  SCOREPADS_BUCKET,
  type Scorepad,
} from './scorepads';

/*
 * Zapytania o notesy w Solid: te same opcje co w React na wspólnym cache. Parametry jako
 * akcesory.
 */

/** Aktywne notesy gry (`gameScorepadsQuery`). */
export function createGameScorepads(gameId: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameScorepadsQuery(auth.client, gameId()));
}

/** Aktywne notesy wszystkich gier (`activeScorepadsQuery`). */
export function createActiveScorepads() {
  const auth = useContext(AuthContext);
  return createQuery(() => activeScorepadsQuery(auth.client));
}

/** Aktywny notes (`scorepadQuery`); `null` = nie ma go albo został usunięty. */
export function createScorepad(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => scorepadQuery(auth.client, id()));
}

/** Szablon aktualnej wersji notesu ze zdjęciem (`scorepadTemplateQuery`). */
export function createScorepadTemplate(pad: Accessor<Scorepad | null | undefined>) {
  const auth = useContext(AuthContext);
  return createQuery(() => scorepadTemplateQuery(auth.client, pad()));
}

/** Podpisany adres pliku z bucketu notesów; `null` = bez zapytania. */
export function createScorepadFileUrl(path: Accessor<string | null>, retry = true) {
  const auth = useContext(AuthContext);
  return createQuery(() => ({
    ...signedUrlQuery(auth.client, SCOREPADS_BUCKET, path()),
    ...(retry ? {} : { retry: false, retryOnMount: false }),
  }));
}
