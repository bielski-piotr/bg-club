import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';
import type { ClassValue } from './dom';
import { Icon, type IconName } from './Icon';
import './Badge.css';

/**
 * Słownik statusów accent, neutral, warning, danger, success.
 * `ink` = tekst #161A2B na #F1F3F9 (chip „Gry wybrane”).
 */
export type Tone = 'accent' | 'neutral' | 'ink' | 'warning' | 'danger' | 'success';

export interface BadgeProps {
  readonly tone?: Tone | undefined;
  /** Badge na wierszu akcentu (białe tło, tekst akcentu), np. „Ty” bieżącego użytkownika. */
  readonly onAccent?: boolean | undefined;
  readonly children: JSX.Element;
  readonly class?: ClassValue;
}

/** Badge wiersza: pigułka 2/8, 11/14/600, np. „Admin”, „Ty”, „Prowadzi”. */
export function Badge(props: BadgeProps) {
  return (
    <span
      class={[
        'badge',
        `tone--${props.tone ?? 'neutral'}`,
        { 'badge--on-accent': !!props.onAccent },
        props.class,
      ]}
    >
      {props.children}
    </span>
  );
}

export interface StatusChipProps {
  readonly tone: Tone;
  readonly children: JSX.Element;
  readonly class?: ClassValue;
}

/** Chip statusu z kropką: h24, 12/16/600, np. „Głosowanie otwarte”. */
export function StatusChip(props: StatusChipProps) {
  return (
    <span class={['status-chip', `tone--${props.tone}`, props.class]}>
      <span class="status-chip__dot" aria-hidden="true" />
      {props.children}
    </span>
  );
}

export interface MetaChipProps {
  readonly icon?: IconName | undefined;
  readonly children: JSX.Element;
  readonly class?: ClassValue;
}

/** Chip informacji: h28 na tle #F1F3F9 z ikoną 14 px, np. „1–5 graczy”. */
export function MetaChip(props: MetaChipProps) {
  return (
    <span class={['meta-chip', props.class]}>
      <Show when={props.icon}>{(icon) => <Icon name={icon()} size={14} />}</Show>
      {props.children}
    </span>
  );
}
