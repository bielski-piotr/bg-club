import type { JSX } from '@solidjs/web';
import { createContext } from 'solid-js';

/** Warianty toastu: sukces (✓ #7CE0A3), neutralny (kopiuj, biały), błąd (⚠ #FFB4B4). */
export type ToastVariant = 'success' | 'neutral' | 'error';

export interface ToastApi {
  /** Pokazuje toast; zwraca identyfikator do wcześniejszego zamknięcia. */
  readonly show: (
    message: JSX.Element,
    variant?: ToastVariant,
    options?: { readonly rich?: boolean; readonly duration?: number; readonly key?: string },
  ) => number;
  readonly dismiss: (id: number) => void;
}

/** Toasty (`ToastProvider`). */
export const ToastContext = createContext<ToastApi>();
