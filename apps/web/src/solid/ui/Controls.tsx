/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, Show } from 'solid-js';
import { ariaBool, type ClassValue } from './dom';
import '../../ui/Controls.css';

export interface SwitchProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly class?: ClassValue;
}

/**
 * Przełącznik 40×24 (DS §18, ma pierwszeństwo przed §10 wg Q19): etykieta po lewej,
 * przełącznik po prawej. `role="switch"`; Spacja i Enter przełączają.
 */
export function Switch(props: SwitchProps) {
  const id = createUniqueId();
  return (
    <div class={['switch-row', { 'switch-row--disabled': !!props.disabled }, props.class]}>
      <span class="switch-row__text">
        <label for={id} class="switch-row__label">
          {props.label}
        </label>
        <Show when={props.description}>
          <span id={`${id}-desc`} class="switch-row__desc">
            {props.description}
          </span>
        </Show>
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={ariaBool(props.checked)}
        aria-describedby={props.description ? `${id}-desc` : undefined}
        class="switch"
        disabled={props.disabled}
        onClick={() => props.onCheckedChange(!props.checked)}
      >
        <span class="switch__knob" aria-hidden="true" />
      </button>
    </div>
  );
}

export interface SliderProps extends Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'onInput' | 'min' | 'max' | 'step'
> {
  readonly label: string;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  /** Tekst wartości obok suwaka i dla czytnika ekranu, np. „150%”. */
  readonly formatValue?: ((value: number) => string) | undefined;
  readonly class?: ClassValue;
}

/**
 * Suwak (DS §18): etykieta, tor h4 z wypełnieniem akcentu, gałka 20, wartość po prawej.
 * Natywny `input type="range"`: strzałki, PageUp/PageDown, Home i End.
 */
export function Slider(props: SliderProps) {
  const id = createUniqueId();
  const rest = omit(
    props,
    'label',
    'value',
    'onValueChange',
    'min',
    'max',
    'step',
    'formatValue',
    'disabled',
    'class',
  );
  const min = () => props.min ?? 0;
  const max = () => props.max ?? 100;
  const fill = () => (max() > min() ? ((props.value - min()) / (max() - min())) * 100 : 0);
  return (
    <div class={['slider', { 'slider--disabled': !!props.disabled }, props.class]}>
      <label for={id} class="slider__label">
        {props.label}
      </label>
      <input
        id={id}
        type="range"
        class="slider__input"
        min={min()}
        max={max()}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        onInput={(event) => props.onValueChange(Number(event.currentTarget.value))}
        style={{ '--fill': `${fill()}%` }}
        aria-valuetext={props.formatValue?.(props.value)}
        {...rest}
      />
      <output for={id} class="slider__value tnum" aria-hidden="true">
        {props.formatValue ? props.formatValue(props.value) : props.value}
      </output>
    </div>
  );
}
