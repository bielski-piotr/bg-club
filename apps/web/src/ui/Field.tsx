import {
  useId,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { t } from '../i18n';
import { cx } from './cx';
import { hintId } from './fieldIds';
import { Icon, type IconName } from './Icon';
import './Button.css';
import './Field.css';

export interface FieldFrameProps {
  readonly id: string;
  readonly label: string;
  /** Dopisuje „(opcjonalnie)” do etykiety. */
  readonly optional?: boolean | undefined;
  readonly hint?: string | undefined;
  /** Komunikat błędu (zdanie). Zastępuje podpowiedź. */
  readonly error?: string | undefined;
  /** Etykieta jest dla czytników ekranu, ale niewidoczna (np. wyszukiwarka). */
  readonly hideLabel?: boolean | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Etykieta nad polem, podpowiedź lub błąd pod polem. */
export function FieldFrame({
  id,
  label,
  optional = false,
  hint,
  error,
  hideLabel = false,
  children,
  className,
}: FieldFrameProps) {
  const message = error || hint;
  return (
    <div className={cx('field', className)}>
      <label htmlFor={id} className={cx('field__label', hideLabel && 'sr-only')}>
        {label}
        {optional ? <span className="field__optional"> {t.ui.optional}</span> : null}
      </label>
      {children}
      {message ? (
        <p id={hintId(id)} className={cx('field__hint', error && 'field__hint--error')}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  readonly label: string;
  readonly optional?: boolean | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly hideLabel?: boolean | undefined;
  /** Ikona 16 px przed wartością (data, godzina, strefa). */
  readonly leadingIcon?: IconName | undefined;
  /** Element po wartości: jednostka („cm”) albo ikona. */
  readonly trailing?: ReactNode | undefined;
  /** Wartość liczbowa Bricolage 16/20/700 (pole z jednostką). */
  readonly numeric?: boolean | undefined;
  /** DM Mono (wygenerowany hook). */
  readonly mono?: boolean | undefined;
  readonly ref?: Ref<HTMLInputElement> | undefined;
}

/**
 * Pole tekstowe h48 z etykietą. `readOnly` daje wariant tylko do odczytu
 * (tło #F1F3F9 bez ramki), `error` ramkę 1,5 px #D63A3A i komunikat pod polem.
 */
export function TextField({
  label,
  optional,
  hint,
  error,
  hideLabel,
  leadingIcon,
  trailing,
  numeric = false,
  mono = false,
  id: idProp,
  className,
  readOnly,
  disabled,
  ref,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const described = error || hint ? hintId(id) : undefined;
  return (
    <FieldFrame
      id={id}
      label={label}
      optional={optional ?? false}
      hint={hint}
      error={error}
      hideLabel={hideLabel ?? false}
      className={className}
    >
      <div
        className={cx(
          'input',
          error && 'input--error',
          readOnly && 'input--readonly',
          disabled && 'input--disabled',
        )}
      >
        {leadingIcon ? <Icon name={leadingIcon} className="input__icon" /> : null}
        <input
          ref={ref}
          id={id}
          className={cx(
            'input__control',
            numeric && 'input__control--numeric',
            mono && 'input__control--mono',
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          readOnly={readOnly}
          disabled={disabled}
          {...rest}
        />
        {trailing ? <span className="input__trailing">{trailing}</span> : null}
      </div>
    </FieldFrame>
  );
}

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing'>;

/** Pole hasła z przyciskiem „oko” pokazującym wpisaną wartość. */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      autoComplete={props.autoComplete ?? 'current-password'}
      trailing={
        <button
          type="button"
          className="input__toggle"
          aria-label={visible ? t.ui.hidePassword : t.ui.showPassword}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          disabled={props.disabled}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} />
        </button>
      }
    />
  );
}

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type' | 'value' | 'onChange'
> {
  /** Etykieta dla czytnika ekranu (wizualnie zastępuje ją placeholder). */
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
}

/** Wyszukiwarka: pigułka h44 na tle #F1F3F9 z lupą. Esc czyści wartość. */
export function SearchField({
  label,
  value,
  onValueChange,
  className,
  onKeyDown,
  ...rest
}: SearchFieldProps) {
  const id = useId();
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && value !== '') {
      event.preventDefault();
      event.stopPropagation();
      onValueChange('');
    }
    onKeyDown?.(event);
  };
  return (
    <div className={cx('search', className)} role="search">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="search" className="search__icon" />
      <input
        id={id}
        type="search"
        className="search__control"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        enterKeyHint="search"
        autoComplete="off"
        {...rest}
      />
      {value !== '' ? (
        <button
          type="button"
          className="search__clear"
          aria-label={t.ui.clearSearch}
          onClick={() => onValueChange('')}
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}

export interface StepperProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly hint?: string | undefined;
  /** Komunikat błędu (zdanie): ramka 1,5 px #D63A3A, zastępuje podpowiedź. */
  readonly error?: string | undefined;
  readonly disabled?: boolean | undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Stepper liczbowy h48 z przyciskami − / +. Wartość jest `role="spinbutton"`:
 * strzałki góra/dół, Home i End zmieniają ją z klawiatury.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  hint,
  error,
  disabled = false,
}: StepperProps) {
  const message = error || hint;
  const id = useId();
  const labelId = `${id}-label`;
  const set = (next: number) => {
    const clamped = clamp(next, min, max);
    if (clamped !== value) onChange(clamped);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const actions: Record<string, () => void> = {
      ArrowUp: () => set(value + step),
      ArrowRight: () => set(value + step),
      ArrowDown: () => set(value - step),
      ArrowLeft: () => set(value - step),
      PageUp: () => set(value + step * 10),
      PageDown: () => set(value - step * 10),
      Home: () => set(min),
      End: () => {
        if (max !== Number.MAX_SAFE_INTEGER) set(max);
      },
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };
  return (
    <div className="field">
      <span id={labelId} className="field__label">
        {label}
      </span>
      <div
        className={cx('input', 'stepper', error && 'input--error', disabled && 'input--disabled')}
      >
        <button
          type="button"
          className="icon-btn icon-btn--36"
          aria-label={t.ui.decrease}
          onClick={() => set(value - step)}
          disabled={disabled || value <= min}
          tabIndex={-1}
        >
          <Icon name="minus" />
        </button>
        <div
          role="spinbutton"
          tabIndex={disabled ? -1 : 0}
          className="stepper__value tnum"
          aria-labelledby={labelId}
          aria-describedby={message ? hintId(id) : undefined}
          aria-invalid={error ? true : undefined}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
        >
          {value}
        </div>
        <button
          type="button"
          className="icon-btn icon-btn--36"
          aria-label={t.ui.increase}
          onClick={() => set(value + step)}
          disabled={disabled || value >= max}
          tabIndex={-1}
        >
          <Icon name="plus" />
        </button>
      </div>
      {message ? (
        <p id={hintId(id)} className={cx('field__hint', error && 'field__hint--error')}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
