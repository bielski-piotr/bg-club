import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { PopupLevelContext, usePopupOpeners, usePopups } from './popupContext';
import { routeKey, type PopupRoute } from './routes';

interface PopupHostProps {
  /** Treść pod popupami (hub). Gdy popup jest otwarty, dostaje `inert`. */
  readonly children: ReactNode;
  /** Popup dla adresu; zwykle `<Modal>` z `usePopupLevel()`. */
  readonly renderPopup: (route: PopupRoute) => ReactNode;
  /** Element, który dostaje fokus po zamknięciu popupu otwartego z linku (bez otwierającego). */
  readonly fallbackFocusId: string;
}

function dialogAt(level: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-popup-level="${level}"]`);
}

function isFocusable(el: Element | null | undefined): el is HTMLElement {
  return el instanceof HTMLElement && el.isConnected && !el.closest('[inert]');
}

/**
 * Wyświetla stos popupów z adresu nad hubem (PRD §4, NFR-4, NFR-6).
 *
 * - Widoczny jest tylko górny popup; niższe zostają zamontowane (zachowują stan i przewinięcie),
 *   ale są ukryte i `inert`, tak jak hub pod spodem.
 * - Esc zamyka górny popup. Pole lub lista, które same obsługują Esc (np. czyszczą
 *   wyszukiwanie), wywołują `preventDefault`, więc popup zostaje.
 * - Przewijanie strony pod popupem jest wyłączone; na telefonie arkusz ma wysokość widocznego
 *   obszaru (klawiatura ekranowa go nie zasłania), a pole z fokusem jest przewijane do widoku.
 * - Fokus: nowy popup dostaje fokus na oknie; po zamknięciu wraca do elementu, który popup
 *   otworzył (także po Wstecz w przeglądarce), a gdy go nie ma, do `fallbackFocusId`.
 */
export function PopupHost({ children, renderPopup, fallbackFocusId }: PopupHostProps) {
  const { stack, back, closeAll } = usePopups();
  const openers = usePopupOpeners();
  const open = stack.length > 0;
  const keys = stack.map(routeKey);
  const topKey = keys.at(-1) ?? '';
  const previous = useRef<{ length: number; topKey: string }>({ length: 0, topKey: '' });

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { length: stack.length, topKey };
    if (before.length === stack.length && before.topKey === topKey) return;
    if (stack.length < before.length) {
      const opener = openers.take(stack.length);
      if (isFocusable(opener)) {
        opener.focus({ preventScroll: stack.length > 0 });
        return;
      }
    }
    const target = stack.length > 0 ? dialogAt(stack.length - 1) : null;
    (target ?? document.getElementById(fallbackFocusId))?.focus({ preventScroll: true });
  }, [stack.length, topKey, openers, fallbackFocusId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      back();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, back]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add('popup-open');
    const viewport = window.visualViewport;
    const sync = () => {
      if (!viewport) return;
      root.style.setProperty('--vv-height', `${viewport.height}px`);
      root.style.setProperty('--vv-top', `${viewport.offsetTop}px`);
    };
    const resize = () => {
      sync();
      // Klawiatura ekranowa zmniejsza widoczny obszar: pole z fokusem ma zostać widoczne.
      // Tylko przy zmianie rozmiaru, nie przy przewijaniu (to walczyłoby z przesuwaniem palcem).
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches('input, textarea, [contenteditable]')) {
        active.scrollIntoView({ block: 'nearest' });
      }
    };
    sync();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', sync);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', sync);
      root.classList.remove('popup-open');
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--vv-top');
    };
  }, [open]);

  return (
    <>
      <div className="popup-host__content" inert={open}>
        {children}
      </div>
      {stack.map((route, level) => (
        <PopupLevelContext.Provider
          key={keys[level]}
          value={{
            level,
            covered: level < stack.length - 1,
            onBack: level > 0 ? back : undefined,
            onClose: closeAll,
            onScrimClick: back,
          }}
        >
          {renderPopup(route)}
        </PopupLevelContext.Provider>
      ))}
    </>
  );
}
