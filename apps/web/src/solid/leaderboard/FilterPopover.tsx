/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId, Show } from 'solid-js';
import { t } from '../../i18n';
import { focusableIn } from '../../ui/focusable';
import { ariaBool } from '../ui/dom';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import '../../ui/Field.css';
import '../../ui/Select.css';

const GAP = 6;
const MARGIN = 8;
const PANEL_WIDTH = 340;

/**
 * Ustawia panel pod pigułką względem okna (przewijany popup ani karta go nie przycinają).
 * `last` to poprzednie położenie: styl zmienia się tylko przy innym. Zwraca nowe położenie.
 */
function placePanel(panel: HTMLElement, trigger: HTMLElement, last: string): string {
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
  const style: Record<string, string> = {
    position: 'fixed',
    left: `${left}px`,
    width: `${width}px`,
    'max-height': `${Math.max(160, down ? below : above)}px`,
    top: down ? `${rect.bottom + GAP}px` : '',
    bottom: down ? '' : `${document.documentElement.clientHeight - rect.top + GAP}px`,
  };
  const key = JSON.stringify(style);
  if (key !== last) {
    for (const [name, value] of Object.entries(style)) {
      if (value === '') panel.style.removeProperty(name);
      else panel.style.setProperty(name, value);
    }
  }
  return key;
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
  /** Treść panelu; tworzona dopiero po otwarciu (np. pobranie kolekcji). */
  readonly children: JSX.Element;
}

/**
 * Pigułka filtru z panelem (DS §10 „Select trigger” w wariancie pill). Panel to dialog
 * nie-modalny: Esc i kliknięcie poza nim zamykają go, fokus wraca na pigułkę.
 */
export function FilterPopover(props: FilterPopoverProps) {
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let panel: HTMLDivElement | undefined;

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger?.focus();
  };

  createEffect(
    () => open(),
    (isOpen) => {
      if (!isOpen) return;
      const first =
        panel?.querySelector<HTMLElement>('[data-autofocus]') ??
        (panel ? focusableIn(panel)[0] : undefined);
      first?.focus();
      const onPointerDown = (event: PointerEvent) => {
        if (!root?.contains(event.target as Node)) setOpen(false);
      };
      document.addEventListener('pointerdown', onPointerDown);
      // Pigułka może się przesunąć (przewijanie, zmiana rankingu, klawiatura ekranowa), więc
      // panel idzie za nią w każdej klatce; styl zmienia się tylko przy innym położeniu.
      let frame = 0;
      let last = '';
      const place = () => {
        if (panel && trigger) last = placePanel(panel, trigger, last);
        frame = requestAnimationFrame(place);
      };
      place();
      return () => {
        document.removeEventListener('pointerdown', onPointerDown);
        cancelAnimationFrame(frame);
      };
    },
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Esc zamyka panel, a nie popup pod nim (PopupHost pomija obsłużone zdarzenia).
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      class="lb-filter"
      ref={(el) => (root = el)}
      onFocusOut={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open() && next && !root?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={(el) => (trigger = el)}
        type="button"
        class={[
          'select__pill lb-filter__pill',
          { 'lb-filter__pill--active': props.active, 'select--open': open() },
        ]}
        aria-haspopup="dialog"
        aria-expanded={ariaBool(open())}
        aria-controls={open() ? `${id}-panel` : undefined}
        aria-label={props.triggerLabel}
        onClick={() => (open() ? close(false) : setOpen(true))}
      >
        <Icon name={props.icon} class="select__lead" />
        <span class="select__value">{props.value}</span>
        <Icon name={open() ? 'chevron-up' : 'chevron-down'} class="select__chevron" />
      </button>
      <Show when={open()}>
        <div
          ref={(el) => (panel = el)}
          id={`${id}-panel`}
          role="dialog"
          aria-label={props.label}
          class="lb-filter__panel"
          onKeyDown={onKeyDown}
        >
          {props.children}
          <div class="lb-filter__footer">
            <Button
              size="sm"
              variant="secondary"
              aria-label={props.clearLabel}
              disabled={!props.active}
              onClick={() => props.onClear()}
            >
              {t.leaderboard.filters.clear}
            </Button>
            <Button size="sm" onClick={() => close()}>
              {t.leaderboard.filters.done}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}
