import { useContext, type Accessor } from 'solid-js';
import { AuthContext } from '../auth/authContext';
import { createQuery } from '../lib/query';
import {
  allExpansionsQuery,
  collectionWidgetQuery,
  expansionsQuery,
  gameQuery,
  gameSearchQuery,
  gameTitlesQuery,
} from './games';
import { gameStatsQuery } from './gameStatsData';
import { gameVoteTotalQuery } from './gameVoteTotal';

/*
 * Zapytania o gry: opcje z `games.ts` na wspólnym cache
 * zapytań. Klient Supabase z `AuthContext`; parametry jako akcesory.
 */

/** Widżet kolekcji (`collectionWidgetQuery`). */
export function createCollectionWidget() {
  const auth = useContext(AuthContext);
  return createQuery(() => collectionWidgetQuery(auth.client));
}

/** Wyszukiwanie w kolekcji (`gameSearchQuery`); `enabled` = czy pobierać. */
export function createGameSearch(query: Accessor<string>, enabled: Accessor<boolean> = () => true) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameSearchQuery(auth.client, query(), enabled()));
}

/** Aktywna gra (`gameQuery`); `null` = nie ma takiej gry albo została usunięta. */
export function createGame(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameQuery(auth.client, id()));
}

/** Aktywne dodatki gry podstawowej (`expansionsQuery`). */
export function createExpansions(baseId: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => expansionsQuery(auth.client, baseId()));
}

/** Wszystkie aktywne dodatki (`allExpansionsQuery`); `enabled` = czy pobierać. */
export function createAllExpansions(enabled: Accessor<boolean> = () => true) {
  const auth = useContext(AuthContext);
  return createQuery(() => allExpansionsQuery(auth.client, enabled()));
}

/** Tytuły gier i dodatków po id (`gameTitlesQuery`). */
export function createGameTitlesById(ids: Accessor<readonly string[]>) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameTitlesQuery(auth.client, ids()));
}

/** Statystyki gry (`gameStatsQuery`). */
export function createGameStats(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameStatsQuery(auth.client, id()));
}

/** Suma głosów na grę (`gameVoteTotalQuery`). */
export function createGameVoteTotal(id: Accessor<string>) {
  const auth = useContext(AuthContext);
  return createQuery(() => gameVoteTotalQuery(auth.client, id()));
}
