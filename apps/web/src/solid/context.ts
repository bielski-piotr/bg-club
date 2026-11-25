import type { QueryClient } from '@tanstack/query-core';
import { createContext } from 'solid-js';
import type { AuthContextValue } from '../auth/authContext';
import type { PopupApi, PopupLevel } from '../popups/popupContext';
import type { ToastApi } from '../ui/toastContext';

/*
 * Konteksty kodu Solid. W czasie migracji (docs/solidjs-2-migration.md) wartości daje host React
 * przez `SolidIsland`: wyspa dostaje je jako store, więc zmiany (np. stos popupów, `covered`)
 * są w Solid reaktywne. Konteksty nie mają wartości domyślnej: `useContext` bez dostawcy rzuca
 * `ContextNotFoundError`, tak jak `usePopups()` itp. w React.
 */

/** Wartości z hosta React dla wyspy Solid; brak pola = brak dostawcy (np. wyspa poza popupem). */
export interface IslandHost {
  readonly queryClient?: QueryClient | undefined;
  readonly auth?: AuthContextValue | undefined;
  readonly popups?: PopupApi | undefined;
  readonly popupLevel?: PopupLevel | undefined;
  readonly toast?: ToastApi | undefined;
}

/** Wspólny cache zapytań z częścią React (`src/solid/query.ts`). */
export const QueryClientContext = createContext<QueryClient>();
/** Sesja i klient Supabase (`AuthProvider`). */
export const AuthContext = createContext<AuthContextValue>();
/** Stos popupów z adresu (`PopupRouter`); `stack` jest reaktywny. */
export const PopupsContext = createContext<PopupApi>();
/** Poziom popupu na stosie (`PopupHost`); `covered` jest reaktywny. */
export const PopupLevelContext = createContext<PopupLevel>();
/** Toasty (`ToastProvider`); w Solid komunikat jest tekstem. */
export const ToastContext = createContext<ToastApi>();
