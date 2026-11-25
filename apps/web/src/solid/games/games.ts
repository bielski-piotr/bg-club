import { useContext, type Accessor } from 'solid-js';
import { gameSearchQuery } from '../../games/games';
import { AuthContext } from '../context';
import { createQuery } from '../query';

/** Wyszukiwanie w kolekcji (`gameSearchQuery`); `enabled` = czy pobierać. */
export function createGameSearch(query: Accessor<string>, enabled: Accessor<boolean> = () => true) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameSearchQuery(auth.client, query(), enabled()));
}
