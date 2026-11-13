/**
 * Edge Function `create-member`: administrator dodaje członka klubu (PRD MEM-3, AUTH-2,
 * AUTH-4). Konto Auth z technicznym e-mailem i `app_metadata.bg_club`; profil zakłada wyzwalacz
 * w bazie w tej samej transakcji (migracja `20261113000500_accounts_and_login.sql`).
 *
 * Klucz service role jest tylko tutaj (PRD §6.1). Logika żądania: `handler.ts`.
 */
import { accountStore, serviceClient } from '../_shared/supabase.ts';
import { handleCreateMember } from './handler.ts';

const service = serviceClient();
const store = accountStore(service);

Deno.serve((request) =>
  handleCreateMember(request, {
    authenticate: (token) => store.authenticate(token),
    isActiveAdmin: async (userId) => {
      const profile = await store.findProfile(userId);
      return profile !== null && profile.role === 'admin' && !profile.deleted;
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
          // Hasło jest wygenerowane: przy pierwszym logowaniu aplikacja proponuje zmianę (AUTH-6).
          app_metadata: {
            bg_club: {
              first_name: firstName,
              last_name: lastName,
              role: 'player',
              password_generated: true,
            },
          },
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
