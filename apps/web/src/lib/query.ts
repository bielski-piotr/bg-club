import {
  MutationObserver,
  QueryObserver,
  type DefaultError,
  type MutateOptions,
  type MutationObserverOptions,
  type MutationObserverResult,
  type QueryKey,
  type QueryObserverOptions,
  type QueryObserverResult,
} from '@tanstack/query-core';
import { createMemo, from, useContext, type Accessor } from 'solid-js';
import { QueryClientContext } from './queryClient';

/*
 * Zapytania na wspólnym `QueryClient` (cache, `staleTime`, prefetch, `invalidateQueries`).
 * `@tanstack/solid-query` 5.x wspiera tylko Solid 1.x, stąd własny cienki adapter.
 */

/**
 * Zapytanie jako akcesor wyniku `QueryObserver` (`status`, `data`, `isPending`, `isError`,
 * `refetch`…), tak jak `useQuery`. Opcje są akcesorem: `createQuery(() => gameQuery(client, props.id))`
 * – zmiana odczytanych w nim wartości przełącza obserwatora na nowe opcje (ten sam obserwator, więc
 * `placeholderData: keepPreviousData` działa). Wynik jest gotowy od razu (bez `<Loading>`):
 * wczytywanie i błąd to pola wyniku.
 */
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: Accessor<QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>>,
): Accessor<QueryObserverResult<TData, TError>> {
  const client = useContext(QueryClientContext);
  let observer: QueryObserver<TQueryFnData, TError, TData, TQueryFnData, TQueryKey> | undefined;
  return createMemo(() => {
    const resolved = client.defaultQueryOptions(options());
    return from<QueryObserverResult<TData, TError>>((next) => {
      if (observer) observer.setOptions(resolved);
      else observer = new QueryObserver(client, resolved);
      // Wartość podana w trakcie subskrypcji jest od razu wynikiem memo (bez stanu „nie gotowe”).
      next(observer.getOptimisticResult(resolved));
      return observer.subscribe(next);
    });
  });
}

export interface MutationApi<TData, TError, TVariables, TOnMutateResult> {
  /** Stan mutacji (`isPending`, `isError`, `data`…), jak wynik `useMutation`. */
  readonly state: Accessor<MutationObserverResult<TData, TError, TVariables, TOnMutateResult>>;
  /** Uruchamia mutację; błąd trafia do `state` i `onError`, nie do wywołującego. */
  readonly mutate: (
    variables: TVariables,
    options?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
  ) => void;
  readonly mutateAsync: (
    variables: TVariables,
    options?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
  ) => Promise<TData>;
  readonly reset: () => void;
}

/**
 * Mutacja na wspólnym `QueryClient` (`MutationObserver`), jak `useMutation`. Opcje są stałe:
 * wartości z propsów czytaj wewnątrz `mutationFn` i callbacków, nie przy tworzeniu.
 */
export function createMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: MutationObserverOptions<TData, TError, TVariables, TOnMutateResult>,
): MutationApi<TData, TError, TVariables, TOnMutateResult> {
  const client = useContext(QueryClientContext);
  const observer = new MutationObserver(client, options);
  const state = createMemo(() =>
    from<MutationObserverResult<TData, TError, TVariables, TOnMutateResult>>((next) => {
      next(observer.getCurrentResult());
      return observer.subscribe(next);
    }),
  );
  return {
    state,
    mutate: (variables, mutateOptions) => {
      observer.mutate(variables, mutateOptions).catch(() => undefined);
    },
    mutateAsync: (variables, mutateOptions) => observer.mutate(variables, mutateOptions),
    reset: () => observer.reset(),
  };
}
