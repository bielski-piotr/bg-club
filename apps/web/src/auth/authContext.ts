import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';
import type { LoginErrorKind } from './errors';

/** Powód, dla którego użytkownik wraca do ekranu logowania bez własnej decyzji. */
export type AuthNotice = 'sessionExpired' | 'accountInactive' | 'accountDeleted';

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signedOut'; readonly notice: AuthNotice | null }
  | { readonly status: 'signedIn'; readonly session: Session };

export type SignInResult =
  { readonly ok: true } | { readonly ok: false; readonly error: LoginErrorKind };

export interface AuthContextValue {
  readonly state: AuthState;
  readonly client: SupabaseClient;
  /** Logowanie hookiem i hasłem (AUTH-1). Hook musi być już poprawny (`isValidHook`). */
  readonly signIn: (hook: string, password: string) => Promise<SignInResult>;
  /** Wylogowanie na tym urządzeniu; `notice` pokazuje powód na ekranie logowania. */
  readonly signOut: (notice?: AuthNotice) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth wymaga <AuthProvider>');
  return value;
}
