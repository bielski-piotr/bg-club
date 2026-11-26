/** @jsxImportSource @solidjs/web */
import {
  createEffect,
  createMemo,
  createProjection,
  createSignal,
  createUniqueId,
  For,
  Show,
} from 'solid-js';
import { t } from '../../i18n';
import { hintId } from '../../ui/fieldIds';
import { normalizeSearch } from '../../ui/search';
import { ariaBool, ariaTrue, type ClassValue } from './dom';
import { Icon, type IconName } from './Icon';
import '../../ui/Field.css';
import '../../ui/Select.css';

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
  readonly class?: ClassValue;
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

/** Ustawia panel z wyszukiwarką względem okna: pod polem, a gdy brak miejsca, nad nim. */
function placePanel(panel: HTMLElement, trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewBottom = viewTop + (viewport?.height ?? window.innerHeight);
  const below = viewBottom - rect.bottom - PANEL_GAP - VIEW_MARGIN;
  const above = rect.top - viewTop - PANEL_GAP - VIEW_MARGIN;
  const down = below >= PANEL_MIN_BELOW || below >= above;
  const space = Math.max(0, down ? below : above);
  const style = panel.style;
  style.position = 'fixed';
  style.left = `${rect.left}px`;
  style.width = `${rect.width}px`;
  style.maxHeight = `${Math.min(PANEL_MAX_HEIGHT, space)}px`;
  if (down) {
    style.top = `${rect.bottom + PANEL_GAP}px`;
    style.removeProperty('bottom');
  } else {
    style.top = 'auto';
    style.bottom = `${document.documentElement.clientHeight - rect.top + PANEL_GAP}px`;
  }
}

/**
 * Lista rozwijana: przycisk + `role="listbox"` w panelu menu (DS §7, §10).
 * Klawiatura: strzałki/Enter/Spacja otwierają, strzałki, Home, End i pierwsza litera
 * przesuwają zaznaczenie, Enter/Spacja wybiera, Esc i Tab zamykają.
 */
