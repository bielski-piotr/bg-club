import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { format, t } from '../i18n';
import { IconButton } from '../ui';
import { cx } from '../ui/cx';

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

const HOME: View = { scale: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Powiększany obraz karteczki: kółko myszy, szczypanie, dwuklik, przyciski i klawisze (+, −, 0,
 * strzałki). Powiększoną kartkę przesuwa się przeciągnięciem; widok nie wychodzi poza kartkę.
 */
export function SheetZoom({
  src,
  alt,
  onError,
}: {
  readonly src: string;
  readonly alt: string;
  readonly onError?: (() => void) | undefined;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>(HOME);
  // Bieżący widok dla obsługi zdarzeń (kilka ruchów między renderami, np. szczypanie).
  const viewRef = useRef<View>(HOME);
  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; x: number; y: number } | null>(null);

  /** Pilnuje, żeby kartka nie uciekła z kadru: przesunięcie najwyżej o nadmiar powiększenia. */
  const limit = useCallback((next: View): View => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content || next.scale <= MIN_SCALE) return HOME;
    const maxX = Math.max(0, (content.offsetWidth * next.scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (content.offsetHeight * next.scale - stage.clientHeight) / 2);
    return {
      scale: next.scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  }, []);

  /** Zmienia powiększenie tak, że punkt ekranu (`cx`, `cy`) zostaje pod kursorem albo palcami. */
  const zoomAt = useCallback(
    (scale: number, cx?: number, cy?: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const current = viewRef.current;
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
    },
    [limit, setView],
  );

  // Kółko myszy: zwykły nasłuch, bo React rejestruje `wheel` jako pasywny (bez `preventDefault`).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018));
      zoomAt(viewRef.current.scale * factor, event.clientX, event.clientY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Zmiana rozmiaru okna: przesunięcie znów w granicach kartki.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setView(limit(viewRef.current)));
    observer.observe(stage);
    return () => observer.disconnect();
  }, [limit, setView]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const current = viewRef.current;
      // przesunięcie środka palców, potem zoom względem niego
      viewRef.current = limit({
        ...current,
        x: current.x + mid.x - pinch.current.x,
        y: current.y + mid.y - pinch.current.y,
      });
      if (pinch.current.dist > 0) zoomAt(current.scale * (dist / pinch.current.dist), mid.x, mid.y);
      else setView(viewRef.current);
      pinch.current = { dist, ...mid };
      return;
    }
    const current = viewRef.current;
    if (current.scale <= MIN_SCALE) return;
    setView(
      limit({ ...current, x: current.x + point.x - last.x, y: current.y + point.y - last.y }),
    );
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = viewRef.current;
    const pan = (dx: number, dy: number) =>
      setView(limit({ ...current, x: current.x + dx, y: current.y + dy }));
    if (event.key === '+' || event.key === '=') zoomAt(current.scale * STEP);
    else if (event.key === '-') zoomAt(current.scale / STEP);
    else if (event.key === '0') setView(HOME);
    else if (current.scale > MIN_SCALE && event.key === 'ArrowLeft') pan(PAN_STEP, 0);
    else if (current.scale > MIN_SCALE && event.key === 'ArrowRight') pan(-PAN_STEP, 0);
    else if (current.scale > MIN_SCALE && event.key === 'ArrowUp') pan(0, PAN_STEP);
    else if (current.scale > MIN_SCALE && event.key === 'ArrowDown') pan(0, -PAN_STEP);
    else return;
    event.preventDefault();
  };

  const zoomed = view.scale > MIN_SCALE + 0.001;
  return (
    <div className="sheet-zoom">
      <div
        ref={stageRef}
        className={cx(
          'sheet-view__stage',
          'sheet-zoom__stage',
          zoomed && 'sheet-zoom__stage--zoomed',
        )}
        tabIndex={0}
        role="group"
        aria-label={text.label}
        aria-describedby="sheet-zoom-hint"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={(event) =>
          zoomed ? setView(HOME) : zoomAt(DOUBLE, event.clientX, event.clientY)
        }
        onKeyDown={onKeyDown}
      >
        <div
          ref={contentRef}
          className="sheet-zoom__content"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <img
            className="sheet-view__img"
            src={src}
            alt={alt}
            draggable={false}
            onError={onError}
          />
        </div>
      </div>
      <div className="sheet-zoom__bar">
        <IconButton
          icon="minus"
          label={text.out}
          size={32}
          disabled={!zoomed}
          onClick={() => zoomAt(view.scale / STEP)}
        />
        <span className="sheet-zoom__value" aria-live="polite">
          {format(text.value, { n: String(Math.round(view.scale * 100)) })}
        </span>
        <IconButton
          icon="plus"
          label={text.in}
          size={32}
          disabled={view.scale >= MAX_SCALE}
          onClick={() => zoomAt(view.scale * STEP)}
        />
        <IconButton
          icon="refresh"
          label={text.reset}
          size={32}
          disabled={!zoomed}
          onClick={() => setView(HOME)}
        />
        <p id="sheet-zoom-hint" className="sheet-view__hint sheet-zoom__hint">
          {text.hint}
        </p>
      </div>
    </div>
  );
}
