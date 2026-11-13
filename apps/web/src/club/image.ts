/**
 * Skalowanie obrazów w przeglądarce przed wysłaniem do Storage (GAME-6, CLUB-2): dłuższy bok
 * najwyżej `maxSide` px, format WebP (albo PNG/JPEG, gdy przeglądarka nie koduje WebP).
 * Mniejszy obraz nie jest powiększany. Bucket przyjmuje WebP, JPEG i PNG do 2 MiB.
 */

/** Dłuższy bok okładki gry i logo klubu (GAME-6). */
export const IMAGE_MAX_SIDE = 800;
/** Limit bucketu `covers` (migracja access_control). */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Typy przyjmowane przez input pliku (i bucket). */
export const IMAGE_ACCEPT = 'image/webp,image/jpeg,image/png';

const ACCEPTED = new Set(IMAGE_ACCEPT.split(','));

export type ImageError = 'type' | 'decode' | 'size';

export class ImageScaleError extends Error {
  constructor(readonly reason: ImageError) {
    super(`image: ${reason}`);
    this.name = 'ImageScaleError';
  }
}

export interface ScaledImage {
  readonly blob: Blob;
  /** Rozszerzenie pliku według typu wyniku. */
  readonly extension: 'webp' | 'png' | 'jpg';
  readonly width: number;
  readonly height: number;
}

/** Wymiary po przeskalowaniu: dłuższy bok najwyżej `maxSide`, proporcje zachowane. */
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const EXTENSIONS: Readonly<Record<string, ScaledImage['extension']>> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function scaleImage(file: File, maxSide = IMAGE_MAX_SIDE): Promise<ScaledImage> {
  if (!ACCEPTED.has(file.type)) throw new ImageScaleError('type');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageScaleError('decode');
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageScaleError('decode');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    // Przeglądarka bez kodera WebP zwraca PNG; wtedy JPEG z przezroczystością byłby gorszy.
    const blob =
      (await toBlob(canvas, 'image/webp', 0.86)) ?? (await toBlob(canvas, 'image/png', 1));
    const extension = blob ? EXTENSIONS[blob.type] : undefined;
    if (!blob || !extension) throw new ImageScaleError('decode');
    if (blob.size > IMAGE_MAX_BYTES) throw new ImageScaleError('size');
    return { blob, extension, width, height };
  } finally {
    bitmap.close();
  }
}
