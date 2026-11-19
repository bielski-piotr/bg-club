import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import './Badge.css';

/**
 * Słownik statusów: accent, neutral, warning, danger, success.
 * `ink` = tekst #161A2B na #F1F3F9 (chip „Gry wybrane”).
 */
export type Tone = 'accent' | 'neutral' | 'ink' | 'warning' | 'danger' | 'success';

export interface BadgeProps {
  readonly tone?: Tone | undefined;
  /** Badge na wierszu akcentu (białe tło, tekst akcentu), np. „Ty” bieżącego użytkownika. */
  readonly onAccent?: boolean | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Badge wiersza: pigułka 2/8, 11/14/600, np. „Admin”, „Ty”, „Prowadzi”. */
export function Badge({ tone = 'neutral', onAccent = false, children, className }: BadgeProps) {
  return (
    <span className={cx('badge', `tone--${tone}`, onAccent && 'badge--on-accent', className)}>
      {children}
    </span>
  );
}

export interface StatusChipProps {
  readonly tone: Tone;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Chip statusu z kropką: h24, 12/16/600, np. „Głosowanie otwarte”. */
export function StatusChip({ tone, children, className }: StatusChipProps) {
  return (
    <span className={cx('status-chip', `tone--${tone}`, className)}>
      <span className="status-chip__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export interface MetaChipProps {
  readonly icon?: IconName | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

/** Chip informacji: h28 na tle #F1F3F9 z ikoną 14 px, np. „1–5 graczy”. */
export function MetaChip({ icon, children, className }: MetaChipProps) {
  return (
    <span className={cx('meta-chip', className)}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}
