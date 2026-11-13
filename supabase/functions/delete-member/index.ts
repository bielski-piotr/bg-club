/**
 * Edge Function `delete-member`: administrator usuwa członka klubu (PRD MEM-4, MEM-6).
 * Profil zostaje w historii (miękkie usunięcie), konto Auth jest usuwane miękko
 * (`_shared/accountDeletion.ts`). Klucz service role jest tylko tutaj (PRD §6.1).
 * Logika żądania: `handler.ts`.
 */
import { accountStore, serviceClient } from '../_shared/supabase.ts';
import { handleDeleteMember } from './handler.ts';

const store = accountStore(serviceClient());

Deno.serve((request) =>
  handleDeleteMember(request, {
    store,
    log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
  }),
);
