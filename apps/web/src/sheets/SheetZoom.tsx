/** @jsxImportSource @solidjs/web */
import { createSignal, onSettled } from 'solid-js';
import { format, t } from '../i18n';
import { IconButton } from '../solid/ui';

const text = t.sheets.zoom;

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** Krok przycisków i klawiszy +/−. */
const STEP = 1.5;
/** Powiększenie po dwukliku. */
const DOUBLE = 2.5;
/** Przesunięcie strzałką (px ekranu). */
const PAN_STEP = 60;

interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const HOME: View = { scale: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Powiększany obraz karteczki: kółko myszy, szczypanie, dwuklik, przyciski i klawisze (+, −, 0,
 * strzałki). Powiększoną kartkę przesuwa się przeciągnięciem; widok nie wychodzi poza kartkę.
 */
export function SheetZoom(props: {
  readonly src: string;
  readonly alt: string;
  readonly onError?: (() => void) | undefined;
}) {
  let stage: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  const [view, setViewState] = createSignal<View>(HOME);
  // Bieżący widok dla obsługi zdarzeń: odczyt sygnału widzi zapis dopiero po flushu, a między
  // zdarzeniami (np. szczypanie) przychodzi kilka ruchów.
  let current: View = HOME;
  const setView = (next: View) => {
    current = next;
    setViewState(next);
  };
  const pointers = new Map<number, Point>();
  let pinch: { dist: number; x: number; y: number } | null = null;

  /** Pilnuje, żeby kartka nie uciekła z kadru: przesunięcie najwyżej o nadmiar powiększenia. */
  const limit = (next: View): View => {
    if (!stage || !content || next.scale <= MIN_SCALE) return HOME;
    const maxX = Math.max(0, (content.offsetWidth * next.scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (content.offsetHeight * next.scale - stage.clientHeight) / 2);
    return {
      scale: next.scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  };

  /** Zmienia powiększenie tak, że punkt ekranu (`cx`, `cy`) zostaje pod kursorem albo palcami. */
  const zoomAt = (scale: number, cx?: number, cy?: number) => {
    if (!stage) return;
    const next = clamp(scale, MIN_SCALE, MAX_SCALE);
    const rect = stage.getBoundingClientRect();
    // punkt względem środka kadru (środek kartki bez przesunięcia)
    const px = (cx ?? rect.left + rect.width / 2) - (rect.left + rect.width / 2);
    const py = (cy ?? rect.top + rect.height / 2) - (rect.top + rect.height / 2);
    const k = next / current.scale;
    setView(
      limit({
        scale: next,
        x: px - (px - current.x) * k,
        y: py - (py - current.y) * k,
      }),
    );
  };

  onSettled(() => {
    const element = stage;
    if (!element) return;
    // Kółko myszy: nasłuch niepasywny, żeby `preventDefault` blokował przewijanie strony.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018));
      zoomAt(current.scale * factor, event.clientX, event.clientY);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    // Zmiana rozmiaru okna: przesunięcie znów w granicach kartki.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => setView(limit(current)));
    observer?.observe(element);
    return () => {
      element.removeEventListener('wheel', onWheel);
      observer?.disconnect();
    };
  });

  const two = () => [...pointers.values()] as [Point, Point];

  const onPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = two();
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = two();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const before = current;
      // przesunięcie środka palców, potem zoom względem niego
      current = limit({ ...before, x: before.x + mid.x - pinch.x, y: before.y + mid.y - pinch.y });
      if (pinch.dist > 0) zoomAt(before.scale * (dist / pinch.dist), mid.x, mid.y);
      else setView(current);
      pinch = { dist, ...mid };
      return;
    }
    if (current.scale <= MIN_SCALE) return;
    setView(
      limit({ ...current, x: current.x + point.x - last.x, y: current.y + point.y - last.y }),
    );
  };

  const onPointerEnd = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const now = current;
    const pan = (dx: number, dy: number) =>
      setView(limit({ ...now, x: now.x + dx, y: now.y + dy }));
    if (event.key === '+' || event.key === '=') zoomAt(now.scale * STEP);
    else if (event.key === '-') zoomAt(now.scale / STEP);
    else if (event.key === '0') setView(HOME);
    else if (now.scale > MIN_SCALE && event.key === 'ArrowLeft') pan(PAN_STEP, 0);
    else if (now.scale > MIN_SCALE && event.key === 'ArrowRight') pan(-PAN_STEP, 0);
    else if (now.scale > MIN_SCALE && event.key === 'ArrowUp') pan(0, PAN_STEP);
    else if (now.scale > MIN_SCALE && event.key === 'ArrowDown') pan(0, -PAN_STEP);
    else return;
    event.preventDefault();
  };

  const zoomed = () => view().scale > MIN_SCALE + 0.001;
  return (
    <div class="sheet-zoom">
      <div
        ref={(el) => (stage = el)}
        class={[
          'sheet-view__stage',
          'sheet-zoom__stage',
          { 'sheet-zoom__stage--zoomed': zoomed() },
        ]}
        tabindex={0}
        role="group"
        aria-label={text.label}
        aria-describedby="sheet-zoom-hint"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDblClick={(event) =>
          zoomed() ? setView(HOME) : zoomAt(DOUBLE, event.clientX, event.clientY)
        }
        onKeyDown={onKeyDown}
      >
        <div
          ref={(el) => (content = el)}
          class="sheet-zoom__content"
          style={{ transform: `translate(${view().x}px, ${view().y}px) scale(${view().scale})` }}
        >
          <img
            class="sheet-view__img"
            src={props.src}
            alt={props.alt}
            draggable="false"
            onError={() => props.onError?.()}
          />
        </div>
      </div>
      <div class="sheet-zoom__bar">
        <IconButton
          icon="minus"
          label={text.out}
          size={32}
          disabled={!zoomed()}
          onClick={() => zoomAt(current.scale / STEP)}
        />
        <span class="sheet-zoom__value" aria-live="polite">
          {format(text.value, { n: String(Math.round(view().scale * 100)) })}
        </span>
        <IconButton
          icon="plus"
          label={text.in}
          size={32}
          disabled={view().scale >= MAX_SCALE}
          onClick={() => zoomAt(current.scale * STEP)}
        />
        <IconButton
          icon="refresh"
          label={text.reset}
          size={32}
          disabled={!zoomed()}
          onClick={() => setView(HOME)}
        />
        <p id="sheet-zoom-hint" class="sheet-view__hint sheet-zoom__hint">
          {text.hint}
        </p>
      </div>
    </div>
  );
}
