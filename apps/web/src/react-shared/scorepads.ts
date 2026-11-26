import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { activeScorepadsQuery } from '../score-pad/scorepads';

/*
 * Hook React notesów dla kreatora partii (spotkania w React do etapu 6 migracji na Solid,
 * docs/solidjs-2-migration.md); opcje zapytań są w `score-pad/scorepads.ts`.
 */

/** Aktywne notesy wszystkich gier (`activeScorepadsQuery`). */
export function useActiveScorepads(client: SupabaseClient) {
  return useQuery(activeScorepadsQuery(client));
}
