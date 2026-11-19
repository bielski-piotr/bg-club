import { hookToEmail } from '@bg-club/accounts';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthContext, type AuthNotice, type AuthState } from './authContext';
import { clearPopupsFromUrl } from '../popups/url';
import { loginErrorKind } from './errors';

interface AuthProviderProps {
  readonly client: SupabaseClient;
  readonly children: ReactNode;
}

/** Ta sama sesja (np. ponowne powiadomienie o niej) nie zmienia stanu ani nie renderuje aplikacji. */
function sameSession(state: AuthState, session: Session): boolean {
  return (
    state.status === 'signedIn' &&
    state.session.user.id === session.user.id &&
    state.session.access_token === session.access_token
  );
}

function isExpired(session: Session): boolean {
  return session.expires_at !== undefined && session.expires_at * 1000 <= Date.now();
}

/**
 * Sesja Supabase Auth dla całej aplikacji.
 *
 * - Sesja jest zapamiętana w `localStorage` i odświeżana automatycznie przez supabase-js, więc
 *   trwa do wylogowania. Odrzucone odświeżenie (np. konto usunięte) kończy sesję:
 *   użytkownik wraca do logowania z komunikatem „Sesja wygasła”.
 * - Wylogowanie dotyczy tylko tego urządzenia (`scope: 'local'`): sesja znika lokalnie także bez
 *   sieci, a serwer unieważnia jej token odświeżania.
 * - Zmiana użytkownika czyści cache zapytań i popupy z adresu, żeby dane poprzedniej sesji nie
 *   zostały na ekranie.
 */
export function AuthProvider({ client, children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  /** Powód najbliższego wylogowania zleconego przez aplikację (`null` = użytkownik sam). */
  const pendingNotice = useRef<AuthNotice | null | undefined>(undefined);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    const handle = (event: AuthChangeEvent, session: Session | null) => {
      const nextUser = session?.user.id ?? null;
      if (nextUser !== userId.current) {
        if (userId.current !== null) {
          queryClient.clear();
          // Popupy poprzedniej sesji (np. jej profil) nie czekają na kolejną osobę.
          clearPopupsFromUrl();
        }
        userId.current = nextUser;
      }

      if (session) {
        setState((prev) => (sameSession(prev, session) ? prev : { status: 'signedIn', session }));
        return;
      }

      const requested = pendingNotice.current;
      pendingNotice.current = undefined;
      setState((prev) => {
        if (requested !== undefined) return { status: 'signedOut', notice: requested };
        if (prev.status === 'signedOut') return prev;
        // Wylogowanie, którego ta karta nie zleciła. supabase-js usuwa sesję po odrzuconym
        // odświeżeniu tylko wtedy, gdy token dostępu już wygasł; przy wciąż ważnym tokenie to
        // wylogowanie w innej karcie, więc bez komunikatu o wygaśnięciu.
        const expired = prev.status === 'signedIn' && isExpired(prev.session);
        return {
          status: 'signedOut',
          notice: event === 'SIGNED_OUT' && expired ? 'sessionExpired' : null,
        };
      });
    };

    // supabase-js zakazuje wywołań Auth wewnątrz tego callbacku; tu jest tylko zmiana stanu.
    const { data } = client.auth.onAuthStateChange(handle);
    return () => data.subscription.unsubscribe();
  }, [client, queryClient]);

  const signIn = useCallback(
    async (hook: string, password: string) => {
      const { error } = await client.auth.signInWithPassword({
        email: hookToEmail(hook),
        password,
      });
      return error ? { ok: false as const, error: loginErrorKind(error) } : { ok: true as const };
    },
    [client],
  );

  const signOut = useCallback(
    async (notice?: AuthNotice) => {
      pendingNotice.current = notice ?? null;
      try {
        // Sesja lokalna jest usuwana przed żądaniem, więc błąd sieci nie zostawia zalogowanego
        // urządzenia; zdarzenie SIGNED_OUT przychodzi przed końcem tego wywołania.
        await client.auth.signOut({ scope: 'local' });
      } finally {
        pendingNotice.current = undefined;
      }
    },
    [client],
  );

  const value = useMemo(
    () => ({ state, client, signIn, signOut }),
    [state, client, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
