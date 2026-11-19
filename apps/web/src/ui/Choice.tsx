import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import './Choice.css';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange'
> {
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

/** Pole wyboru 22×22, promień 7. Natywny `<input>` zachowuje obsługę klawiatury. */
export function Checkbox({
  label,
  checked,
  onCheckedChange,
  className,
  disabled,
  ...rest
}: CheckboxProps) {
  return (
    <label className={cx('choice', disabled && 'choice--disabled', className)}>
      <input
        type="checkbox"
        className="choice__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        {...rest}
      />
      <span className="checkbox" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      <span className="choice__label">{label}</span>
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
  readonly className?: string | undefined;
}

/** Grupa przycisków radio 22×22 w pionie. */
export function RadioGroup<T extends string>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  name,
  disabled = false,
  className,
}: GroupProps<T>) {
  const autoName = useId();
  return (
    <fieldset className={cx('group', 'group--column', className)} disabled={disabled}>
      <legend className={cx('group__legend', hideLegend && 'sr-only')}>{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cx('choice', (disabled || option.disabled) && 'choice--disabled')}
        >
          <input
            type="radio"
            className="choice__input"
            name={name ?? autoName}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="radio" aria-hidden="true" />
          <span className="choice__label">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Wybór jednej z kilku opcji jako pigułki. Semantycznie to
 * grupa radio: strzałki przenoszą wybór, Tab przechodzi do następnej kontrolki.
 * Do przełączania widoków służy `Tabs`.
 */
export function SegmentedControl<T extends string>({
  legend,
  hideLegend = true,
  options,
  value,
  onChange,
  name,
  disabled = false,
  className,
}: GroupProps<T>) {
  const autoName = useId();
  return (
    <fieldset className={cx('group', className)} disabled={disabled}>
      <legend className={cx('group__legend', hideLegend && 'sr-only')}>{legend}</legend>
      <div className="pills">
        {options.map((option) => (
          <label key={option.value} className="pill-choice">
            <input
              type="radio"
              className="choice__input"
              name={name ?? autoName}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="pill">{option.label}</span>
          </label>
        ))}
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
  readonly className?: string | undefined;
}

/** Wielokrotny wybór jako chipy h32 z ptaszkiem (np. „Sumuje kategorie”). */
export function ChipGroup<T extends string>({
  legend,
  hideLegend = false,
  options,
  values,
  onChange,
  disabled = false,
  className,
}: ChipGroupProps<T>) {
  const toggle = (value: T, on: boolean) => {
    const next = on ? [...values, value] : values.filter((v) => v !== value);
    // Kolejność jak w opcjach, niezależnie od kolejności klikania.
    onChange(options.map((o) => o.value).filter((v) => next.includes(v)));
  };
  return (
    <fieldset className={cx('group', className)} disabled={disabled}>
      <legend className={cx('group__legend', hideLegend && 'sr-only')}>{legend}</legend>
      <div className="pills">
        {options.map((option) => {
          const on = values.includes(option.value);
          return (
            <label key={option.value} className="pill-choice">
              <input
                type="checkbox"
                className="choice__input"
                checked={on}
                disabled={option.disabled}
                onChange={(event) => toggle(option.value, event.target.checked)}
              />
              <span className={cx('chip-toggle', on && 'chip-toggle--on')}>
                {on ? <Icon name="check" size={14} /> : null}
                {option.label}
              </span>
            </label>
          );
        })}
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
  readonly className?: string | undefined;
}

/** Wybór koloru: kółka 28, wybrane 22 w pierścieniu 2 px. */
export function ColorSwatches<T extends string>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  className,
}: ColorSwatchesProps<T>) {
  const name = useId();
  return (
    <fieldset className={cx('group', className)}>
      <legend className={cx('group__legend', hideLegend && 'sr-only')}>{legend}</legend>
      <div className="swatches">
        {options.map((option) => (
          <label key={option.value} className="swatch" title={option.label}>
            <input
              type="radio"
              className="choice__input"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-label={option.label}
            />
            <span className="swatch__dot" style={{ background: option.color }} aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
