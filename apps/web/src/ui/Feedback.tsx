import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import { px, createSlot, type ClassValue } from './dom';
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
  readonly children: JSX.Element;
  /** Akcja pod tekstem, np. „Spróbuj ponownie”. */
  readonly action?: JSX.Element | undefined;
  readonly class?: ClassValue;
}

/**
 * Baner informacyjny lub ostrzegawczy (DS §10). Wariant `error` (tło danger, DS §3) służy
 * do błędów wczytywania i jest ogłaszany jako `role="alert"`.
 */
export function Banner(props: BannerProps) {
  const action = createSlot(() => props.action);
  return (
    <div
      class={['banner', `banner--${props.variant}`, props.class]}
      role={props.variant === 'error' ? 'alert' : undefined}
    >
      <Icon name={bannerIcons[props.variant]} class="banner__icon" />
      <div class="banner__body">
        <div>{props.children}</div>
        <Show when={action()}>
          <div class="banner__action">{action()}</div>
        </Show>
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  /** Ikona 22 px w kółku 56 #EEF2FF (np. `dice`, `calendar`). */
  readonly icon?: IconName | undefined;
  /** Własny element zamiast ikony (np. awatar 56 w widżecie Członkowie). */
  readonly lead?: JSX.Element | undefined;
  readonly title: string;
  readonly helper?: string | undefined;
  /** CTA pod treścią (pełnej szerokości przycisk główny, DS §6). */
  readonly action?: JSX.Element | undefined;
}

/** Pusty stan widżetu (DS §6, §17 CLUB-4). */
export function EmptyState(props: EmptyStateProps) {
  const lead = createSlot(() => props.lead);
  const action = createSlot(() => props.action);
  return (
    <div class="empty-state">
      <div class="empty-state__row">
        <Show when={props.icon} fallback={lead()}>
          {(icon) => (
            <span class="empty-state__lead">
              <Icon name={icon()} size={22} />
            </span>
          )}
        </Show>
        <div class="empty-state__text">
          <p class="empty-state__title">{props.title}</p>
          <Show when={props.helper}>
            <p class="empty-state__helper">{props.helper}</p>
          </Show>
        </div>
      </div>
      <Show when={action()}>
        <div class="empty-state__action">{action()}</div>
      </Show>
    </div>
  );
}

export interface SkeletonProps {
  readonly width?: number | string | undefined;
  readonly height?: number | string | undefined;
  readonly radius?: number | string | undefined;
  readonly class?: ClassValue;
}

/** Zastępczy blok w trakcie ładowania. Dekoracyjny: stan ogłasza `Spinner` z etykietą. */
export function Skeleton(props: SkeletonProps) {
  return (
    <span
      class={['skeleton', props.class]}
      style={{
        width: px(props.width ?? '100%'),
        height: px(props.height ?? 16),
        'border-radius': px(props.radius ?? 8),
      }}
      aria-hidden="true"
    />
  );
}
