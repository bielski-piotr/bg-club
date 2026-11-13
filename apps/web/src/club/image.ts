/**
 * Skalowanie obrazów w przeglądarce przed wysłaniem do Storage (GAME-6, CLUB-2): dłuższy bok
 * najwyżej `maxSide` px, format WebP (albo JPEG, gdy przeglądarka nie koduje WebP). Mniejszy
 * obraz nie jest powiększany. Jakość spada stopniowo, aż plik zmieści się w ok. 100 KB
 * (NFR-7); bucket przyjmuje WebP, JPEG i PNG do 2 MiB.
 */

/** Dłuższy bok okładki gry i logo klubu (GAME-6). */
export const IMAGE_MAX_SIDE = 800;
/** Limit bucketu `covers` (migracja access_control). */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Docelowy rozmiar okładki i logo (NFR-7: okładka ≈ 100 KB). */
export const IMAGE_TARGET_BYTES = 100 * 1024;
/** Kolejne jakości kodowania: pierwsza, przy której plik mieści się w celu, wygrywa. */
export const IMAGE_QUALITIES = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46] as const;
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

/** Koder obrazu: typ MIME i jakość → plik (albo `null`, gdy się nie udało). */
export type ImageEncoder = (type: string, quality: number) => Promise<Blob | null>;

/**
 * Najlepsza jakość, przy której plik mieści się w `targetBytes`. WebP, a gdy przeglądarka go nie
 * koduje (zwraca inny typ), JPEG. Gdy nawet najniższa jakość jest za duża, zwraca ten najmniejszy
 * plik: o odrzuceniu decyduje twardy limit bucketu.
 */
export async function encodeWithin(
  encode: ImageEncoder,
  targetBytes: number,
): Promise<Blob | null> {
  let smallest: Blob | null = null;
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of IMAGE_QUALITIES) {
      const blob = await encode(type, quality);
      if (!blob || blob.type !== type) break;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= targetBytes) return blob;
    }
    if (smallest) return smallest;
  }
  return smallest;
}

export interface ScaleOptions {
  readonly maxSide?: number | undefined;
  readonly targetBytes?: number | undefined;
}

export async function scaleImage(file: File, options: ScaleOptions = {}): Promise<ScaledImage> {
  const { maxSide = IMAGE_MAX_SIDE, targetBytes = IMAGE_TARGET_BYTES } = options;
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
    // JPEG nie ma przezroczystości: bez tła przezroczyste piksele byłyby czarne.
    let opaque: HTMLCanvasElement | undefined;
    const onWhite = () => {
      if (opaque) return opaque;
      opaque = document.createElement('canvas');
      opaque.width = width;
      opaque.height = height;
      const flat = opaque.getContext('2d');
      if (flat) {
        flat.fillStyle = '#ffffff';
        flat.fillRect(0, 0, width, height);
        flat.drawImage(canvas, 0, 0);
      }
      return opaque;
    };
    const blob = await encodeWithin(
      (type, quality) => toBlob(type === 'image/jpeg' ? onWhite() : canvas, type, quality),
      targetBytes,
    );
    const extension = blob ? EXTENSIONS[blob.type] : undefined;
    if (!blob || !extension) throw new ImageScaleError('decode');
    if (blob.size > IMAGE_MAX_BYTES) throw new ImageScaleError('size');
    return { blob, extension, width, height };
  } finally {
    bitmap.close();
  }
}
