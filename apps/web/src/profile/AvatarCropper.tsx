import { createEffect, createSignal, onSettled, Show } from 'solid-js';
import { format, t } from '../i18n';
import { px } from '../ui/dom';
import { Slider } from '../ui';
import {
  clampCrop,
  imageBox,
  INITIAL_CROP,
  MAX_ZOOM,
  minZoom,
  panCrop,
  zoomCrop,
  type CropFit,
  type CropState,
  type ImageSize,
} from './crop';
import './cropper.css';

/**
 * Bok kadru w px w modelu kadru (`CropState` liczy się w tych pikselach). Na ekranie kadr może
 * być mniejszy albo większy: podgląd jest skalowany do miejsca w oknie.
 */
export const CROP_VIEW = 280;
/** Krok przesunięcia strzałką w px ekranu (Shift: większy). */
const KEY_STEP = 8;
const ZOOM_STEP = 0.1;

interface AvatarCropperProps {
  /** Adres podglądu (object URL pliku). */
  readonly src: string;
  readonly image: ImageSize;
  readonly crop: CropState;
  readonly onCropChange: (crop: CropState) => void;
  /**
   * Kształt maski: `circle` = awatar, `cover` = okładka gry (zaokrąglony kwadrat, jak okładka
   * w widoku gry). Wynik jest zawsze kwadratem; maska pokazuje, co będzie widać.
   */
  readonly shape?: 'circle' | 'cover';
  /** `contain`: obraz można oddalić, aż cały zmieści się w kadrze (tło: `fill`). */
  readonly fit?: CropFit;
  /** Kolor tła kadru odsłoniętego przy oddaleniu (jak na zapisanym obrazie). */
  readonly fill?: string;
  /**
   * Margines wokół kadru jako ułamek boku podglądu: obraz poza kadrem jest widoczny
   * (przyciemniony), więc widać, co zostaje poza okładką.
   */
  readonly margin?: number;
  /** Największy bok podglądu w px; mniejszy, gdy okno jest węższe. */
  readonly maxSize?: number;
}

/**
 * Kadr zdjęcia (USR-3, DS „Profil / Kadrowanie awatara”): kwadratowy kadr z okrągłą maską
 * (awatar) albo maską okładki gry (edytor okładek, `games/CoverEditor.tsx`).
 * Zdjęcie przesuwa się przeciągnięciem (mysz, palec) albo strzałkami, a powiększa suwakiem,
 * kółkiem myszy albo klawiszami + i −. Przy `fit="cover"` zdjęcie zawsze pokrywa cały kadr.
 */
export function AvatarCropper(props: AvatarCropperProps) {
  const fit = () => props.fit ?? 'cover';
  const shape = () => props.shape ?? 'circle';
  const maxSize = () => props.maxSize ?? CROP_VIEW;
  let drag: { id: number; x: number; y: number } | null = null;
  const [dragging, setDragging] = createSignal(false);
  // Bok podglądu: tyle, ile mieści okno (najwyżej `maxSize`).
  const [measured, setMeasured] = createSignal<number | null>(null);
  const size = () => Math.min(maxSize(), measured() ?? maxSize());
  let root: HTMLDivElement | undefined;

  const inset = () => Math.round(size() * (props.margin ?? 0));
  /** Px ekranu na px modelu kadru. */
  const ratio = () => (size() - 2 * inset()) / CROP_VIEW;
  const box = () => imageBox(props.crop, props.image, CROP_VIEW);

  // Bieżący kadr poza sygnałami: kilka zdarzeń (pointermove, kółko) przed zapisem w rodzicu
  // liczy się od wyniku poprzedniego, a nie od propsa sprzed zmiany, więc żaden ruch nie ginie.
  let latest: CropState | undefined;
  createEffect(
    () => props.crop,
    (crop) => {
      latest = crop;
    },
  );
  const update = (change: (current: CropState, image: ImageSize) => CropState) => {
    const next = change(latest ?? props.crop, props.image);
    latest = next;
    props.onCropChange(next);
  };
  /** Przesunięcie o (dx, dy) px ekranu (wywołanie z handlera: skala i dopasowanie z tej chwili). */
  const pan = (dx: number, dy: number) => {
    const scale = ratio() || 1;
    const mode = fit();
    update((current, image) => panCrop(current, dx / scale, dy / scale, image, CROP_VIEW, mode));
  };
  const zoomTo = (zoom: (current: CropState) => number) => {
    const mode = fit();
    update((current, image) => zoomCrop(current, zoom(current), image, CROP_VIEW, mode));
  };
  const reset = () => {
    const mode = fit();
    update((_, image) => clampCrop(INITIAL_CROP, image, CROP_VIEW, mode));
  };

  onSettled(() => {
    const cleanups: (() => void)[] = [];
    if (root) {
      const node = root;
      const measure = () => {
        const width = node.clientWidth;
        setMeasured(width > 0 ? Math.floor(width) : null);
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        cleanups.push(() => observer.disconnect());
      }
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  });

  // Kółko myszy powiększa zdjęcie zamiast przewijać popup: nasłuch z `passive: false` przez ref
  // (opcje nasłuchu, skill solid-2.0); znika razem z elementem.
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomTo((current) => current.zoom * factor);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent) => {
    const start = drag;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    drag = { id: start.id, x: event.clientX, y: event.clientY };
    pan(dx, dy);
  };
  const endDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const pans: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = pans[event.key];
    if (move) {
      event.preventDefault();
      pan(move[0], move[1]);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomTo((current) => current.zoom + ZOOM_STEP);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomTo((current) => current.zoom - ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      reset();
    }
  };

  const lowest = () => Math.ceil(minZoom(props.image, fit()) * 100);
  return (
    <div ref={(el) => (root = el)} class="cropper">
      <div
        ref={(el) => el.addEventListener('wheel', onWheel, { passive: false })}
        class={['cropper__stage', { 'cropper__stage--dragging': dragging() }]}
        style={{ width: px(size()), height: px(size()) }}
        role="group"
        aria-label={t.crop.stageLabel}
        tabindex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <Show when={props.fill}>
          {(fill) => (
            <span
              class={['cropper__fill', { 'cropper__fill--cover': shape() === 'cover' }]}
              style={{ inset: px(inset()), background: fill() }}
              aria-hidden="true"
            />
          )}
        </Show>
        <img
          class="cropper__image"
          src={props.src}
          alt=""
          draggable="false"
          style={{
            left: px(inset() + box().left * ratio()),
            top: px(inset() + box().top * ratio()),
            width: px(box().width * ratio()),
            height: px(box().height * ratio()),
          }}
        />
        <span
          class={['cropper__mask', { 'cropper__mask--cover': shape() === 'cover' }]}
          style={{ inset: px(inset()) }}
          aria-hidden="true"
        />
      </div>
      <Slider
        class="cropper__zoom"
        label={t.crop.zoomLabel}
        min={lowest()}
        max={MAX_ZOOM * 100}
        step={1}
        value={Math.max(lowest(), Math.round(props.crop.zoom * 100))}
        formatValue={(value) => format(t.crop.zoomValue, { n: value })}
        onValueChange={(value) => zoomTo(() => value / 100)}
      />
    </div>
  );
}
