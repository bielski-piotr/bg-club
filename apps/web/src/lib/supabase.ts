import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/env';

let client: SupabaseClient | undefined;

/**
 * Jeden klient Supabase na aplikację. Tworzony dopiero po walidacji konfiguracji,
 * żeby brak zmiennych pokazał czytelny komunikat zamiast wyjątku.
 */
export function getSupabase(config: AppConfig): SupabaseClient {
  client ??= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
