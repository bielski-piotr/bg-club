import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../i18n';
import { cx } from './cx';
import { hintId } from './fieldIds';
import { Icon, type IconName } from './Icon';
import './Field.css';
import './Select.css';

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Dodatkowa informacja po prawej (np. przesunięcie „UTC+01:00”). */
  readonly meta?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export interface SelectProps<T extends string> {
  readonly label: string;
  readonly hideLabel?: boolean | undefined;
  readonly options: readonly SelectOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  /** `field` = pole h48 (formularz), `pill` = pigułka h36 (filtr roku), DS §10. */
  readonly appearance?: 'field' | 'pill' | undefined;
  readonly leadingIcon?: IconName | undefined;
  readonly placeholder?: string | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Lista rozwijana: przycisk + `role="listbox"` w panelu menu (DS §7, §10).
 * Klawiatura: strzałki/Enter/Spacja otwierają, strzałki, Home, End i pierwsza litera
 * przesuwają zaznaczenie, Enter/Spacja wybiera, Esc i Tab zamykają.
 */
export function Select<T extends string>({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  appearance = 'field',
  leadingIcon,
  placeholder = t.ui.selectPlaceholder,
  hint,
  error,
  disabled = false,
  className,
}: SelectProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-opt-${index}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const enabledIndexes = options.flatMap((o, i) => (o.disabled ? [] : [i]));

  const openList = (index: number) => {
    if (disabled) return;
    setActive(enabledIndexes.includes(index) ? index : (enabledIndexes[0] ?? -1));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    const el = document.getElementById(optionId(active));
    // jsdom nie ma scrollIntoView.
    el?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const move = (delta: number) => {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(active);
    const next = pos < 0 ? 0 : Math.min(enabledIndexes.length - 1, Math.max(0, pos + delta));
    setActive(enabledIndexes[next] ?? -1);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openList(selectedIndex);
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        return;
      case 'Home':
        event.preventDefault();
        setActive(enabledIndexes[0] ?? -1);
        return;
      case 'End':
        event.preventDefault();
        setActive(enabledIndexes.at(-1) ?? -1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case 'Tab':
        // Fokus wraca na przycisk przed zamknięciem, więc Tab przechodzi do następnej kontrolki.
        close(true);
        return;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const key = event.key.toLocaleLowerCase('pl-PL');
          const start = enabledIndexes.indexOf(active);
          const ordered = [
            ...enabledIndexes.slice(start + 1),
            ...enabledIndexes.slice(0, start + 1),
          ];
          const match = ordered.find((i) =>
            options[i]?.label.toLocaleLowerCase('pl-PL').startsWith(key),
          );
          if (match !== undefined) setActive(match);
        }
    }
  };

  const message = error || hint;

  return (
    <div className={cx('field', 'select', `select--${appearance}`, className)} ref={rootRef}>
      <span id={labelId} className={cx('field__label', hideLabel && 'sr-only')}>
        {label}
      </span>
      <div className="select__anchor">
        <button
          ref={triggerRef}
          id={`${id}-trigger`}
          type="button"
          className={cx(
            appearance === 'field' ? 'input select__field' : 'select__pill',
            open && 'select--open',
            error && 'input--error',
            disabled && 'input--disabled',
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={`${labelId} ${id}-trigger`}
          aria-describedby={message ? hintId(id) : undefined}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={() => (open ? close(false) : openList(selectedIndex))}
          onKeyDown={onTriggerKeyDown}
        >
          {leadingIcon ? <Icon name={leadingIcon} className="select__lead" /> : null}
          <span className={cx('select__value', !selected && 'select__value--placeholder')}>
            {selected?.label ?? placeholder}
          </span>
          {selected?.meta ? <span className="select__meta tnum">{selected.meta}</span> : null}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} className="select__chevron" />
        </button>
        {open ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            className="menu select__menu"
            aria-labelledby={labelId}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            onKeyDown={onListKeyDown}
          >
            {options.length === 0 ? (
              <li className="menu__empty" role="presentation">
                {t.ui.noOptions}
              </li>
            ) : (
              options.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  className={cx(
                    'menu__item',
                    option.value === value && 'menu__item--selected',
                    index === active && 'menu__item--active',
                  )}
                  onPointerMove={() => !option.disabled && setActive(index)}
                  onClick={() => choose(index)}
                >
                  <span className="menu__label">{option.label}</span>
                  {option.meta ? <span className="menu__meta tnum">{option.meta}</span> : null}
                  <span className="menu__check">
                    {option.value === value ? <Icon name="check" /> : null}
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {message ? (
        <p id={hintId(id)} className={cx('field__hint', error && 'field__hint--error')}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