export function Select<T extends string>(props: SelectProps<T>) {
  const id = createUniqueId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-opt-${index}`;
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(-1);
  const [query, setQuery] = createSignal('');
  let root: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let list: HTMLUListElement | undefined;
  let search: HTMLInputElement | undefined;
  let panel: HTMLDivElement | undefined;

  const searchable = () => props.searchLabel !== undefined;
  const matches = (option: SelectOption<T>, text: string) =>
    (props.matches ?? defaultMatches)(option, text);
  const selected = () => props.options.find((o) => o.value === props.value);
  const filter = (text: string) => {
    const normalized = normalizeSearch(text);
    return searchable() && normalized !== ''
      ? props.options.filter((option) => matches(option, normalized))
      : props.options;
  };
  const visible = createMemo(() => filter(query()));
  const enabledIndexes = () => visible().flatMap((o, i) => (o.disabled ? [] : [i]));

  const openList = () => {
    if (props.disabled) return;
    setQuery('');
    const index = props.options.findIndex((o) => o.value === props.value);
    const enabled = props.options.flatMap((o, i) => (o.disabled ? [] : [i]));
    setActive(enabled.includes(index) ? index : (enabled[0] ?? -1));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger?.focus();
  };

  const choose = (index: number) => {
    const option = visible()[index];
    if (!option || option.disabled) return;
    if (option.value !== props.value) props.onChange(option.value);
    close(true);
  };

  const onQueryInput = (next: string) => {
    setQuery(next);
    // Odczyt `visible()` pokazałby jeszcze starą listę (zapis ląduje w mikrozadaniu).
    const options = filter(next);
    const index = options.findIndex((o) => o.value === props.value && !o.disabled);
    setActive(index >= 0 ? index : options.findIndex((o) => !o.disabled));
  };

  createEffect(
    () => open(),
    (isOpen) => {
      if (!isOpen) return;
      (searchable() ? search : list)?.focus();
      const onPointerDown = (event: PointerEvent) => {
        if (!root?.contains(event.target as Node)) setOpen(false);
      };
      document.addEventListener('pointerdown', onPointerDown);
      return () => document.removeEventListener('pointerdown', onPointerDown);
    },
  );

  // Panel z wyszukiwarką idzie za polem przy przewijaniu popupu i zmianie okna (klawiatura).
  createEffect(
    () => open() && searchable(),
    (floating) => {
      if (!floating) return;
      const place = () => {
        if (panel && trigger) placePanel(panel, trigger);
      };
      const onScroll = (event: Event) => {
        if (event.target instanceof Node && panel?.contains(event.target)) return;
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
    },
  );

  createEffect(
    () => ({ index: open() ? active() : -1, query: query() }),
    ({ index }) => {
      if (index < 0) return;
      // jsdom nie ma scrollIntoView.
      document.getElementById(optionId(index))?.scrollIntoView?.({ block: 'nearest' });
    },
  );

  const move = (delta: number) => {
    const enabled = enabledIndexes();
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(active());
    const next = pos < 0 ? 0 : Math.min(enabled.length - 1, Math.max(0, pos + delta));
    setActive(enabled[next] ?? -1);
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (event: KeyboardEvent) => {
    const enabled = enabledIndexes();
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
        if (searchable()) return;
        event.preventDefault();
        setActive((event.key === 'Home' ? enabled[0] : enabled.at(-1)) ?? -1);
        return;
      case ' ':
        if (searchable()) return;
        event.preventDefault();
        choose(active());
        return;
      case 'Enter':
        event.preventDefault();
        choose(active());
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
        if (!searchable() && event.key.length === 1 && /\S/.test(event.key)) {
          const key = event.key.toLocaleLowerCase('pl-PL');
          const start = enabled.indexOf(active());
          const ordered = [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)];
          const match = ordered.find((i) =>
            visible()[i]?.label.toLocaleLowerCase('pl-PL').startsWith(key),
          );
          if (match !== undefined) setActive(match);
        }
    }
  };

  // Opcje czytają swój klucz zamiast porównywać się z jednym sygnałem: przy długiej liście
  // (≈ 420 stref czasowych) ruch zaznaczenia odświeża dwie opcje, a nie wszystkie (HUGE_FAN_OUT).
  // Klucz ustawiony ostatnio: przy zmianie gaśnie tylko on.
  let lastActive = -1;
  const isActive = createProjection<Record<number, boolean>>((draft) => {
    const index = open() ? active() : -1;
    if (lastActive >= 0) draft[lastActive] = false;
    if (index >= 0) draft[index] = true;
    lastActive = index;
  }, {});
  let lastSelected: string | null = null;
  const isSelected = createProjection<Record<string, boolean>>((draft) => {
    const value = props.value;
    if (lastSelected !== null) draft[lastSelected] = false;
    if (value !== null) draft[value] = true;
    lastSelected = value;
  }, {});

  const message = () => props.error || props.hint;
  const activeId = () => (active() >= 0 ? optionId(active()) : undefined);

  const items = () => (
    <Show
      when={visible().length > 0}
      fallback={
        <li class="menu__empty" role="presentation">
          {t.ui.noOptions}
        </li>
      }
    >
      <For each={visible()}>
        {(option, index) => (
          <li
            id={optionId(index())}
            role="option"
            aria-selected={ariaBool(!!isSelected[option.value])}
            aria-disabled={ariaTrue(option.disabled)}
            class={[
              'menu__item',
              {
                'menu__item--selected': !!isSelected[option.value],
                'menu__item--active': !!isActive[index()],
              },
            ]}
            onPointerMove={() => {
              if (!option.disabled) setActive(index());
            }}
            onClick={() => choose(index())}
          >
            <span class="menu__label">{option.label}</span>
            <Show when={option.meta}>
              <span class="menu__meta tnum">{option.meta}</span>
            </Show>
            <span class="menu__check">
              <Show when={isSelected[option.value]}>
                <Icon name="check" />
              </Show>
            </span>
          </li>
        )}
      </For>
    </Show>
  );

  return (
    <div
      class={['field', 'select', `select--${props.appearance ?? 'field'}`, props.class]}
      ref={(el) => (root = el)}
    >
      <span id={labelId} class={['field__label', { 'sr-only': !!props.hideLabel }]}>
        {props.label}
      </span>
      <div class="select__anchor">
        <button
          ref={(el) => (trigger = el)}
          id={`${id}-trigger`}
          type="button"
          class={[
            (props.appearance ?? 'field') === 'field' ? 'input select__field' : 'select__pill',
            {
              'select--open': open(),
              'input--error': !!props.error,
              'input--disabled': !!props.disabled,
            },
          ]}
          aria-haspopup="listbox"
          aria-expanded={ariaBool(open())}
          aria-controls={open() ? listId : undefined}
          aria-labelledby={`${labelId} ${id}-trigger`}
          aria-describedby={message() ? hintId(id) : undefined}
          aria-invalid={ariaTrue(!!props.error)}
          disabled={props.disabled}
          onClick={() => (open() ? close(false) : openList())}
          onKeyDown={onTriggerKeyDown}
        >
          <Show when={props.leadingIcon}>
            {(icon) => <Icon name={icon()} class="select__lead" />}
          </Show>
          <span class={['select__value', { 'select__value--placeholder': !selected() }]}>
            {selected()?.label ?? props.placeholder ?? t.ui.selectPlaceholder}
          </span>
          <Show when={selected()?.meta}>
            <span class="select__meta tnum">{selected()?.meta}</span>
          </Show>
          <Icon name={open() ? 'chevron-up' : 'chevron-down'} class="select__chevron" />
        </button>
        <Show when={open()}>
          <Show
            when={searchable()}
            fallback={
              <ul
                ref={(el) => (list = el)}
                id={listId}
                role="listbox"
                tabindex={-1}
                class="menu select__menu"
                aria-labelledby={labelId}
                aria-activedescendant={activeId()}
                onKeyDown={onListKeyDown}
              >
                {items()}
              </ul>
            }
          >
            <div ref={(el) => (panel = el)} class="menu select__menu select__menu--search">
              <div class="select__search">
                <Icon name="search" class="select__search-icon" />
                <input
                  ref={(el) => (search = el)}
                  type="text"
                  role="combobox"
                  class="select__search-control"
                  aria-label={props.searchLabel}
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeId()}
                  placeholder={props.searchLabel}
                  autocomplete="off"
                  autocorrect="off"
                  spellcheck="false"
                  enterkeyhint="done"
                  value={query()}
                  onInput={(event) => onQueryInput(event.currentTarget.value)}
                  onKeyDown={onListKeyDown}
                />
              </div>
              <ul
                ref={(el) => (list = el)}
                id={listId}
                role="listbox"
                tabindex={-1}
                class="select__options"
                aria-labelledby={labelId}
              >
                {items()}
              </ul>
            </div>
          </Show>
        </Show>
      </div>
      <Show when={message()}>
        <p id={hintId(id)} class={['field__hint', { 'field__hint--error': !!props.error }]}>
          {message()}
        </p>
      </Show>
    </div>
  );
}
