import type { JSX } from '@solidjs/web';
import { createSignal, createUniqueId, omit, Show } from 'solid-js';
import { t } from '../i18n';
import { hintId } from './fieldIds';
import { ariaBool, ariaTrue, setRef, createSlot, type ClassValue } from './dom';
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
  readonly children: JSX.Element;
  readonly class?: ClassValue;
}

/** Etykieta nad polem, podpowiedź lub błąd pod polem. */
export function FieldFrame(props: FieldFrameProps) {
  const message = () => props.error || props.hint;
  return (
    <div class={['field', props.class]}>
      <label for={props.id} class={['field__label', { 'sr-only': !!props.hideLabel }]}>
        {props.label}
        <Show when={props.optional}>
          <span class="field__optional"> {t.ui.optional}</span>
        </Show>
      </label>
      {props.children}
      <Show when={message()}>
        <p id={hintId(props.id)} class={['field__hint', { 'field__hint--error': !!props.error }]}>
          {message()}
        </p>
      </Show>
    </div>
  );
}

export interface TextFieldProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  readonly label: string;
  readonly optional?: boolean | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly hideLabel?: boolean | undefined;
  /** Ikona 16 px przed wartością (data, godzina, strefa). */
  readonly leadingIcon?: IconName | undefined;
  /** Element po wartości: jednostka („cm”) albo ikona. */
  readonly trailing?: JSX.Element | undefined;
  /** Wartość liczbowa Bricolage 16/20/700 (pole z jednostką). */
  readonly numeric?: boolean | undefined;
  /** DM Mono (wygenerowany hook). */
  readonly mono?: boolean | undefined;
  readonly class?: ClassValue;
}

/**
 * Pole tekstowe h48 z etykietą. `readonly` daje wariant tylko do odczytu
 * (tło #F1F3F9 bez ramki; atrybut `readonly`), `error` ramkę 1,5 px #D63A3A i komunikat pod polem.
 * Wartość jak w każdym polu Solid: `value` + `onInput` (szkic w sygnale rodzica).
 */
export function TextField(props: TextFieldProps) {
  const autoId = createUniqueId();
  const id = () => (typeof props.id === 'string' ? props.id : autoId);
  const trailing = createSlot(() => props.trailing);
  const rest = omit(
    props,
    'label',
    'optional',
    'hint',
    'error',
    'hideLabel',
    'leadingIcon',
    'trailing',
    'numeric',
    'mono',
    'id',
    'class',
    'readonly',
    'disabled',
    'ref',
  );
  return (
    <FieldFrame
      id={id()}
      label={props.label}
      optional={props.optional}
      hint={props.hint}
      error={props.error}
      hideLabel={props.hideLabel}
      class={props.class}
    >
      <div
        class={[
          'input',
          {
            'input--error': !!props.error,
            'input--readonly': !!props.readonly,
            'input--disabled': !!props.disabled,
          },
        ]}
      >
        <Show when={props.leadingIcon}>{(icon) => <Icon name={icon()} class="input__icon" />}</Show>
        <input
          ref={(el) => setRef(props.ref, el)}
          id={id()}
          class={[
            'input__control',
            { 'input__control--numeric': !!props.numeric, 'input__control--mono': !!props.mono },
          ]}
          aria-invalid={ariaTrue(!!props.error)}
          aria-describedby={props.error || props.hint ? hintId(id()) : undefined}
          readonly={props.readonly}
          disabled={props.disabled}
          {...rest}
        />
        <Show when={trailing()}>
          <span class="input__trailing">{trailing()}</span>
        </Show>
      </div>
    </FieldFrame>
  );
}

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing'>;

/** Pole hasła z przyciskiem „oko” pokazującym wpisaną wartość. */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = createSignal(false);
  return (
    <TextField
      {...props}
      type={visible() ? 'text' : 'password'}
      autocomplete={props.autocomplete ?? 'current-password'}
      trailing={
        <button
          type="button"
          class="input__toggle"
          aria-label={visible() ? t.ui.hidePassword : t.ui.showPassword}
          aria-pressed={ariaBool(visible())}
          onClick={() => setVisible((v) => !v)}
          disabled={props.disabled}
        >
          <Icon name={visible() ? 'eye-off' : 'eye'} />
        </button>
      }
    />
  );
}

