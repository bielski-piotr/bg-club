import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { t } from '../i18n';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';
/** `md` = h44 (stopka, CTA), `sm` = h36 (nagłówek). */
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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
  readonly children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth = false,
  loading = false,
  type = 'button',
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      type={type}
      className={cx(
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        fullWidth && 'btn--full',
        loading && 'btn--loading',
        className,
      )}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} /> : null}
      <span className="btn__label">{children}</span>
      {loading ? <span className="sr-only">{t.ui.loading}</span> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: IconName;
  /** Etykieta dla czytnika ekranu i podpowiedź (`aria-label`). */
  readonly label: string;
  /** 36 (nagłówek, stepper) albo 32 (⋯ w wierszu). */
  readonly size?: 36 | 32 | undefined;
}

/** Okrągły przycisk z ikoną na tle #F1F3F9: zamknij, wróć, więcej, ±. */
export function IconButton({
  icon,
  label,
  size = 36,
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx('icon-btn', `icon-btn--${size}`, className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

interface TextLinkBase {
  readonly children: ReactNode;
  /** Strzałka w prawo po etykiecie (domyślnie tak, jak „Zobacz więcej”). */
  readonly chevron?: boolean | undefined;
  readonly className?: string | undefined;
}

export type TextLinkProps = TextLinkBase &
  (
    | ({ readonly href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>)
    | ({ readonly href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
  );

/** Link tekstowy 14/18/600 w kolorze akcentu z opcjonalną strzałką. */
export function TextLink({ children, chevron = true, className, ...rest }: TextLinkProps) {
  const content = (
    <>
      <span>{children}</span>
      {chevron ? <Icon name="chevron-right" /> : null}
    </>
  );
  if (rest.href !== undefined) {
    return (
      <a className={cx('text-link', className)} {...rest}>
        {content}
      </a>
    );
  }
  const { type = 'button', ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={cx('text-link', className)} {...buttonRest}>
      {content}
    </button>
  );
}
