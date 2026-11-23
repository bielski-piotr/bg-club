import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { t } from '../i18n';
import { Button, Icon, type IconName } from '../ui';
import { cx } from '../ui/cx';
import { focusableIn } from '../ui/focusable';
import '../ui/Field.css';
import '../ui/Select.css';

const GAP = 6;
const MARGIN = 8;
const PANEL_WIDTH = 340;

/** Panel pod pigułką, względem okna: przewijany popup ani karta widżetu go nie przycinają. */
function panelStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewTop = viewport?.offsetTop ?? 0;
  const viewHeight = viewport?.height ?? window.innerHeight;
  const viewWidth = document.documentElement.clientWidth || window.innerWidth;
  const width = Math.min(PANEL_WIDTH, viewWidth - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(rect.left, viewWidth - width - MARGIN));
  const below = viewTop + viewHeight - rect.bottom - GAP - MARGIN;
  const above = rect.top - viewTop - GAP - MARGIN;
  const down = below >= 320 || below >= above;
  return {
    position: 'fixed',
    left,
    width,
    maxHeight: Math.max(160, down ? below : above),
    ...(down
      ? { top: rect.bottom + GAP }
      : { bottom: document.documentElement.clientHeight - rect.top + GAP }),
  };
}

export interface FilterPopoverProps {
  /** Nazwa filtru (etykieta panelu i początek etykiety pigułki). */
  readonly label: string;
  /** Pełna etykieta pigułki dla czytnika ekranu, np. „Zakres dat: Cała historia”. */
  readonly triggerLabel: string;
  /** Tekst na pigułce: wybrana wartość albo stan domyślny. */
  readonly value: string;
  readonly icon: IconName;
  /** Filtr ustawiony (pigułka w kolorze akcentu). */
  readonly active: boolean;
  /** Etykieta „Wyczyść” w stopce panelu (np. „Wyczyść zakres dat”). */
  readonly clearLabel: string;
  /** Przywraca stan domyślny tego filtru. */
  readonly onClear: () => void;
  readonly children: ReactNode;
}

/**
 * Pigułka filtru z panelem (DS §10 „Select trigger” w wariancie pill). Panel to dialog
 * nie-modalny: Esc i kliknięcie poza nim zamykają go, fokus wraca na pigułkę.
 */
export function FilterPopover({
  label,
  triggerLabel,
  value,
  icon,
  active,
  clearLabel,
  onClear,
  children,
}: FilterPopoverProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      (panel ? focusableIn(panel)[0] : undefined);
    first?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    // Pigułka może się przesunąć (przewijanie, zmiana rankingu pod filtrem, klawiatura ekranowa),
    // więc panel idzie za nią w każdej klatce; stan zmienia się tylko przy innym położeniu.
    let last = '';
    let frame = 0;
    const place = () => {
      if (triggerRef.current) {
        const next = panelStyle(triggerRef.current);
        const key = JSON.stringify(next);
        if (key !== last) {
          last = key;
          setStyle(next);
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // Esc zamyka panel, a nie popup pod nim (PopupHost pomija obsłużone zdarzenia).
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      className="lb-filter"
      ref={rootRef}
      onBlur={(event) => {
        if (
          open &&
          !rootRef.current?.contains(event.relatedTarget as Node | null) &&
          event.relatedTarget
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={cx(
          'select__pill lb-filter__pill',
          active && 'lb-filter__pill--active',
          open && 'select--open',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <Icon name={icon} className="select__lead" />
        <span className="select__value">{value}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} className="select__chevron" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-label={label}
          className="lb-filter__panel"
          style={style}
          onKeyDown={onKeyDown}
        >
          {children}
          <div className="lb-filter__footer">
            <Button
              size="sm"
              variant="secondary"
              aria-label={clearLabel}
              disabled={!active}
              onClick={onClear}
            >
              {t.leaderboard.filters.clear}
            </Button>
            <Button size="sm" onClick={() => close()}>
              {t.leaderboard.filters.done}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
