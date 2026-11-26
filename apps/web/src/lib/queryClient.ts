import { QueryClient } from '@tanstack/query-core';
import { createContext } from 'solid-js';

/** Cache danych z Supabase. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  });
}

/** Wspólny cache zapytań aplikacji (`createQuery` w `lib/query.ts`, inwalidacje w akcjach). */
export const QueryClientContext = createContext<QueryClient>();
