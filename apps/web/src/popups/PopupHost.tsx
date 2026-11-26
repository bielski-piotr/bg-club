import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, For, useContext } from 'solid-js';
import {
  PopupLevelContext,
  PopupOpenersContext,
  PopupsContext,
  type PopupLevel,
} from './popupContext';
import { routeKey, type PopupRoute } from './routes';

interface PopupHostProps {
  /** Treść pod popupami (hub). Gdy popup jest otwarty, dostaje `inert`. */
  readonly children: JSX.Element;
  /** Popup dla adresu; zwykle `PopupModal` (poziom na stosie z `PopupLevelContext`). */
  readonly renderPopup: (route: PopupRoute) => JSX.Element;
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
 * Wyświetla stos popupów z adresu nad hubem.
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
export function PopupHost(props: PopupHostProps) {
  const popups = useContext(PopupsContext);
  const openers = useContext(PopupOpenersContext);
  const open = createMemo(() => popups.stack.length > 0);
  /**
   * Wpisy stosu z kluczem poziomu (ten sam popup na innym poziomie to inny wpis). Każda zmiana
   * adresu daje nowe obiekty tras, więc wpis o tym samym kluczu zostaje tym samym obiektem:
   * popupy pod spodem nie są montowane od nowa (zachowują stan, przewinięcie i fokus).
   */
  let shown = new Map<string, { readonly route: PopupRoute; readonly key: string }>();
  const entries = createMemo(() => {
    const next = new Map<string, { readonly route: PopupRoute; readonly key: string }>();
    const list = popups.stack.map((route, level) => {
      const key = routeKey(route, level);
      const entry = shown.get(key) ?? { route, key };
      next.set(key, entry);
      return entry;
    });
    shown = next;
    return list;
  });
  let previous = { length: 0, topKey: '' };

  createEffect(
    () => ({ length: entries().length, topKey: entries().at(-1)?.key ?? '' }),
    (current) => {
      const before = previous;
      previous = current;
      if (before.length === current.length && before.topKey === current.topKey) return;
      const opener = current.length < before.length ? openers.take(current.length) : null;
      const level = current.length;
      const restore = (giveUp = false) => {
        if (opener?.isConnected && isFocusable(opener)) {
          opener.focus({ preventScroll: level > 0 });
          return document.activeElement === opener;
        }
        if (opener?.isConnected && level > 0 && !giveUp) return false;
        const target = level > 0 ? dialogAt(level - 1) : null;
        const fallback = target ?? document.getElementById(props.fallbackFocusId);
        fallback?.focus({ preventScroll: true });
        return !fallback || document.activeElement === fallback;
      };
      if (restore()) return;
      // Odsłonięty popup może jeszcze przez klatkę być `inert`/ukryty, a leniwy fragment popupów
      // może jeszcze nie dotrzeć; wtedy `focus()` nic nie robi i fokus zostaje na body.
      // Ponawiamy w kolejnych klatkach, aż element przyjmie fokus.
      let frames = 0;
      let frame = requestAnimationFrame(function retry() {
        frames += 1;
        // Użytkownik zdążył przenieść fokus sam: nie zabieramy go.
        const active = document.activeElement;
        if (active && active !== document.body) return;
        if (!restore(frames >= 30) && frames < 30) frame = requestAnimationFrame(retry);
      });
      return () => cancelAnimationFrame(frame);
    },
  );

  createEffect(open, (isOpen) => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      popups.back();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  createEffect(open, (isOpen) => {
    if (!isOpen) return;
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
  });

  return (
    <>
      <div class="popup-host__content" inert={open()}>
        {props.children}
      </div>
      <For each={entries()}>
        {(entry, index) => {
          const level: PopupLevel = {
            get level() {
              return index();
            },
            get covered() {
              return index() < entries().length - 1;
            },
            get onBack() {
              return index() > 0 ? popups.back : undefined;
            },
            onClose: () => popups.closeAll(),
            onScrimClick: () => popups.back(),
          };
          return (
            <PopupLevelContext value={level}>{props.renderPopup(entry.route)}</PopupLevelContext>
          );
        }}
      </For>
    </>
  );
}
