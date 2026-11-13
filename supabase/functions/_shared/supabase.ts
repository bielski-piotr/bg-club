/**
 * Klient Supabase z kluczem service role i implementacja {@link AccountStore} dla funkcji
 * usuwających konta. Tylko dla `index.ts` funkcji (Deno, supabase-js); logika żądań jest
 * w `handler.ts` i nie zależy od tego modułu.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import type { AccountProfile, AccountStore } from './accountDeletion.ts';

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Brak zmiennej środowiskowej ${name}`);
  return value;
}

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/** Klient z kluczem service role (omija RLS). Klucz nie opuszcza funkcji (PRD §6.1). */
export function serviceClient(): SupabaseClient {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    CLIENT_OPTIONS,
  );
}

/** Klient z kluczem anon, np. do sprawdzenia hasła logowaniem (bez zapamiętywania sesji). */
export function anonClient(): SupabaseClient {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_ANON_KEY'),
    CLIENT_OPTIONS,
  );
}

export function accountStore(service: SupabaseClient): AccountStore {
  return {
    authenticate: async (token) => {
      const { data, error } = await service.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    findProfile: async (id): Promise<AccountProfile | null> => {
      const { data, error } = await service
        .from('profiles')
        .select('id, hook, role, deleted_at')
        .eq('id', id)
        .maybeSingle<{
          id: string;
          hook: string;
          role: 'admin' | 'player';
          deleted_at: string | null;
        }>();
      if (error) throw new Error(`profiles: ${error.message}`);
      return data
        ? { id: data.id, hook: data.hook, role: data.role, deleted: data.deleted_at !== null }
        : null;
    },
    softDeleteProfile: async (id) => {
      // Warunki w zapytaniu: równoległe usunięcie nie nadpisze daty, a profil admina zostaje.
      const { error } = await service
        .from('profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('role', 'player')
        .is('deleted_at', null);
      if (error) throw new Error(`profiles: ${error.message}`);
    },
    deleteAuthUser: async (id) => {
      const { error } = await service.auth.admin.deleteUser(id, true);
      // Konto usunięte wcześniej (np. ponowienie po błędzie) Auth zgłasza jako nieznane.
      if (error && error.code !== 'user_not_found') throw new Error(`auth: ${error.message}`);
    },
  };
}
