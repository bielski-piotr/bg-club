import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import './Feedback.css';

export type BannerVariant = 'info' | 'warning' | 'error';

const bannerIcons: Readonly<Record<BannerVariant, IconName>> = {
  info: 'check',
  warning: 'alert',
  error: 'alert',
};

export interface BannerProps {
  readonly variant: BannerVariant;
  readonly children: ReactNode;
  /** Akcja pod tekstem, np. „Spróbuj ponownie”. */
  readonly action?: ReactNode | undefined;
  readonly className?: string | undefined;
}

/**
 * Baner informacyjny lub ostrzegawczy (DS §10). Wariant `error` (tło danger, DS §3) służy
 * do błędów wczytywania i jest ogłaszany jako `role="alert"`.
 */
export function Banner({ variant, children, action, className }: BannerProps) {
  return (
    <div
      className={cx('banner', `banner--${variant}`, className)}
      role={variant === 'error' ? 'alert' : undefined}
    >
      <Icon name={bannerIcons[variant]} className="banner__icon" />
      <div className="banner__body">
        <div>{children}</div>
        {action ? <div className="banner__action">{action}</div> : null}
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  /** Ikona 22 px w kółku 56 #EEF2FF albo własny element (np. awatar 56). */
  readonly lead: IconName | ReactNode;
  readonly title: string;
  readonly helper?: string | undefined;
  /** CTA pod treścią (pełnej szerokości przycisk główny, DS §6). */
  readonly action?: ReactNode | undefined;
}

/** Pusty stan widżetu (DS §6, §17 CLUB-4). */
export function EmptyState({ lead, title, helper, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__row">
        {typeof lead === 'string' ? (
          <span className="empty-state__lead">
            <Icon name={lead as IconName} size={22} />
          </span>
        ) : (
          lead
        )}
        <div className="empty-state__text">
          <p className="empty-state__title">{title}</p>
          {helper ? <p className="empty-state__helper">{helper}</p> : null}
        </div>
      </div>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export interface SkeletonProps {
  readonly width?: CSSProperties['width'] | undefined;
  readonly height?: CSSProperties['height'] | undefined;
  readonly radius?: CSSProperties['borderRadius'] | undefined;
  readonly className?: string | undefined;
}

/** Zastępczy blok w trakcie ładowania. Dekoracyjny: stan ogłasza `Spinner` z etykietą. */
export function Skeleton({ width = '100%', height = 16, radius = 8, className }: SkeletonProps) {
  return (
    <span
      className={cx('skeleton', className)}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
