import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, Show } from 'solid-js';
import { t } from '../i18n';
import { focusableIn } from './focusable';
import { IconButton } from './Button';
import { createSlot, type ClassValue } from './dom';
import { Icon, type IconName } from './Icon';
import './Modal.css';

export interface ModalProps {
  readonly title: string;
  /** Licznik obok tytułu na desktopie, np. „12 osób” (DS §7). */
  readonly count?: string | undefined;
  /** Akcje w nagłówku przed ×, np. przycisk „Dodaj” h36. */
  readonly actions?: JSX.Element | undefined;
  /** Zamknięcie (×). */
  readonly onClose: () => void;
  /** Powrót do poprzedniego popupu (←); bez niego przycisku nie ma. */
  readonly onBack?: (() => void) | undefined;
  /** Kliknięcie tła poza oknem (desktop). */
  readonly onScrimClick?: (() => void) | undefined;
  /** 560 (lista, formularz), 880 (dwie kolumny), DS §7, albo 1120 (edytor notesu, DS §18). */
  readonly width?: 560 | 880 | 1120 | undefined;
  /** Okno przykryte przez popup wyżej na stosie: niewidoczne i poza kolejnością fokusu. */
  readonly covered?: boolean | undefined;
  /**
   * Okno pod własnym dialogiem (np. potwierdzeniem): widoczne, ale `inert`, więc fokus
   * i czytniki ekranu zostają w dialogu.
   */
  readonly blocked?: boolean | undefined;
  /** Poziom na stosie (atrybut `data-popup-level`, po nim host przenosi fokus). */
  readonly level?: number | undefined;
  readonly children: JSX.Element;
  /**
   * Stopka formularza (DS §7, §17): na desktopie przyciski do prawej, na telefonie dwa
   * przyciski po równo na dole arkusza. Zostaje widoczna, gdy treść się przewija.
   */
  readonly footer?: JSX.Element | undefined;
  readonly class?: ClassValue;
}

