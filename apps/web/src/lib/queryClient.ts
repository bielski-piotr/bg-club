import { QueryClient } from '@tanstack/react-query';

/** Cache danych z Supabase (PRD §8.1, Q13). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  });
}
