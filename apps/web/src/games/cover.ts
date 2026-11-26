import type { SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_ACCEPT, ImageScaleError, scaleImage, type ScaledImage } from '../club/image';
import { COVERS_BUCKET } from '../club/club';
import { renderCropCanvas, type CropFit, type CropState, type StoredCrop } from '../profile/crop';

/*
 * Okładka gry z kadrem (GAME-6): z wybranego pliku albo obrazu wklejonego ze schowka powstaje
 * oryginał (przeskalowany, w Storage jako `games.cover_source_path`), a z niego kwadratowa
 * okładka według kadru (`games.cover_crop`). Kadr widać w kształcie okładki z widoku gry;
 * ponowne kadrowanie zapisanej okładki zaczyna od oryginału i zapisanego kadru.
 */

/** Dłuższy bok oryginału: zapas na powiększenie kadru okładki 800 px. */
export const COVER_SOURCE_MAX_SIDE = 1600;
/** Docelowy rozmiar oryginału (bucket przyjmuje do 2 MiB). */
export const COVER_SOURCE_TARGET_BYTES = 400 * 1024;
/** Bok okładki po kadrowaniu (jak dłuższy bok okładki bez kadru, GAME-6). */
export const COVER_SIDE = 800;
/** Okładkę można oddalić, aż cały obraz zmieści się w kadrze (tło: kolor brzegów obrazu). */
export const COVER_FIT: CropFit = 'contain';
/** Tło okładki, gdy nie da się odczytać koloru brzegów. */
const DEFAULT_FILL = '#ffffff';

const ACCEPTED = new Set(IMAGE_ACCEPT.split(','));

/** Oryginał do kadrowania: obraz zmniejszony do 1600 px (WebP/JPEG). */
export function prepareCoverSource(file: Blob): Promise<ScaledImage> {
  return scaleImage(file, {
    maxSide: COVER_SOURCE_MAX_SIDE,
    targetBytes: COVER_SOURCE_TARGET_BYTES,
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 1));
}

/**
 * Średni kolor brzegów obrazu (`#rrggbb`): tło okładki oddalonej tak, że obraz nie wypełnia
 * kadru. Zdjęcie pudełka na jednolitym tle dostaje to tło, więc okładka wygląda naturalnie.
 */
export function edgeColor(source: CanvasImageSource): string {
  const side = 32;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return DEFAULT_FILL;
  try {
    context.drawImage(source, 0, 0, side, side);
    const { data } = context.getImageData(0, 0, side, side);
    const sum = [0, 0, 0];
    let count = 0;
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        if (x !== 0 && y !== 0 && x !== side - 1 && y !== side - 1) continue;
        const i = (y * side + x) * 4;
        // Przezroczyste piksele (PNG) liczą się jako białe.
        const alpha = (data[i + 3] ?? 255) / 255;
        for (let c = 0; c < 3; c += 1) {
          sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 255) * alpha + 255 * (1 - alpha);
        }
        count += 1;
      }
    }
    const hex = (value: number | undefined) =>
      Math.round((value ?? 255) / count)
        .toString(16)
        .padStart(2, '0');
    return `#${hex(sum[0])}${hex(sum[1])}${hex(sum[2])}`;
  } catch {
    return DEFAULT_FILL;
  }
}

/**
 * Okładka z kadru: kwadrat do 800 px (bez powiększania ponad rozdzielczość oryginału),
 * zakodowany jak dotąd (WebP ok. 100 KB, `scaleImage`). Tło odsłonięte przy oddaleniu
 * wypełnia `fill`.
 */
export async function renderCover(
  source: CanvasImageSource & { readonly width: number; readonly height: number },
  crop: CropState,
  view: number,
  fill: string = DEFAULT_FILL,
): Promise<ScaledImage> {
  const canvas = renderCropCanvas(source, crop, view, COVER_SIDE, COVER_FIT, fill);
  const png = await toBlob(canvas, 'image/png');
  if (!png) throw new ImageScaleError('decode');
  return scaleImage(png, { maxSide: COVER_SIDE });
}

/** Pierwszy obraz ze zdarzenia wklejenia (Ctrl+V / ⌘V); `null` = w schowku nie ma obrazu. */
export function clipboardImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** Czy przeglądarka pozwala odczytać obraz ze schowka przyciskiem (Clipboard API). */
export function canReadClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
}

export type ClipboardFailure = 'empty' | 'denied';

export class ClipboardError extends Error {
  constructor(readonly reason: ClipboardFailure) {
    super(`clipboard: ${reason}`);
    this.name = 'ClipboardError';
  }
}

/**
 * Obraz ze schowka po kliknięciu „Wklej ze schowka” w edytorze okładki. Najpierw typy przyjmowane przez bucket,
 * potem dowolny obraz (o odrzuceniu zdecyduje skalowanie).
 */
export async function readClipboardImage(): Promise<Blob> {
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new ClipboardError('denied');
  }
  for (const item of items) {
    const type =
      item.types.find((candidate) => ACCEPTED.has(candidate)) ??
      item.types.find((candidate) => candidate.startsWith('image/'));
    if (type) return item.getType(type);
  }
  throw new ClipboardError('empty');
}

/** Zapisany obraz z bucketu `covers` (oryginał albo okładka) do ponownego kadrowania. */
export async function downloadCover(client: SupabaseClient, path: string): Promise<Blob> {
  const { data, error } = await client.storage.from(COVERS_BUCKET).download(path);
  if (error) throw error;
  return data;
}

/** Skąd pochodzi oryginał nowej okładki. */
export type CoverSource =
  /** Nowy plik albo obraz ze schowka: trafi do Storage razem z okładką. */
  | { readonly kind: 'upload'; readonly image: ScaledImage }
  /** Plik już w Storage (oryginał zapisanej okładki albo sama okładka sprzed kadrowania). */
  | { readonly kind: 'existing'; readonly path: string };

/** Nowa okładka: wynik kadru, kadr i oryginał. */
export interface CroppedCover {
  readonly image: ScaledImage;
  readonly crop: StoredCrop;
  readonly source: CoverSource;
}
