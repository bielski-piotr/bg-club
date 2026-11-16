import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { cx } from './cx';
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
  readonly children: ReactNode;
  readonly onDismiss?: () => void;
  readonly rich?: boolean | undefined;
}

/** Ciemny toast 343 px (DS §12) z ikoną wariantu i opcjonalnym przyciskiem zamknięcia. */
export function Toast({ variant = 'success', children, onDismiss, rich }: ToastProps) {
  return (
    <div className={cx('toast', `toast--${variant}`, rich && 'toast--rich')} aria-atomic="true">
      {!rich && <Icon name={icons[variant]} className="toast__icon" />}
      <div className="toast__message">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          className="toast__close"
          aria-label={t.ui.dismissToast}
          onClick={onDismiss}
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}

interface Entry {
  readonly id: number;
  readonly message: ReactNode;
  readonly variant: ToastVariant;
  readonly rich?: boolean | undefined;
  readonly duration?: number | undefined;
}

export interface ToastProviderProps {
  readonly children: ReactNode;
  /** Czas wyświetlania w ms; błąd zostaje dwa razy dłużej. */
  readonly duration?: number | undefined;
  /** Najwyżej tyle toastów naraz; starsze znikają. */
  readonly limit?: number | undefined;
  /** Stały stan nad toastami (np. brak sieci, nowa wersja aplikacji). */
  readonly pinned?: ReactNode | undefined;
}

/**
 * Kolejka toastów u dołu ekranu. Komunikaty trafiają do regionów `aria-live`
 * (błędy: `assertive`), więc czytnik ekranu je ogłasza. Najechanie lub fokus
 * wstrzymuje znikanie.
 */
export function ToastProvider({
  children,
  duration = 4000,
  limit = 3,
  pinned,
}: ToastProviderProps) {
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  // Najechanie i fokus wstrzymują znikanie niezależnie od siebie.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const regionRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const shownKeys = useRef(new Map<string, number>());

  const dismiss = useCallback((id: number) => {
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  const show = useCallback(
    (
      message: ReactNode,
      variant: ToastVariant = 'success',
      options?: Parameters<ToastApi['show']>[2],
    ) => {
      const previous = options?.key ? shownKeys.current.get(options.key) : undefined;
      if (previous !== undefined) return previous;
      const id = nextId.current++;
      if (options?.key) shownKeys.current.set(options.key, id);
      setEntries((list) => [...list, { id, message, variant, ...options }].slice(-limit));
      return id;
    },
    [limit],
  );

  // Zamknięty toast zabiera ze sobą przycisk z fokusem, a nie każda przeglądarka wysyła wtedy
  // `focusout`. Po każdej zmianie listy sprawdzamy, czy fokus nadal jest w regionie.
  useEffect(() => {
    if (focused && !regionRef.current?.contains(document.activeElement)) setFocused(false);
  }, [entries, focused]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label={t.ui.notifications}>
        {/* Stały stan nie wstrzymuje znikania toastów: obsługa najechania i fokusu jest niżej. */}
        {pinned}
        <div
          className="toast-region__toasts"
          ref={regionRef}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFocused(false);
            }
          }}
        >
          <div aria-live="polite" className="toast-region__list">
            {entries
              .filter((e) => e.variant !== 'error')
              .map((e) => (
                <TimedToast
                  key={e.id}
                  entry={e}
                  duration={duration}
                  paused={paused}
                  onDismiss={dismiss}
                />
              ))}
          </div>
          <div aria-live="assertive" className="toast-region__list">
            {entries
              .filter((e) => e.variant === 'error')
              .map((e) => (
                <TimedToast
                  key={e.id}
                  entry={e}
                  duration={duration * 2}
                  paused={paused}
                  onDismiss={dismiss}
                />
              ))}
          </div>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function TimedToast({
  entry,
  duration,
  paused,
  onDismiss,
}: {
  readonly entry: Entry;
  readonly duration: number;
  readonly paused: boolean;
  readonly onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(entry.id), entry.duration ?? duration);
    return () => window.clearTimeout(timer);
  }, [entry.id, entry.duration, duration, paused, onDismiss]);
  return (
    <Toast variant={entry.variant} rich={entry.rich} onDismiss={() => onDismiss(entry.id)}>
      {entry.message}
    </Toast>
  );
}
