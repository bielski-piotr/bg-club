import { describe, expect, it } from 'vitest';
import {
  AVATAR_INPUT_MAX_BYTES,
  checkAvatarFile,
  clampCrop,
  imageBox,
  INITIAL_CROP,
  MAX_ZOOM,
  panCrop,
  sourceRect,
  zoomCrop,
} from './crop';

const VIEW = 280;
const LANDSCAPE = { width: 1200, height: 800 };
const PORTRAIT = { width: 600, height: 900 };

describe('kadrowanie awatara (USR-3)', () => {
  it('na starcie krótszy bok wypełnia kadr, a kadr jest na środku', () => {
    expect(sourceRect(INITIAL_CROP, LANDSCAPE, VIEW)).toEqual({ sx: 200, sy: 0, side: 800 });
    expect(sourceRect(INITIAL_CROP, PORTRAIT, VIEW)).toEqual({ sx: 0, sy: 150, side: 600 });
    expect(imageBox(INITIAL_CROP, LANDSCAPE, VIEW)).toEqual({
      left: -70,
      top: 0,
      width: 420,
      height: 280,
    });
  });

  it('przesunięcie nie odsłania tła: obraz zawsze pokrywa kadr', () => {
    // Przy powiększeniu 1 obraz 1200×800 ma w kadrze 420×280: w poziomie zapas ±70, w pionie 0.
    expect(panCrop(INITIAL_CROP, 500, 500, LANDSCAPE, VIEW)).toEqual({ zoom: 1, x: 70, y: 0 });
    expect(panCrop(INITIAL_CROP, -500, -500, LANDSCAPE, VIEW)).toEqual({ zoom: 1, x: -70, y: 0 });
    // Przesunięcie w prawo pokazuje lewą krawędź zdjęcia.
    expect(sourceRect({ zoom: 1, x: 70, y: 0 }, LANDSCAPE, VIEW)).toEqual({
      sx: 0,
      sy: 0,
      side: 800,
    });
  });

  it('powiększenie ma zakres 1…MAX i zachowuje punkt na środku kadru', () => {
    expect(zoomCrop(INITIAL_CROP, 10, LANDSCAPE, VIEW).zoom).toBe(MAX_ZOOM);
    expect(zoomCrop(INITIAL_CROP, 0.2, LANDSCAPE, VIEW).zoom).toBe(1);

    const moved = { zoom: 1, x: 40, y: 0 };
    const before = sourceRect(moved, LANDSCAPE, VIEW);
    const zoomed = zoomCrop(moved, 2, LANDSCAPE, VIEW);
    const after = sourceRect(zoomed, LANDSCAPE, VIEW);
    expect(after.side).toBe(400);
    expect(after.sx + after.side / 2).toBeCloseTo(before.sx + before.side / 2);
    expect(after.sy + after.side / 2).toBeCloseTo(before.sy + before.side / 2);
  });

  it('oddalenie przycina przesunięcie do nowego zapasu', () => {
    const zoomedIn = panCrop({ zoom: 3, x: 0, y: 0 }, 1000, 1000, PORTRAIT, VIEW);
    expect(zoomedIn).toEqual({ zoom: 3, x: 280, y: 490 });
    expect(zoomCrop(zoomedIn, 1, PORTRAIT, VIEW)).toEqual({ zoom: 1, x: 0, y: 70 });
  });

  it('wycinek zawsze mieści się w obrazie, także dla małych i skrajnych zdjęć', () => {
    for (const image of [
      LANDSCAPE,
      PORTRAIT,
      { width: 40, height: 40 },
      { width: 3000, height: 90 },
    ]) {
      for (const state of [
        INITIAL_CROP,
        { zoom: MAX_ZOOM, x: 9999, y: -9999 },
        { zoom: 2.5, x: -12, y: 33 },
      ]) {
        const { sx, sy, side } = sourceRect(state, image, VIEW);
        expect(sx).toBeGreaterThanOrEqual(0);
        expect(sy).toBeGreaterThanOrEqual(0);
        expect(sx + side).toBeLessThanOrEqual(image.width + 1e-9);
        expect(sy + side).toBeLessThanOrEqual(image.height + 1e-9);
        expect(side).toBeCloseTo(
          Math.min(image.width, image.height) / clampCrop(state, image, VIEW).zoom,
        );
      }
    }
  });

  it('przyjmuje JPG, PNG i WebP do 25 MB', () => {
    expect(checkAvatarFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(checkAvatarFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(checkAvatarFile({ type: 'image/webp', size: AVATAR_INPUT_MAX_BYTES })).toBeNull();
    expect(checkAvatarFile({ type: '', size: 1000 })).toBeNull();
    expect(checkAvatarFile({ type: 'image/gif', size: 1000 })).toBe('type');
    expect(checkAvatarFile({ type: 'image/heic', size: 1000 })).toBe('type');
    expect(checkAvatarFile({ type: 'image/jpeg', size: AVATAR_INPUT_MAX_BYTES + 1 })).toBe('size');
  });
});
