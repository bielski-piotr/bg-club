import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext } from 'solid-js';
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
  /** Stan sesji; pole jest reaktywne (odczyt w JSX albo memo śledzi zmiany). */
  readonly state: AuthState;
  readonly client: SupabaseClient;
  /** Logowanie hookiem i hasłem. Hook musi być już poprawny (`isValidHook`). */
  readonly signIn: (hook: string, password: string) => Promise<SignInResult>;
  /** Wylogowanie na tym urządzeniu; `notice` pokazuje powód na ekranie logowania. */
  readonly signOut: (notice?: AuthNotice) => Promise<void>;
}

/** Sesja i klient Supabase (`AuthProvider`). */
export const AuthContext = createContext<AuthContextValue>();
