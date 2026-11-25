/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  onFlush,
  Show,
  type Accessor,
} from 'solid-js';
import { ariaBool, type ClassValue } from './dom';
import { Icon, type IconName } from './Icon';
import '../../ui/Select.css';
import '../../ui/Menu.css';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName | undefined;
  /** Akcja niszcząca: ikona i tekst w kolorze błędu (DS §7). */
  readonly destructive?: boolean | undefined;
  readonly onSelect: () => void;
}

/**
 * Atrybuty przycisku otwierającego menu (`aria-haspopup`, `aria-expanded`, klawiatura). Pola
 * są reaktywne (gettery): rozłóż je na przycisku, `<button {...props}>`.
 */
export interface MenuTriggerProps {
  readonly ref: (element: HTMLButtonElement) => void;
  readonly id: string;
  readonly 'aria-haspopup': 'menu';
  readonly 'aria-expanded': 'true' | 'false';
  readonly 'aria-controls': string | undefined;
  readonly onClick: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

export interface MenuProps {
  /** Nazwa menu dla czytnika ekranu (np. „Menu konta”). */
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** Przycisk otwierający; dostaje atrybuty i stan otwarcia. */
  readonly trigger: (props: MenuTriggerProps, open: Accessor<boolean>) => JSX.Element;
  /** Wyrównanie panelu do krawędzi przycisku. */
  readonly align?: 'start' | 'end' | undefined;
  readonly class?: ClassValue;
}

/**
 * Menu kontekstowe (DS §7 „Dropdown/context menu”): panel 200 px, elementy h40 z ikoną 16.
 * Wzorzec WAI-ARIA „menu button”: Enter, Spacja i ↓ otwierają menu na pierwszym elemencie,
 * ↑ na ostatnim; ↑ ↓ Home End przesuwają fokus, Esc zamyka i oddaje fokus przyciskowi, Tab
 * i kliknięcie poza menu je zamykają.
 */
export function Menu(props: MenuProps) {
  const [open, setOpen] = createSignal(false);
  const [focusIndex, setFocusIndex] = createSignal(0);
  const triggerId = createUniqueId();
  const menuId = createUniqueId();
  let root: HTMLDivElement | undefined;
  let button: HTMLButtonElement | undefined;
  const itemButtons: (HTMLButtonElement | undefined)[] = [];

  createEffect(
    () => (open() ? focusIndex() : -1),
    (index) => {
      if (index >= 0) itemButtons[index]?.focus();
    },
  );

  createEffect(
    () => open(),
    (isOpen) => {
      if (!isOpen) return;
      const onPointerDown = (event: PointerEvent) => {
        if (!root?.contains(event.target as Node)) setOpen(false);
      };
      document.addEventListener('pointerdown', onPointerDown);
      return () => document.removeEventListener('pointerdown', onPointerDown);
    },
  );

  const openAt = (index: number) => {
    setFocusIndex(index);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(props.items.length - 1);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const last = props.items.length - 1;
    const current = focusIndex();
    const moves: Record<string, number> = {
      ArrowDown: current >= last ? 0 : current + 1,
      ArrowUp: current <= 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      setFocusIndex(next);
    } else if (event.key === 'Escape') {
      // Esc zamyka menu, a nie popup pod nim.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const select = (item: MenuItem) => {
    // `onFlush`: zamknięcie ląduje osobno (w najbliższym mikrozadaniu), nawet gdy `onSelect`
    // uruchamia akcję. Zwykły `setOpen(false)` zostałby wstrzymany razem z tą akcją.
    onFlush(() => setOpen(false));
    button?.focus();
    item.onSelect();
  };

  const triggerProps: MenuTriggerProps = {
    ref: (element) => {
      button = element;
    },
    id: triggerId,
    'aria-haspopup': 'menu',
    get 'aria-expanded'() {
      return ariaBool(open());
    },
    get 'aria-controls'() {
      return open() ? menuId : undefined;
    },
    onClick: () => (open() ? close(false) : openAt(0)),
    onKeyDown: onTriggerKeyDown,
  };

  return (
    <div ref={(el) => (root = el)} class={['menu-button', props.class]}>
      {props.trigger(triggerProps, open)}
      <Show when={open()}>
        <div
          id={menuId}
          role="menu"
          aria-label={props.label}
          class={['menu', 'menu-button__panel', `menu-button__panel--${props.align ?? 'start'}`]}
          onKeyDown={onMenuKeyDown}
        >
          <For each={props.items}>
            {(item, index) => (
              <button
                ref={(el) => {
                  itemButtons[index()] = el;
                }}
                type="button"
                role="menuitem"
                tabindex={index() === focusIndex() ? 0 : -1}
                class={[
                  'menu__item',
                  'menu-button__item',
                  { 'menu__item--danger': !!item.destructive },
                ]}
                onClick={() => select(item)}
                onFocus={() => setFocusIndex(index())}
              >
                <Show when={item.icon}>
                  {(icon) => <Icon name={icon()} class="menu-button__icon" />}
                </Show>
                <span class="menu__label">{item.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
