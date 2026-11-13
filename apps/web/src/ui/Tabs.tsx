import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import './Choice.css';
import './Tabs.css';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
}

export interface TabsProps<T extends string> {
  /** Etykieta listy zakładek dla czytnika ekranu. */
  readonly label: string;
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Treść aktywnej zakładki (renderowana w `role="tabpanel"`). */
  readonly children?: (value: T) => ReactNode;
  readonly className?: string | undefined;
}

/**
 * Zakładki-pigułki (DS §10): aktywna ciemna, nieaktywne z ramką.
 * Wzorzec WAI-ARIA Tabs z automatyczną aktywacją: strzałki, Home i End zmieniają zakładkę,
 * fokus jest tylko na aktywnej (roving tabindex).
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  children,
  className,
}: TabsProps<T>) {
  const id = useId();
  const tabId = (item: T) => `${id}-tab-${item}`;
  const panelId = `${id}-panel`;
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const focusAt = (index: number) => {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    onChange(item.id);
    refs.current.get(item.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((i) => i.id === value);
    const keys: Record<string, () => void> = {
      ArrowRight: () => focusAt(index + 1),
      ArrowLeft: () => focusAt(index - 1),
      Home: () => focusAt(0),
      End: () => focusAt(items.length - 1),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className={cx('tabs', className)}>
      <div role="tablist" aria-label={label} className="pills tabs__list" onKeyDown={onKeyDown}>
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) refs.current.set(item.id, el);
                else refs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={selected}
              aria-controls={children ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              className="pill"
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {children ? (
        <div
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(value)}
          className="tabs__panel"
          tabIndex={0}
        >
          {children(value)}
        </div>
      ) : null}
    </div>
  );
}
