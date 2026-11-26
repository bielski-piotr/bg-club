import {
  QueryObserver,
  type DefaultError,
  type QueryKey,
  type QueryObserverOptions,
  type QueryObserverResult,
} from '@tanstack/query-core';
import { createMemo, createSignal, onCleanup, useContext, type Accessor } from 'solid-js';
import { QueryClientContext } from './queryClient';

/*
 * Zapytania na wspólnym `QueryClient` (cache, `staleTime`, prefetch, `invalidateQueries`).
 * `@tanstack/solid-query` 5.x wspiera tylko Solid 1.x, stąd własny cienki adapter.
 */

type Options<TQueryFnData, TError, TData, TQueryKey extends QueryKey> = QueryObserverOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryFnData,
  TQueryKey
>;

export interface AsyncQuery<TData, TError = DefaultError> extends Accessor<TData> {
  /** Ponowne pobranie (np. „Spróbuj ponownie” w `<Errored>`); wynik pojawia się w akcesorze. */
  readonly refetch: () => Promise<unknown>;
  /** Surowy wynik obserwatora (np. `isFetching`, `isPlaceholderData`); nie czeka na dane. */
  readonly state: Accessor<QueryObserverResult<TData, TError> | undefined>;
  /**
   * Dane z cache bez czekania (`undefined` w trakcie pierwszego wczytania): dla nagłówków okien
   * (tytuł, licznik), które są widoczne, zanim treść pod `<Loading>` będzie gotowa.
   */
  readonly current: Accessor<TData | undefined>;
}

/**
 * Zapytanie jako async memo Solid 2.0 na wspólnym cache `query-core`. Bez danych w cache akcesor
 * jest w toku (`<Loading>` pokazuje zastępnik), błąd bez danych trafia do `<Errored>`, a zmiana
 * klucza bez danych w cache to zmiana w toku: na ekranie zostaje poprzednia wartość,
 * `isPending(() => query())` jest prawdą. Dane z cache (także po `setQueryData`, po
 * inwalidacji i ponownym pobraniu w tle) pojawiają się od razu. Opcje `null` = brak zapytania
 * (akcesor zwraca `undefined`).
 */
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: Accessor<Options<TQueryFnData, TError, TData, TQueryKey>>): AsyncQuery<TData, TError>;
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: Accessor<Options<TQueryFnData, TError, TData, TQueryKey> | null>,
): AsyncQuery<TData | undefined, TError>;
export function createQuery<TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
  options: Accessor<Options<TQueryFnData, TError, TData, TQueryKey> | null>,
): AsyncQuery<TData | undefined, TError> {
  const client = useContext(QueryClientContext);
  type Observer = QueryObserver<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>;
  let observer: Observer | undefined;
  let unsubscribe: (() => void) | undefined;
  /** Każde powiadomienie obserwatora (dane, błąd, stan pobierania) przelicza akcesor. */
  const [version, setVersion] = createSignal(0);
  /**
   * `setOptions` powiadamia słuchaczy synchronicznie; w trakcie obliczenia wynik i tak czytamy
   * od nowa (`getOptimisticResult`), więc to powiadomienie pomijamy (bez zapisu w obliczeniu).
   */
  let computing = false;
  onCleanup(() => unsubscribe?.());

  /** Opcje po domyślnych ustawieniach klienta; obserwator przełącza się tylko przy ich zmianie. */
  const resolved = createMemo(() => {
    const input = options();
    if (!input) {
      // Bez zapytania obserwator nie trzyma poprzedniego (np. kilkumegabajtowego zdjęcia notesu):
      // `gcTime` może je zwolnić. Kolejne opcje tworzą nowego obserwatora.
      unsubscribe?.();
      unsubscribe = undefined;
      observer = undefined;
      return null;
    }
    const next = client.defaultQueryOptions(input);
    computing = true;
    try {
      if (observer) observer.setOptions(next);
      else {
        observer = new QueryObserver(client, next);
        unsubscribe = observer.subscribe(() => {
          if (!computing) setVersion((n) => n + 1);
        });
      }
    } finally {
      computing = false;
    }
    return next;
  });

  /**
   * Wynik obserwatora. Po zmianie opcji wynik „optymistyczny” (zapytanie bez danych jest od razu
   * w toku), po powiadomieniu bieżący wynik obserwatora, bez ponownego ustawiania opcji.
   */
  let lastResolved: unknown;
  const state = createMemo(() => {
    version();
    const current = resolved();
    if (!current || !observer) return undefined;
    const fresh = current !== lastResolved;
    lastResolved = current;
    return {
      result: fresh ? observer.getOptimisticResult(current) : observer.getCurrentResult(),
      resolved: current,
    };
  });

  const data = createMemo(() => {
    const current = state();
    if (!current) return undefined;
    const { result, resolved } = current;
    if (result.data !== undefined) return result.data;
    if (result.isError && result.fetchStatus !== 'fetching') throw result.error;
    // Wyłączone zapytanie bez danych nic nie pobiera.
    if (resolved.enabled === false) return undefined;
    const active = observer as Observer;
    return active.fetchOptimistic(resolved).then((fresh) => fresh.data as TData);
  });

  type Query = AsyncQuery<TData | undefined, TError>;
  const query = data as unknown as { -readonly [K in keyof Query]: Query[K] };
  query.refetch = () => observer?.refetch() ?? Promise.resolve();
  query.state = createMemo(() => state()?.result);
  query.current = createMemo(() => state()?.result.data);
  return query as unknown as Query;
}

/**
 * Opcje zapytania albo `null`, gdy zapytanie jest wyłączone (`enabled: false`, np. brak ścieżki
 * pliku): `createQuery` zwraca wtedy `undefined` zamiast czekać na dane.
 */
export function ifEnabled<T extends { readonly enabled?: unknown }>(options: T): T | null {
  return options.enabled === false ? null : options;
}
