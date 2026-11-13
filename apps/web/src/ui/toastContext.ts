import { createContext, useContext } from 'react';

/** Warianty toastu (DS §12): sukces (✓ #7CE0A3), neutralny (kopiuj, biały), błąd (⚠ #FFB4B4). */
export type ToastVariant = 'success' | 'neutral' | 'error';

export interface ToastApi {
  /** Pokazuje toast; zwraca identyfikator do wcześniejszego zamknięcia. */
  readonly show: (message: string, variant?: ToastVariant) => number;
  readonly dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** Dostęp do toastów. Wymaga `ToastProvider` wyżej w drzewie. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast wymaga ToastProvider');
  return api;
}
