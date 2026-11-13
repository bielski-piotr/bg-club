import { useId, type CSSProperties, type InputHTMLAttributes } from 'react';
import { cx } from './cx';
import './Controls.css';

export interface SwitchProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Przełącznik 40×24 (DS §18, ma pierwszeństwo przed §10 wg Q19): etykieta po lewej,
 * przełącznik po prawej. `role="switch"`; Spacja i Enter przełączają.
 */
export function Switch({
  label,
  checked,
  onCheckedChange,
  description,
  disabled = false,
  className,
}: SwitchProps) {
  const id = useId();
  return (
    <div className={cx('switch-row', disabled && 'switch-row--disabled', className)}>
      <span className="switch-row__text">
        <label htmlFor={id} className="switch-row__label">
          {label}
        </label>
        {description ? (
          <span id={`${id}-desc`} className="switch-row__desc">
            {description}
          </span>
        ) : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="switch"
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className="switch__knob" aria-hidden="true" />
      </button>
    </div>
  );
}

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max'
> {
  readonly label: string;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
}

/**
 * Suwak (DS §18): etykieta, tor h4 z wypełnieniem akcentu, gałka 20, wartość po prawej.
 * Natywny `input type="range"`: strzałki, PageUp/PageDown, Home i End.
 */
export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  ...rest
}: SliderProps) {
  const id = useId();
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={cx('slider', disabled && 'slider--disabled', className)}>
      <label htmlFor={id} className="slider__label">
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(Number(event.target.value))}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        {...rest}
      />
      <output htmlFor={id} className="slider__value tnum" aria-hidden="true">
        {value}
      </output>
    </div>
  );
}
