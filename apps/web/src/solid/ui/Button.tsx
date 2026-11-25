/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import { omit, Show } from 'solid-js';
import { t } from '../../i18n';
import { ariaTrue, callHandler, type ClassValue } from './dom';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import '../../ui/Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';
/** `md` = h44 (stopka, CTA), `sm` = h36 (nagłówek), DS §9. */
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  /** Ikona 16 px przed etykietą (odstęp 6). */
  readonly icon?: IconName | undefined;
  /** Pełna szerokość (CTA w pustych stanach). */
  readonly fullWidth?: boolean | undefined;
  /**
   * Trwa akcja: spinner zamiast ikony, `aria-busy`, kliknięcia są ignorowane.
   * Przycisk zostaje w kolejności fokusu, żeby fokus nie uciekał w trakcie zapisu.
   */
  readonly loading?: boolean | undefined;
  readonly class?: ClassValue;
  readonly children: JSX.Element;
}

export function Button(props: ButtonProps) {
  const rest = omit(
    props,
    'variant',
    'size',
    'icon',
    'fullWidth',
    'loading',
    'type',
    'class',
    'children',
    'onClick',
  );
  const handleClick = (event: MouseEvent) => {
    if (props.loading) {
      event.preventDefault();
      return;
    }
    callHandler(props.onClick, event);
  };
  return (
    <button
      type={props.type ?? 'button'}
      class={[
        'btn',
        `btn--${props.variant ?? 'primary'}`,
        `btn--${props.size ?? 'md'}`,
        { 'btn--full': !!props.fullWidth, 'btn--loading': !!props.loading },
        props.class,
      ]}
      aria-busy={ariaTrue(props.loading)}
      aria-disabled={ariaTrue(props.loading)}
      onClick={handleClick}
      {...rest}
    >
      <Show
        when={props.loading}
        fallback={<Show when={props.icon}>{(icon) => <Icon name={icon()} />}</Show>}
      >
        <Spinner size={16} />
      </Show>
      <span class="btn__label">{props.children}</span>
      <Show when={props.loading}>
        <span class="sr-only">{t.ui.loading}</span>
      </Show>
    </button>
  );
}

export interface IconButtonProps extends Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  readonly icon: IconName;
  /** Etykieta dla czytnika ekranu i podpowiedź (`aria-label`). */
  readonly label: string;
  /** 36 (nagłówek, stepper) albo 32 (⋯ w wierszu), DS §9. */
  readonly size?: 36 | 32 | undefined;
  readonly class?: ClassValue;
}

/** Okrągły przycisk z ikoną na tle #F1F3F9: zamknij, wróć, więcej, ±. */
export function IconButton(props: IconButtonProps) {
  const rest = omit(props, 'icon', 'label', 'size', 'type', 'class');
  return (
    <button
      type={props.type ?? 'button'}
      class={['icon-btn', `icon-btn--${props.size ?? 36}`, props.class]}
      aria-label={props.label}
      title={props.label}
      {...rest}
    >
      <Icon name={props.icon} />
    </button>
  );
}

interface TextLinkBase {
  readonly children: JSX.Element;
  /** Strzałka w prawo po etykiecie (domyślnie tak, jak „Zobacz więcej”). */
  readonly chevron?: boolean | undefined;
  readonly class?: ClassValue;
}

export type TextLinkProps = TextLinkBase &
  (
    | ({ readonly href: string } & Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>)
    | ({ readonly href?: undefined } & JSX.ButtonHTMLAttributes<HTMLButtonElement>)
  );

/** Link tekstowy 14/18/600 w kolorze akcentu z opcjonalną strzałką (DS §6, §9). */
export function TextLink(props: TextLinkProps) {
  const buttonRest = omit(
    props,
    'children',
    'chevron',
    'class',
    'href',
  ) as JSX.ButtonHTMLAttributes<HTMLButtonElement>;
  const anchorRest = omit(
    props,
    'children',
    'chevron',
    'class',
  ) as JSX.AnchorHTMLAttributes<HTMLAnchorElement>;
  const content = () => (
    <>
      <span>{props.children}</span>
      <Show when={props.chevron ?? true}>
        <Icon name="chevron-right" />
      </Show>
    </>
  );
  return (
    <Show
      when={props.href !== undefined}
      fallback={
        <button type="button" class={['text-link', props.class]} {...buttonRest}>
          {content()}
        </button>
      }
    >
      <a class={['text-link', props.class]} {...anchorRest}>
        {content()}
      </a>
    </Show>
  );
}
