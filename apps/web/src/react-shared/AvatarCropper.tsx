import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { format, t } from '../i18n';
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
} from '../profile/crop';
import '../profile/cropper.css';

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
 * (awatar) albo maską okładki gry.
 * Zdjęcie przesuwa się przeciągnięciem (mysz, palec) albo strzałkami, a powiększa suwakiem,
 * kółkiem myszy albo klawiszami + i −. Przy `fit="cover"` zdjęcie zawsze pokrywa cały kadr.
 */
export function AvatarCropper({
  src,
  image,
  crop,
  onCropChange,
  shape = 'circle',
  fit = 'cover',
  fill,
  margin = 0,
  maxSize = CROP_VIEW,
}: AvatarCropperProps) {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Bok podglądu: tyle, ile mieści okno (najwyżej `maxSize`).
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(maxSize);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      setSize(width > 0 ? Math.min(maxSize, Math.floor(width)) : maxSize);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [maxSize]);
  const inset = Math.round(size * margin);
  const viewSide = size - 2 * inset;
  /** Px ekranu na px modelu kadru. */
  const ratio = viewSide / CROP_VIEW;
  const box = imageBox(crop, image, CROP_VIEW);

  // Bieżący kadr w refie: kilka zdarzeń (pointermove, kółko) przed kolejnym renderem liczy się
  // od wyniku poprzedniego, a nie od kadru z ostatniego renderu, więc żaden ruch nie ginie.
  const latest = useRef({ crop, image, onCropChange, ratio });
  useEffect(() => {
    latest.current = { crop, image, onCropChange, ratio };
  });
  const update = (change: (current: CropState, image: ImageSize) => CropState) => {
    const current = latest.current;
    const next = change(current.crop, current.image);
    latest.current = { ...current, crop: next };
    current.onCropChange(next);
  };
  /** Przesunięcie o (dx, dy) px ekranu. */
  const pan = (dx: number, dy: number) =>
    update((current, size) => {
      const scale = latest.current.ratio || 1;
      return panCrop(current, dx / scale, dy / scale, size, CROP_VIEW, fit);
    });
  const zoomTo = (zoom: (current: CropState) => number) =>
    update((current, size) => zoomCrop(current, zoom(current), size, CROP_VIEW, fit));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    drag.current = { id: start.id, x: event.clientX, y: event.clientY };
    pan(dx, dy);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  // Kółko myszy powiększa zdjęcie zamiast przewijać popup: React podpina `wheel` jako pasywny,
  // więc nasłuch z `passive: false` jest podpięty ręcznie (z bieżącym stanem w refie).
  const stage = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoomTo);
  useEffect(() => {
    zoomRef.current = zoomTo;
  });
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      zoomRef.current((current) => current.zoom * factor);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
      update((_, size) => clampCrop(INITIAL_CROP, size, CROP_VIEW, fit));
    }
  };

  const lowest = Math.ceil(minZoom(image, fit) * 100);
  return (
    <div ref={root} className="cropper">
      <div
        ref={stage}
        className={dragging ? 'cropper__stage cropper__stage--dragging' : 'cropper__stage'}
        style={{ width: size, height: size }}
        role="group"
        aria-label={t.crop.stageLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {fill ? (
          <span
            className={shape === 'cover' ? 'cropper__fill cropper__fill--cover' : 'cropper__fill'}
            style={{ inset, background: fill }}
            aria-hidden="true"
          />
        ) : null}
        <img
          className="cropper__image"
          src={src}
          alt=""
          draggable={false}
          style={{
            left: inset + box.left * ratio,
            top: inset + box.top * ratio,
            width: box.width * ratio,
            height: box.height * ratio,
          }}
        />
        <span
          className={shape === 'cover' ? 'cropper__mask cropper__mask--cover' : 'cropper__mask'}
          style={{ inset }}
          aria-hidden="true"
        />
      </div>
      <Slider
        className="cropper__zoom"
        label={t.crop.zoomLabel}
        min={lowest}
        max={MAX_ZOOM * 100}
        step={1}
        value={Math.max(lowest, Math.round(crop.zoom * 100))}
        formatValue={(value) => format(t.crop.zoomValue, { n: value })}
        onValueChange={(value) => zoomTo(() => value / 100)}
      />
    </div>
  );
}
