/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import { createUniqueId, For, omit, Show } from 'solid-js';
import type { ClassValue } from './dom';
import { Icon } from './Icon';
import '../../ui/Choice.css';

/*
 * Pola wyboru jak w React są sterowane wartością z propsów: po kliknięciu natywny stan wraca
 * do propsa, a zmienia go dopiero nowa wartość od rodzica (skill solid-2.0, „Inputs aren't
 * strictly controlled”).
 */

export interface CheckboxProps extends Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange' | 'checked'
> {
  readonly label: JSX.Element;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly class?: ClassValue;
}

/** Pole wyboru 22×22, promień 7 (DS §15). Natywny `<input>` zachowuje obsługę klawiatury. */
export function Checkbox(props: CheckboxProps) {
  const rest = omit(props, 'label', 'checked', 'onCheckedChange', 'class', 'disabled');
  return (
    <label class={['choice', { 'choice--disabled': !!props.disabled }, props.class]}>
      <input
        type="checkbox"
        class="choice__input"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          event.currentTarget.checked = props.checked;
          props.onCheckedChange(next);
        }}
        {...rest}
      />
      <span class="checkbox" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      <span class="choice__label">{props.label}</span>
    </label>
  );
}

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean | undefined;
}

interface GroupProps<T extends string> {
  /** Podpis grupy (`<legend>`). */
  readonly legend: string;
  readonly hideLegend?: boolean | undefined;
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly name?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly class?: ClassValue;
}

/** Grupa przycisków radio 22×22 (DS §15) w pionie. */
export function RadioGroup<T extends string>(props: GroupProps<T>) {
  const autoName = createUniqueId();
  return (
    <fieldset class={['group', 'group--column', props.class]} disabled={props.disabled}>
      <legend class={['group__legend', { 'sr-only': !!props.hideLegend }]}>{props.legend}</legend>
      <For each={props.options}>
        {(option) => (
          <label class={['choice', { 'choice--disabled': !!(props.disabled || option.disabled) }]}>
            <input
              type="radio"
              class="choice__input"
              name={props.name ?? autoName}
              value={option.value}
              checked={props.value === option.value}
              disabled={option.disabled}
              onChange={() => props.onChange(option.value)}
            />
            <span class="radio" aria-hidden="true" />
            <span class="choice__label">{option.label}</span>
          </label>
        )}
      </For>
    </fieldset>
  );
}

/**
 * Wybór jednej z kilku opcji jako pigułki (DS §10 „segmented filter”, §18). Semantycznie to
 * grupa radio: strzałki przenoszą wybór, Tab przechodzi do następnej kontrolki.
 * Do przełączania widoków służy `Tabs`.
 */
export function SegmentedControl<T extends string>(props: GroupProps<T>) {
  const autoName = createUniqueId();
  return (
    <fieldset class={['group', props.class]} disabled={props.disabled}>
      <legend class={['group__legend', { 'sr-only': props.hideLegend ?? true }]}>
        {props.legend}
      </legend>
      <div class="pills">
        <For each={props.options}>
          {(option) => (
            <label class="pill-choice">
              <input
                type="radio"
                class="choice__input"
                name={props.name ?? autoName}
                value={option.value}
                checked={props.value === option.value}
                disabled={option.disabled}
                onChange={() => props.onChange(option.value)}
              />
              <span class="pill">{option.label}</span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}

export interface ChipGroupProps<T extends string> {
  readonly legend: string;
  readonly hideLegend?: boolean | undefined;
  readonly options: readonly ChoiceOption<T>[];
  readonly values: readonly T[];
  readonly onChange: (values: T[]) => void;
  readonly disabled?: boolean | undefined;
  readonly class?: ClassValue;
}

/** Wielokrotny wybór jako chipy h32 z ptaszkiem (DS §18, np. „Sumuje kategorie”). */
export function ChipGroup<T extends string>(props: ChipGroupProps<T>) {
  const toggle = (value: T, on: boolean) => {
    const next = on ? [...props.values, value] : props.values.filter((v) => v !== value);
    // Kolejność jak w opcjach, niezależnie od kolejności klikania.
    props.onChange(props.options.map((o) => o.value).filter((v) => next.includes(v)));
  };
  return (
    <fieldset class={['group', props.class]} disabled={props.disabled}>
      <legend class={['group__legend', { 'sr-only': !!props.hideLegend }]}>{props.legend}</legend>
      <div class="pills">
        <For each={props.options}>
          {(option) => {
            const on = () => props.values.includes(option.value);
            return (
              <label class="pill-choice">
                <input
                  type="checkbox"
                  class="choice__input"
                  checked={on()}
                  disabled={option.disabled}
                  onChange={(event) => {
                    const next = event.currentTarget.checked;
                    event.currentTarget.checked = on();
                    toggle(option.value, next);
                  }}
                />
                <span class={['chip-toggle', { 'chip-toggle--on': on() }]}>
                  <Show when={on()}>
                    <Icon name="check" size={14} />
                  </Show>
                  {option.label}
                </span>
              </label>
            );
          }}
        </For>
      </div>
    </fieldset>
  );
}

export interface SwatchOption<T extends string> {
  readonly value: T;
  /** Nazwa koloru dla czytnika ekranu. */
  readonly label: string;
  /** Wartość CSS koloru (np. `var(--c-avatar-0)`). */
  readonly color: string;
}

export interface ColorSwatchesProps<T extends string> {
  readonly legend: string;
  readonly hideLegend?: boolean | undefined;
  readonly options: readonly SwatchOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly class?: ClassValue;
}

/** Wybór koloru (DS §18 „Color swatches”): kółka 28, wybrane 22 w pierścieniu 2 px. */
export function ColorSwatches<T extends string>(props: ColorSwatchesProps<T>) {
  const name = createUniqueId();
  return (
    <fieldset class={['group', props.class]}>
      <legend class={['group__legend', { 'sr-only': !!props.hideLegend }]}>{props.legend}</legend>
      <div class="swatches">
        <For each={props.options}>
          {(option) => (
            <label class="swatch" title={option.label}>
              <input
                type="radio"
                class="choice__input"
                name={name}
                value={option.value}
                checked={props.value === option.value}
                onChange={() => props.onChange(option.value)}
                aria-label={option.label}
              />
              <span class="swatch__dot" style={{ background: option.color }} aria-hidden="true" />
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}
