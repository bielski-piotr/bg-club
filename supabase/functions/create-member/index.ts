/**
 * Edge Function `create-member`: administrator dodaje członka klubu (PRD MEM-3, AUTH-2,
 * AUTH-4). Konto Auth z technicznym e-mailem i `app_metadata.bg_club`; profil zakłada wyzwalacz
 * w bazie w tej samej transakcji (migracja `20261113000500_accounts_and_login.sql`).
 *
 * Klucz service role jest tylko tutaj (PRD §6.1). Logika żądania: `handler.ts`.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { handleCreateMember } from './handler.ts';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Brak zmiennej środowiskowej ${name}`);
  return value;
}

const service = createClient(
  requiredEnv('SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  },
);

Deno.serve((request) =>
  handleCreateMember(request, {
    authenticate: async (token) => {
      const { data, error } = await service.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    isActiveAdmin: async (userId) => {
      const { data, error } = await service
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .eq('role', 'admin')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(`profiles: ${error.message}`);
      return data !== null;
    },
    accounts: {
      // Także profile usuniętych członków: ich hook zostaje w historii i nie wraca do puli.
      hookTaken: async (hook) => {
        const { data, error } = await service
          .from('profiles')
          .select('id')
          .eq('hook', hook)
          .maybeSingle();
        if (error) throw new Error(`profiles: ${error.message}`);
        return data !== null;
      },
      createAccount: async ({ email, password, firstName, lastName }) => {
        const { data, error } = await service.auth.admin.createUser({
          email,
          password,
          // Techniczny adres nie przyjmuje poczty; konto jest od razu potwierdzone.
          email_confirm: true,
          app_metadata: { bg_club: { first_name: firstName, last_name: lastName, role: 'player' } },
        });
        if (error || !data.user) {
          return {
            ok: false,
            emailTaken: error?.code === 'email_exists',
            message: error?.message ?? 'no user returned',
          };
        }
        return { ok: true, userId: data.user.id };
      },
    },
    log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
  }),
);
