import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { format, t } from '../i18n';
import { Slider } from '../ui';
import {
  clampCrop,
  imageBox,
  INITIAL_CROP,
  MAX_ZOOM,
  panCrop,
  zoomCrop,
  type CropState,
  type ImageSize,
} from './crop';

/** Bok kadru w px. Mieści się na ekranie 360 px z marginesami 16 (DS §7). */
export const CROP_VIEW = 280;
/** Krok przesunięcia strzałką (Shift: większy). */
const KEY_STEP = 8;
const ZOOM_STEP = 0.1;

interface AvatarCropperProps {
  /** Adres podglądu (object URL pliku). */
  readonly src: string;
  readonly image: ImageSize;
  readonly crop: CropState;
  readonly onCropChange: (crop: CropState) => void;
}

/**
 * Kadr awatara (USR-3, DS „Profil / Kadrowanie awatara”): kwadratowy kadr z okrągłą maską.
 * Zdjęcie przesuwa się przeciągnięciem (mysz, palec) albo strzałkami, a powiększa suwakiem,
 * kółkiem myszy albo klawiszami + i −. Zdjęcie zawsze pokrywa cały kadr.
 */
export function AvatarCropper({ src, image, crop, onCropChange }: AvatarCropperProps) {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const box = imageBox(crop, image, CROP_VIEW);

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
    onCropChange(panCrop(crop, dx, dy, image, CROP_VIEW));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  // Kółko myszy powiększa zdjęcie zamiast przewijać popup: React podpina `wheel` jako pasywny,
  // więc nasłuch z `passive: false` jest podpięty ręcznie (z bieżącym stanem w refie).
  const stage = useRef<HTMLDivElement>(null);
  const latest = useRef({ crop, image, onCropChange });
  useEffect(() => {
    latest.current = { crop, image, onCropChange };
  });
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const current = latest.current;
      const next = current.crop.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08);
      current.onCropChange(zoomCrop(current.crop, next, current.image, CROP_VIEW));
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
    const pan = pans[event.key];
    if (pan) {
      event.preventDefault();
      onCropChange(panCrop(crop, pan[0], pan[1], image, CROP_VIEW));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onCropChange(zoomCrop(crop, crop.zoom + ZOOM_STEP, image, CROP_VIEW));
    } else if (event.key === '-') {
      event.preventDefault();
      onCropChange(zoomCrop(crop, crop.zoom - ZOOM_STEP, image, CROP_VIEW));
    } else if (event.key === '0') {
      event.preventDefault();
      onCropChange(clampCrop(INITIAL_CROP, image, CROP_VIEW));
    }
  };

  return (
    <div className="cropper">
      <div
        ref={stage}
        className={dragging ? 'cropper__stage cropper__stage--dragging' : 'cropper__stage'}
        style={{ width: CROP_VIEW, height: CROP_VIEW }}
        role="group"
        aria-label={t.crop.stageLabel}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <img
          className="cropper__image"
          src={src}
          alt=""
          draggable={false}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
        <span className="cropper__mask" aria-hidden="true" />
      </div>
      <Slider
        className="cropper__zoom"
        label={t.crop.zoomLabel}
        min={100}
        max={MAX_ZOOM * 100}
        step={1}
        value={Math.round(crop.zoom * 100)}
        formatValue={(value) => format(t.crop.zoomValue, { n: value })}
        onValueChange={(value) => onCropChange(zoomCrop(crop, value / 100, image, CROP_VIEW))}
      />
    </div>
  );
}
