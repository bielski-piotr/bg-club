/**
 * Edge Function `delete-own-account`: gracz usuwa własne konto po potwierdzeniu hasłem
 * (PRD USR-6, MEM-6). Profil zostaje w historii (miękkie usunięcie), konto Auth jest usuwane
 * miękko (`_shared/accountDeletion.ts`). Klucz service role jest tylko tutaj (PRD §6.1).
 * Logika żądania: `handler.ts`.
 */
import { hookToEmail } from '../../../packages/accounts/src/index.ts';
import { accountStore, anonClient, serviceClient } from '../_shared/supabase.ts';
import { handleDeleteOwnAccount, type PasswordCheck } from './handler.ts';

const store = accountStore(serviceClient());

Deno.serve((request) =>
  handleDeleteOwnAccount(request, {
    store,
    verifyPassword: async (hook, password): Promise<PasswordCheck> => {
      // Osobny klient na każde sprawdzenie: sesja z logowania nie jest nigdzie zapamiętywana,
      // a i tak przestaje działać, gdy konto zostanie usunięte.
      const { error } = await anonClient().auth.signInWithPassword({
        email: hookToEmail(hook),
        password,
      });
      if (!error) return 'ok';
      if (error.code === 'invalid_credentials') return 'wrong';
      if (error.status === 429) return 'rate_limited';
      throw new Error(`auth: ${error.code ?? error.status ?? 'sign-in failed'}`);
    },
    log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
  }),
);
