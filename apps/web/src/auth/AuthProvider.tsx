import { hookToEmail } from '@bg-club/accounts';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import type { JSX } from '@solidjs/web';
import { createSignal, onSettled, useContext } from 'solid-js';
import { QueryClientContext } from '../lib/queryClient';
import { clearPopupsFromUrl } from '../popups/url';
import { AuthContext, type AuthContextValue, type AuthNotice, type AuthState } from './authContext';
import { loginErrorKind } from './errors';

interface AuthProviderProps {
  readonly client: SupabaseClient;
  readonly children: JSX.Element;
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
export function AuthProvider(props: AuthProviderProps) {
  const queryClient = useContext(QueryClientContext);
  const [state, setState] = createSignal<AuthState>({ status: 'loading' });
  /** Ostatni stan zapisany w tej karcie (sygnał pokazuje go dopiero po flushu). */
  let current: AuthState = { status: 'loading' };
  /** Powód najbliższego wylogowania zleconego przez aplikację (`null` = użytkownik sam). */
  let pendingNotice: AuthNotice | null | undefined;
  let userId: string | null = null;

  const update = (next: AuthState) => {
    if (next === current) return;
    current = next;
    setState(next);
  };

  onSettled(() => {
    const handle = (event: AuthChangeEvent, session: Session | null) => {
      const nextUser = session?.user.id ?? null;
      if (nextUser !== userId) {
        if (userId !== null) {
          queryClient.clear();
          // Popupy poprzedniej sesji (np. jej profil) nie czekają na kolejną osobę.
          clearPopupsFromUrl();
        }
        userId = nextUser;
      }

      if (session) {
        if (!sameSession(current, session)) update({ status: 'signedIn', session });
        return;
      }

      const requested = pendingNotice;
      pendingNotice = undefined;
      if (requested !== undefined) {
        update({ status: 'signedOut', notice: requested });
        return;
      }
      if (current.status === 'signedOut') return;
      // Wylogowanie, którego ta karta nie zleciła. supabase-js usuwa sesję po odrzuconym
      // odświeżeniu tylko wtedy, gdy token dostępu już wygasł; przy wciąż ważnym tokenie to
      // wylogowanie w innej karcie, więc bez komunikatu o wygaśnięciu.
      const expired = current.status === 'signedIn' && isExpired(current.session);
      update({
        status: 'signedOut',
        notice: event === 'SIGNED_OUT' && expired ? 'sessionExpired' : null,
      });
    };

    // supabase-js zakazuje wywołań Auth wewnątrz tego callbacku; tu jest tylko zmiana stanu.
    const { data } = props.client.auth.onAuthStateChange(handle);
    return () => data.subscription.unsubscribe();
  });

  const value: AuthContextValue = {
    get state() {
      return state();
    },
    get client() {
      return props.client;
    },
    signIn: async (hook, password) => {
      const { error } = await props.client.auth.signInWithPassword({
        email: hookToEmail(hook),
        password,
      });
      return error ? { ok: false as const, error: loginErrorKind(error) } : { ok: true as const };
    },
    signOut: async (notice) => {
      pendingNotice = notice ?? null;
      try {
        // Sesja lokalna jest usuwana przed żądaniem, więc błąd sieci nie zostawia zalogowanego
        // urządzenia; zdarzenie SIGNED_OUT przychodzi przed końcem tego wywołania.
        await props.client.auth.signOut({ scope: 'local' });
      } finally {
        pendingNotice = undefined;
      }
    },
  };
  return <AuthContext value={value}>{props.children}</AuthContext>;
}