export interface SearchFieldProps extends Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type' | 'value' | 'onInput' | 'onChange'
> {
  /** Etykieta dla czytnika ekranu (wizualnie zastępuje ją placeholder). */
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly class?: ClassValue;
}

/** Wyszukiwarka: pigułka h44 na tle #F1F3F9 z lupą. Esc czyści wartość. */
export function SearchField(props: SearchFieldProps) {
  const id = createUniqueId();
  const rest = omit(props, 'label', 'value', 'onValueChange', 'class', 'onKeyDown');
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && props.value !== '') {
      event.preventDefault();
      event.stopPropagation();
      props.onValueChange('');
    }
    (props.onKeyDown as ((event: KeyboardEvent) => void) | undefined)?.(event);
  };
  return (
    <div class={['search', props.class]} role="search">
      <label for={id} class="sr-only">
        {props.label}
      </label>
      <Icon name="search" class="search__icon" />
      <input
        id={id}
        type="search"
        class="search__control"
        value={props.value}
        onInput={(event) => props.onValueChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        enterkeyhint="search"
        autocomplete="off"
        {...rest}
      />
      <Show when={props.value !== ''}>
        <button
          type="button"
          class="search__clear"
          aria-label={t.ui.clearSearch}
          onClick={() => props.onValueChange('')}
        >
          <Icon name="x" size={14} />
        </button>
      </Show>
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

/**
 * Stepper liczbowy h48 z przyciskami − / +. Wartość jest `role="spinbutton"`:
 * strzałki góra/dół, Home i End zmieniają ją z klawiatury.
 */
export function Stepper(props: StepperProps) {
  const id = createUniqueId();
  const labelId = `${id}-label`;
  const min = () => props.min ?? 0;
  const max = () => props.max ?? Number.MAX_SAFE_INTEGER;
  const step = () => props.step ?? 1;
  const message = () => props.error || props.hint;
  const set = (next: number) => {
    const clamped = Math.min(max(), Math.max(min(), next));
    if (clamped !== props.value) props.onChange(clamped);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (props.disabled) return;
    const value = props.value;
    const actions: Record<string, () => void> = {
      ArrowUp: () => set(value + step()),
      ArrowRight: () => set(value + step()),
      ArrowDown: () => set(value - step()),
      ArrowLeft: () => set(value - step()),
      PageUp: () => set(value + step() * 10),
      PageDown: () => set(value - step() * 10),
      Home: () => set(min()),
      End: () => {
        if (max() !== Number.MAX_SAFE_INTEGER) set(max());
      },
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };
  return (
    <div class="field">
      <span id={labelId} class="field__label">
        {props.label}
      </span>
      <div
        class={[
          'input',
          'stepper',
          { 'input--error': !!props.error, 'input--disabled': !!props.disabled },
        ]}
      >
        <button
          type="button"
          class="icon-btn icon-btn--36"
          aria-label={t.ui.decrease}
          onClick={() => set(props.value - step())}
          disabled={props.disabled || props.value <= min()}
          tabindex={-1}
        >
          <Icon name="minus" />
        </button>
        <div
          role="spinbutton"
          tabindex={props.disabled ? -1 : 0}
          class="stepper__value tnum"
          aria-labelledby={labelId}
          aria-describedby={message() ? hintId(id) : undefined}
          aria-invalid={ariaTrue(!!props.error)}
          aria-valuenow={props.value}
          aria-valuemin={min()}
          aria-valuemax={max() === Number.MAX_SAFE_INTEGER ? undefined : max()}
          aria-disabled={ariaTrue(props.disabled)}
          onKeyDown={onKeyDown}
        >
          {props.value}
        </div>
        <button
          type="button"
          class="icon-btn icon-btn--36"
          aria-label={t.ui.increase}
          onClick={() => set(props.value + step())}
          disabled={props.disabled || props.value >= max()}
          tabindex={-1}
        >
          <Icon name="plus" />
        </button>
      </div>
      <Show when={message()}>
        <p id={hintId(id)} class={['field__hint', { 'field__hint--error': !!props.error }]}>
          {message()}
        </p>
      </Show>
    </div>
  );
}