/** Tab i Shift+Tab krążą w oknie dialogu (NFR-6). */
function trapFocus(event: KeyboardEvent, dialog: HTMLElement) {
  if (event.key !== 'Tab') return;
  const notifications = document.querySelector<HTMLElement>('.toast-region__toasts');
  const active = document.activeElement;
  if (active !== dialog && !dialog.contains(active) && !notifications?.contains(active)) return;
  const items = [...focusableIn(dialog), ...(notifications ? focusableIn(notifications) : [])];
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Pułapka fokusu górnego, aktywnego okna. Zwraca ref okna. Toast z linkiem pozostaje
 * osiągalny klawiaturą również nad otwartym popupem.
 */
function createDialogFocus(inactive: () => boolean) {
  let dialog: HTMLElement | undefined;
  createEffect(
    () => inactive(),
    (isInactive) => {
      if (isInactive) return;
      const onKeyDown = (event: KeyboardEvent) => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(
          (el) => !el.closest('[inert]'),
        );
        if (!event.defaultPrevented && dialog && dialogs.at(-1) === dialog) {
          trapFocus(event, dialog);
        }
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    },
  );
  return (element: HTMLElement) => {
    dialog = element;
  };
}

/**
 * Popup (DS §7): na desktopie okno 560/880 na przyciemnionym tle, na telefonie pełnoekranowy
 * arkusz. Fokus nie wychodzi poza okno (Tab i Shift+Tab krążą w nim, NFR-6); resztę strony
 * wyłącza `inert` u rodzica. Esc, przewijanie tła i przywracanie fokusu obsługuje `PopupHost`.
 */
export function Modal(props: ModalProps) {
  const titleId = createUniqueId();
  const dialogRef = createDialogFocus(() => !!(props.covered || props.blocked));
  const footer = createSlot(() => props.footer);
  return (
    <div
      class={['popup-layer', { 'popup-layer--covered': !!props.covered }]}
      inert={!!(props.covered || props.blocked)}
    >
      <div class="popup-layer__scrim" aria-hidden="true" onClick={() => props.onScrimClick?.()} />
      <div
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={titleId}
        tabindex={-1}
        data-popup-level={props.level}
        class={['modal', `modal--${props.width ?? 560}`, props.class]}
      >
        <header class="modal__header">
          <div class="modal__heading">
            <Show when={props.onBack}>
              {(onBack) => (
                <IconButton icon="chevron-left" label={t.ui.back} onClick={() => onBack()()} />
              )}
            </Show>
            <div class="modal__title-group">
              <h2 id={titleId} class="modal__title">
                {props.title}
              </h2>
              <Show when={props.count}>
                <span class="modal__count">{props.count}</span>
              </Show>
            </div>
          </div>
          <div class="modal__actions">
            {props.actions}
            <IconButton icon="x" label={t.ui.close} onClick={() => props.onClose()} />
          </div>
        </header>
        <div class="modal__body">
          <Show when={props.count}>
            <p class="modal__count-line">{props.count}</p>
          </Show>
          {props.children}
        </div>
        <Show when={footer()}>
          <footer class="modal__footer">{footer()}</footer>
        </Show>
      </div>
    </div>
  );
}

export interface DialogProps {
  readonly title: string;
  /** Opis pod tytułem (14/20, kolor pomocniczy). */
  readonly description?: JSX.Element | undefined;
  /**
   * Ikona w kółku 44 nad tytułem; `danger` dla działań nieodwracalnych, `warning` dla
   * przeszkody do usunięcia (np. partie w toku, DS §15 „Dialog variants”).
   */
  readonly icon?: IconName | undefined;
  readonly tone?: 'accent' | 'danger' | 'warning' | undefined;
  /** Własny element nad tytułem zamiast ikony (np. okładka albo ilustracja); dekoracyjny. */
  readonly media?: JSX.Element | undefined;
  /** Kliknięcie tła poza oknem. Esc obsługuje `PopupHost`. */
  readonly onScrimClick?: (() => void) | undefined;
  readonly covered?: boolean | undefined;
  readonly level?: number | undefined;
  /** Treść między opisem a przyciskami, np. pole hasła. */
  readonly children?: JSX.Element | undefined;
  /** Dwa przyciski równej szerokości: Anuluj i działanie (DS §7). */
  readonly footer: JSX.Element;
}

/**
 * Mały dialog (DS §7 „Small dialog”): potwierdzenia i krótkie formularze haseł. Karta 343 na
 * przyciemnionym tle na każdej szerokości ekranu, bez przycisku ×; zamyka go Anuluj, Esc albo
 * kliknięcie tła. Fokus zostaje w oknie jak w `Modal`.
 */
export function Dialog(props: DialogProps) {
  const titleId = createUniqueId();
  const descriptionId = createUniqueId();
  const dialogRef = createDialogFocus(() => !!props.covered);
  const media = createSlot(() => props.media);
  const description = createSlot(() => props.description);
  const body = createSlot(() => props.children);
  return (
    <div
      class={['popup-layer', 'popup-layer--dialog', { 'popup-layer--covered': !!props.covered }]}
      inert={!!props.covered}
    >
      <div class="popup-layer__scrim" aria-hidden="true" onClick={() => props.onScrimClick?.()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description() ? descriptionId : undefined}
        tabindex={-1}
        data-popup-level={props.level}
        class="dialog"
        ref={dialogRef}
      >
        <Show
          when={media()}
          fallback={
            <Show when={props.icon}>
              {(icon) => (
                <span
                  class={['dialog__icon', `dialog__icon--${props.tone ?? 'accent'}`]}
                  aria-hidden="true"
                >
                  <Icon name={icon()} size={20} />
                </span>
              )}
            </Show>
          }
        >
          <span class="dialog__media" aria-hidden="true">
            {media()}
          </span>
        </Show>
        <h2 id={titleId} class="dialog__title">
          {props.title}
        </h2>
        <Show when={description()}>
          <div id={descriptionId} class="dialog__description">
            {description()}
          </div>
        </Show>
        <Show when={body()}>
          <div class="dialog__body">{body()}</div>
        </Show>
        <div class="dialog__footer">{props.footer}</div>
      </div>
    </div>
  );
}
