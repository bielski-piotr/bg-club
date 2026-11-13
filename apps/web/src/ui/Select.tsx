import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { t } from '../i18n';
import { cx } from './cx';
import { normalizeSearch } from './search';
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
  /**
   * Wyszukiwarka nad listą (DS §17, strefa czasowa): etykieta pola wyszukiwania. Z nią panel
   * jest pozycjonowany względem okna (`position: fixed`), więc nie przycina go przewijany popup.
   */
  readonly searchLabel?: string | undefined;
  /** Czy opcja pasuje do wpisanego tekstu; domyślnie etykieta zawiera tekst (`normalizeSearch`). */
  readonly matches?: ((option: SelectOption<T>, query: string) => boolean) | undefined;
}

const defaultMatches = (option: SelectOption<string>, query: string) =>
  normalizeSearch(option.label).includes(query);

/** Odstęp panelu od pola i od krawędzi okna; docelowa wysokość panelu z wyszukiwarką. */
const PANEL_GAP = 6;
const VIEW_MARGIN = 8;
const PANEL_MAX_HEIGHT = 340;
const PANEL_MIN_BELOW = 200;

/** Położenie panelu z wyszukiwarką względem okna: pod polem, a gdy brak miejsca, nad nim. */
function floatingStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewBottom = viewTop + (viewport?.height ?? window.innerHeight);
  const below = viewBottom - rect.bottom - PANEL_GAP - VIEW_MARGIN;
  const above = rect.top - viewTop - PANEL_GAP - VIEW_MARGIN;
  const down = below >= PANEL_MIN_BELOW || below >= above;
  const space = Math.max(0, down ? below : above);
  return {
    position: 'fixed',
    left: rect.left,
    width: rect.width,
    maxHeight: Math.min(PANEL_MAX_HEIGHT, space),
    ...(down
      ? { top: rect.bottom + PANEL_GAP }
      : { top: 'auto', bottom: document.documentElement.clientHeight - rect.top + PANEL_GAP }),
  };
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
  searchLabel,
  matches = defaultMatches,
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
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchable = searchLabel !== undefined;
  const [query, setQuery] = useState('');
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>(undefined);

  const selected = options.find((o) => o.value === value);
  const normalizedQuery = normalizeSearch(query);
  const visible = useMemo(
    () =>
      searchable && normalizedQuery !== ''
        ? options.filter((option) => matches(option, normalizedQuery))
        : options,
    [searchable, normalizedQuery, options, matches],
  );
  const enabledIndexes = visible.flatMap((o, i) => (o.disabled ? [] : [i]));

  const openList = () => {
    if (disabled) return;
    setQuery('');
    const index = options.findIndex((o) => o.value === value);
    const enabled = options.flatMap((o, i) => (o.disabled ? [] : [i]));
    setActive(enabled.includes(index) ? index : (enabled[0] ?? -1));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = visible[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close(true);
  };

  const onQueryChange = (next: string) => {
    setQuery(next);
    const normalized = normalizeSearch(next);
    const list =
      normalized === '' ? options : options.filter((option) => matches(option, normalized));
    const index = list.findIndex((o) => o.value === value && !o.disabled);
    setActive(index >= 0 ? index : list.findIndex((o) => !o.disabled));
  };

  useEffect(() => {
    if (!open) return;
    (searchable ? searchRef.current : listRef.current)?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, searchable]);

  // Panel z wyszukiwarką idzie za polem przy przewijaniu popupu i zmianie okna (klawiatura).
  useLayoutEffect(() => {
    if (!open || !searchable) return;
    const place = () => {
      if (triggerRef.current) setPanelStyle(floatingStyle(triggerRef.current));
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      place();
    };
    place();
    const viewport = window.visualViewport;
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
    };
  }, [open, searchable]);

  useEffect(() => {
    if (!open || active < 0) return;
    const el = document.getElementById(optionId(active));
    // jsdom nie ma scrollIntoView.
    el?.scrollIntoView?.({ block: 'nearest' });
    // Panel z wyszukiwarką dostaje wysokość po pierwszym pomiarze, więc przewijamy też potem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, panelStyle, query]);

  const move = (delta: number) => {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(active);
    const next = pos < 0 ? 0 : Math.min(enabledIndexes.length - 1, Math.max(0, pos + delta));
    setActive(enabledIndexes[next] ?? -1);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLElement>) => {
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
      case 'End':
        // W wyszukiwarce Home i End przesuwają kursor w tekście.
        if (searchable) return;
        event.preventDefault();
        setActive((event.key === 'Home' ? enabledIndexes[0] : enabledIndexes.at(-1)) ?? -1);
        return;
      case ' ':
        if (searchable) return;
        event.preventDefault();
        choose(active);
        return;
      case 'Enter':
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
        if (!searchable && event.key.length === 1 && /\S/.test(event.key)) {
          const key = event.key.toLocaleLowerCase('pl-PL');
          const start = enabledIndexes.indexOf(active);
          const ordered = [
            ...enabledIndexes.slice(start + 1),
            ...enabledIndexes.slice(0, start + 1),
          ];
          const match = ordered.find((i) =>
            visible[i]?.label.toLocaleLowerCase('pl-PL').startsWith(key),
          );
          if (match !== undefined) setActive(match);
        }
    }
  };

  const message = error || hint;

  const items =
    visible.length === 0 ? (
      <li className="menu__empty" role="presentation">
        {t.ui.noOptions}
      </li>
    ) : (
      visible.map((option, index) => (
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
    );

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
          onClick={() => (open ? close(false) : openList())}
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
          searchable ? (
            <div
              ref={panelRef}
              className="menu select__menu select__menu--search"
              style={panelStyle}
            >
              <div className="select__search">
                <Icon name="search" className="select__search-icon" />
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  className="select__search-control"
                  aria-label={searchLabel}
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                  placeholder={searchLabel}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  onKeyDown={onListKeyDown}
                />
              </div>
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                tabIndex={-1}
                className="select__options"
                aria-labelledby={labelId}
              >
                {items}
              </ul>
            </div>
          ) : (
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
              {items}
            </ul>
          )
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
