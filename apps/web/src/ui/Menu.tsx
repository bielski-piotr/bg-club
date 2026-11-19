import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import './Select.css';
import './Menu.css';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName | undefined;
  /** Akcja niszcząca: ikona i tekst w kolorze błędu. */
  readonly destructive?: boolean | undefined;
  readonly onSelect: () => void;
}

/** Atrybuty przycisku otwierającego menu (`aria-haspopup`, `aria-expanded`, klawiatura). */
export interface MenuTriggerProps {
  readonly ref: Ref<HTMLButtonElement>;
  readonly id: string;
  readonly 'aria-haspopup': 'menu';
  readonly 'aria-expanded': boolean;
  readonly 'aria-controls': string | undefined;
  readonly onClick: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface MenuProps {
  /** Nazwa menu dla czytnika ekranu (np. „Menu konta”). */
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** Przycisk otwierający; dostaje atrybuty i stan otwarcia. */
  readonly trigger: (props: MenuTriggerProps, open: boolean) => ReactNode;
  /** Wyrównanie panelu do krawędzi przycisku. */
  readonly align?: 'start' | 'end' | undefined;
  readonly className?: string | undefined;
}

/**
 * Menu kontekstowe: panel 200 px, elementy h40 z ikoną 16.
 * Wzorzec WAI-ARIA „menu button”: Enter, Spacja i ↓ otwierają menu na pierwszym elemencie,
 * ↑ na ostatnim; ↑ ↓ Home End przesuwają fokus, Esc zamyka i oddaje fokus przyciskowi, Tab
 * i kliknięcie poza menu je zamykają.
 */
export function Menu({ label, items, trigger, align = 'start', className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const triggerId = useId();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const openAt = (index: number) => {
    setFocusIndex(index);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(items.length - 1);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: focusIndex >= last ? 0 : focusIndex + 1,
      ArrowUp: focusIndex <= 0 ? last : focusIndex - 1,
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
    close(true);
    item.onSelect();
  };

  return (
    <div ref={root} className={cx('menu-button', className)}>
      {trigger(
        {
          ref: button,
          id: triggerId,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': open ? menuId : undefined,
          onClick: () => (open ? close(false) : openAt(0)),
          onKeyDown: onTriggerKeyDown,
        },
        open,
      )}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx('menu', 'menu-button__panel', `menu-button__panel--${align}`)}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={index === focusIndex ? 0 : -1}
              className={cx(
                'menu__item',
                'menu-button__item',
                item.destructive && 'menu__item--danger',
              )}
              onClick={() => select(item)}
              onFocus={() => setFocusIndex(index)}
            >
              {item.icon ? <Icon name={item.icon} className="menu-button__icon" /> : null}
              <span className="menu__label">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
