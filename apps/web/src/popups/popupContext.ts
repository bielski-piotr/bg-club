import { createContext, useContext, type MouseEvent } from 'react';
import type { PopupRoute } from './routes';

export interface PopupApi {
  /** Stos popupów z adresu, od dołu do góry. Pusty = sam hub. */
  readonly stack: readonly PopupRoute[];
  /** Otwiera popup nad bieżącym (nowy wpis historii, więc Wstecz go zamyka). */
  readonly open: (route: PopupRoute) => void;
  /** Zamyka górny popup (jak Wstecz w przeglądarce, Esc i przycisk ←). */
  readonly back: () => void;
  /** Zamyka `count` popupów z góry stosu (np. dialog i popup pod nim, którego treść zniknęła). */
  readonly backBy: (count: number) => void;
  /** Zastępuje górny popup innym bez nowego wpisu historii (np. kreator → jego wynik). */
  readonly replace: (route: PopupRoute) => void;
  /** Zamyka cały stos i wraca do huba (przycisk ×). */
  readonly closeAll: () => void;
  /** Adres po otwarciu `route` nad bieżącym stosem (dla `<a href>`). */
  readonly hrefFor: (route: PopupRoute) => string;
}

export const PopupContext = createContext<PopupApi | null>(null);

export function usePopups(): PopupApi {
  const value = useContext(PopupContext);
  if (!value) throw new Error('usePopups wymaga <PopupRouter>');
  return value;
}

/**
 * Kliknięcie linku do popupu: zwykłe kliknięcie otwiera popup w aplikacji, a kliknięcie
 * z Ctrl / Cmd / Shift / środkowym przyciskiem zostaje przeglądarce (nowa karta z tym adresem).
 */
export function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Elementy, które otworzyły popupy (indeks = poziom stosu). Zapisuje je `open`, a po zamknięciu
 * popupu `PopupHost` oddaje im fokus.
 */
export interface PopupOpeners {
  /** Zapamiętuje element, który otwiera popup na poziomie `level`. */
  readonly remember: (level: number, opener: Element | null) => void;
  /** Oddaje i zapomina element, który otworzył popup na poziomie `level` i wyższych. */
  readonly take: (level: number) => Element | null;
}

export const PopupOpenersContext = createContext<PopupOpeners | null>(null);

export function usePopupOpeners(): PopupOpeners {
  const value = useContext(PopupOpenersContext);
  if (!value) throw new Error('usePopupOpeners wymaga <PopupRouter>');
  return value;
}

/** Poziom popupu na stosie: popup sam wie, czy jest przykryty i czy ma przycisk ←. */
export interface PopupLevel {
  readonly level: number;
  readonly covered: boolean;
  /** ← wraca do popupu niżej; na dole stosu nie ma dokąd wracać. */
  readonly onBack: (() => void) | undefined;
  readonly onClose: () => void;
  readonly onScrimClick: () => void;
}

export const PopupLevelContext = createContext<PopupLevel | null>(null);

export function usePopupLevel(): PopupLevel {
  const value = useContext(PopupLevelContext);
  if (!value) throw new Error('usePopupLevel wymaga popupu w <PopupHost>');
  return value;
}

/**
 * Ochrona popupu przed zamknięciem, np. przy niezapisanych zmianach (EDT-1). Dostaje `leave`,
 * które zamyka popup mimo ochrony; popup może je wywołać od razu albo po potwierdzeniu.
 */
export type LeaveGuard = (leave: () => void) => void;

export interface PopupGuards {
  /** Ustawia (albo zdejmuje, `null`) ochronę popupu na poziomie `level`. */
  readonly set: (level: number, guard: LeaveGuard | null) => void;
}

export const PopupGuardsContext = createContext<PopupGuards | null>(null);

export function usePopupGuards(): PopupGuards {
  const value = useContext(PopupGuardsContext);
  if (!value) throw new Error('usePopupGuards wymaga <PopupRouter>');
  return value;
}
