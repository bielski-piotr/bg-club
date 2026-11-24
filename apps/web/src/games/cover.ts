import type { SupabaseClient } from '@supabase/supabase-js';
import { IMAGE_ACCEPT, ImageScaleError, scaleImage, type ScaledImage } from '../club/image';
import { COVERS_BUCKET } from '../hub/club';
import { renderCropCanvas, type CropState, type StoredCrop } from '../profile/crop';

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
 * Okładka z kadru: kwadrat do 800 px (bez powiększania ponad rozdzielczość oryginału),
 * zakodowany jak dotąd (WebP ok. 100 KB, `scaleImage`).
 */
export async function renderCover(
  source: CanvasImageSource & { readonly width: number; readonly height: number },
  crop: CropState,
  view: number,
): Promise<ScaledImage> {
  const canvas = renderCropCanvas(source, crop, view, COVER_SIDE);
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
 * Obraz ze schowka po kliknięciu „Wklej ze schowka”. Najpierw typy przyjmowane przez bucket,
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
