import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { t } from '../i18n';
import { Icon, type IconName } from './Icon';
import { ToastContext, type ToastApi, type ToastVariant } from './toastContext';
import './Toast.css';

const icons: Readonly<Record<ToastVariant, IconName>> = {
  success: 'check',
  neutral: 'copy',
  error: 'alert',
};

export interface ToastProps {
  readonly variant?: ToastVariant | undefined;
  readonly children: JSX.Element;
  readonly onDismiss?: (() => void) | undefined;
  readonly rich?: boolean | undefined;
}

/** Ciemny toast 343 px (DS §12) z ikoną wariantu i opcjonalnym przyciskiem zamknięcia. */
export function Toast(props: ToastProps) {
  const variant = () => props.variant ?? 'success';
  return (
    <div
      class={['toast', `toast--${variant()}`, { 'toast--rich': !!props.rich }]}
      aria-atomic="true"
    >
      <Show when={!props.rich}>
        <Icon name={icons[variant()]} class="toast__icon" />
      </Show>
      <div class="toast__message">{props.children}</div>
      <Show when={props.onDismiss}>
        {(onDismiss) => (
          <button
            type="button"
            class="toast__close"
            aria-label={t.ui.dismissToast}
            onClick={() => onDismiss()()}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </Show>
    </div>
  );
}

interface Entry {
  readonly id: number;
  readonly message: JSX.Element;
  readonly variant: ToastVariant;
  readonly rich?: boolean | undefined;
  readonly duration?: number | undefined;
}

export interface ToastProviderProps {
  readonly children: JSX.Element;
  /** Czas wyświetlania w ms; błąd zostaje dwa razy dłużej. */
  readonly duration?: number | undefined;
  /** Najwyżej tyle toastów naraz; starsze znikają. */
  readonly limit?: number | undefined;
  /** Stały stan nad toastami (np. brak sieci, nowa wersja aplikacji). */
  readonly pinned?: JSX.Element | undefined;
}

/**
 * Kolejka toastów u dołu ekranu. Komunikaty trafiają do regionów `aria-live`
 * (błędy: `assertive`), więc czytnik ekranu je ogłasza. Najechanie lub fokus
 * wstrzymuje znikanie.
 */
export function ToastProvider(props: ToastProviderProps) {
  const [entries, setEntries] = createSignal<readonly Entry[]>([]);
  // Najechanie i fokus wstrzymują znikanie niezależnie od siebie.
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const paused = createMemo(() => hovered() || focused());
  const duration = () => props.duration ?? 4000;
  let region: HTMLDivElement | undefined;
  let nextId = 1;
  const shownKeys = new Map<string, number>();

  const dismiss = (id: number) => {
    setEntries((list) => list.filter((e) => e.id !== id));
  };

  const api: ToastApi = {
    show: (message, variant = 'success', options) => {
      const previous = options?.key ? shownKeys.get(options.key) : undefined;
      if (previous !== undefined) return previous;
      const id = nextId++;
      if (options?.key) shownKeys.set(options.key, id);
      const limit = props.limit ?? 3;
      setEntries((list) => [...list, { id, message, variant, ...options }].slice(-limit));
      return id;
    },
    dismiss,
  };

  // Zamknięty toast zabiera ze sobą przycisk z fokusem, a nie każda przeglądarka wysyła wtedy
  // `focusout`. Po każdej zmianie listy sprawdzamy, czy fokus nadal jest w regionie.
  createEffect(
    () => {
      entries();
      return focused();
    },
    (isFocused) => {
      if (isFocused && !region?.contains(document.activeElement)) setFocused(false);
    },
  );

  const list = (errors: boolean) => (
    <For each={entries().filter((e) => (e.variant === 'error') === errors)}>
      {(entry) => (
        <TimedToast
          entry={entry}
          duration={errors ? duration() * 2 : duration()}
          paused={paused()}
          onDismiss={dismiss}
        />
      )}
    </For>
  );

  return (
    <ToastContext value={api}>
      {props.children}
      <div class="toast-region" role="region" aria-label={t.ui.notifications}>
        {/* Stały stan nie wstrzymuje znikania toastów: obsługa najechania i fokusu jest niżej. */}
        {props.pinned}
        <div
          class="toast-region__toasts"
          ref={(el) => (region = el)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocusIn={() => setFocused(true)}
          onFocusOut={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFocused(false);
            }
          }}
        >
          <div aria-live="polite" class="toast-region__list">
            {list(false)}
          </div>
          <div aria-live="assertive" class="toast-region__list">
            {list(true)}
          </div>
        </div>
      </div>
    </ToastContext>
  );
}

function TimedToast(props: {
  readonly entry: Entry;
  readonly duration: number;
  readonly paused: boolean;
  readonly onDismiss: (id: number) => void;
}) {
  createEffect(
    () => (props.paused ? null : (props.entry.duration ?? props.duration)),
    (ms) => {
      if (ms === null) return;
      const timer = window.setTimeout(() => props.onDismiss(props.entry.id), ms);
      return () => window.clearTimeout(timer);
    },
  );
  return (
    <Toast
      variant={props.entry.variant}
      rich={props.entry.rich}
      onDismiss={() => props.onDismiss(props.entry.id)}
    >
      {props.entry.message}
    </Toast>
  );
}
