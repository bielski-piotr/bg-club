/**
 * Kadrowanie awatara w przeglądarce (PRD USR-3, NFR-7): użytkownik przesuwa i powiększa zdjęcie
 * w kwadratowym kadrze, a wynik to kwadrat 256×256 w WebP (ok. 10–30 KB). Do Storage trafia
 * tylko wynik, nigdy oryginalny plik.
 *
 * Model: obraz o wymiarach `width`×`height` jest wyświetlany w kwadratowym kadrze o boku `view`
 * px. Przy powiększeniu 1 krótszy bok obrazu wypełnia kadr („cover”), a środek obrazu jest
 * przesunięty o (`x`, `y`) px kadru względem środka kadru. Obraz zawsze pokrywa cały kadr.
 */

/** Bok zapisanego awatara (USR-3). */
export const AVATAR_SIDE = 256;
/** Największe powiększenie względem „cover”. */
export const MAX_ZOOM = 4;
/** Limit bucketu `avatars` (migracja access_control). */
export const AVATAR_MAX_BYTES = 1024 * 1024;
/** Typy przyjmowane przez input pliku (USR-3). */
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';
/** Największy plik wejściowy: większy nie jest dekodowany (pamięć telefonu). */
export const AVATAR_INPUT_MAX_BYTES = 25 * 1024 * 1024;

export interface CropState {
  /** Powiększenie 1…MAX_ZOOM. */
  readonly zoom: number;
  /** Przesunięcie środka obrazu względem środka kadru, w px kadru. */
  readonly x: number;
  readonly y: number;
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export const INITIAL_CROP: CropState = { zoom: 1, x: 0, y: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Skala obrazu w kadrze (px kadru na px obrazu). */
export function displayScale(image: ImageSize, view: number, zoom: number): number {
  return (view / Math.min(image.width, image.height)) * zoom;
}

/** Powiększenie w dozwolonym zakresie i przesunięcie, przy którym obraz pokrywa kadr. */
export function clampCrop(state: CropState, image: ImageSize, view: number): CropState {
  const zoom = clamp(Number.isFinite(state.zoom) ? state.zoom : 1, 1, MAX_ZOOM);
  const scale = displayScale(image, view, zoom);
  const maxX = Math.max(0, (image.width * scale - view) / 2);
  const maxY = Math.max(0, (image.height * scale - view) / 2);
  // `+ 0` zamienia -0 na 0 (stabilne porównania w testach i stanie).
  return { zoom, x: clamp(state.x, -maxX, maxX) + 0, y: clamp(state.y, -maxY, maxY) + 0 };
}

/** Przesuwa kadr o (dx, dy) px kadru. */
export function panCrop(
  state: CropState,
  dx: number,
  dy: number,
  image: ImageSize,
  view: number,
): CropState {
  return clampCrop({ ...state, x: state.x + dx, y: state.y + dy }, image, view);
}

/** Zmienia powiększenie, zachowując punkt obrazu w środku kadru. */
export function zoomCrop(
  state: CropState,
  zoom: number,
  image: ImageSize,
  view: number,
): CropState {
  const next = clamp(zoom, 1, MAX_ZOOM);
  const ratio = next / state.zoom;
  return clampCrop({ zoom: next, x: state.x * ratio, y: state.y * ratio }, image, view);
}

/** Wycinany kwadrat w pikselach obrazu źródłowego. */
export interface SourceRect {
  readonly sx: number;
  readonly sy: number;
  readonly side: number;
}

export function sourceRect(state: CropState, image: ImageSize, view: number): SourceRect {
  const { zoom, x, y } = clampCrop(state, image, view);
  const scale = displayScale(image, view, zoom);
  const side = view / scale;
  // Środek kadru w pikselach obrazu.
  const cx = image.width / 2 - x / scale;
  const cy = image.height / 2 - y / scale;
  return {
    sx: clamp(cx - side / 2, 0, image.width - side),
    sy: clamp(cy - side / 2, 0, image.height - side),
    side,
  };
}

/** Pozycja obrazu w kadrze (lewy górny róg i rozmiar w px kadru) do wyświetlenia podglądu. */
export function imageBox(state: CropState, image: ImageSize, view: number) {
  const scale = displayScale(image, view, state.zoom);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: (view - width) / 2 + state.x,
    top: (view - height) / 2 + state.y,
    width,
    height,
  };
}

export type AvatarImageError = 'type' | 'decode' | 'size';

export class AvatarImageFailure extends Error {
  constructor(readonly reason: AvatarImageError) {
    super(`avatar: ${reason}`);
    this.name = 'AvatarImageFailure';
  }
}

const ACCEPTED = new Set(AVATAR_ACCEPT.split(','));

/**
 * Sprawdza plik przed dekodowaniem: typ JPG/PNG/WebP i rozsądny rozmiar. Pusty typ (część
 * systemów nie zna np. WebP) przepuszczamy: o poprawności rozstrzyga wtedy dekodowanie.
 */
export function checkAvatarFile(file: Pick<File, 'type' | 'size'>): AvatarImageError | null {
  if (file.type !== '' && !ACCEPTED.has(file.type)) return 'type';
  if (file.size > AVATAR_INPUT_MAX_BYTES) return 'size';
  return null;
}

export interface AvatarImage {
  readonly blob: Blob;
  readonly extension: 'webp' | 'png';
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Rysuje wybrany kwadrat jako 256×256 i koduje do WebP (PNG, gdy przeglądarka nie koduje WebP).
 * `source` to zdekodowany obraz (`createImageBitmap` uwzględnia orientację z EXIF).
 */
export async function renderAvatar(
  source: CanvasImageSource & ImageSize,
  state: CropState,
  view: number,
): Promise<AvatarImage> {
  const { sx, sy, side } = sourceRect(state, source, view);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarImageFailure('decode');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
  const webp = await toBlob(canvas, 'image/webp', 0.85);
  const blob = webp?.type === 'image/webp' ? webp : await toBlob(canvas, 'image/png', 1);
  if (!blob) throw new AvatarImageFailure('decode');
  if (blob.size > AVATAR_MAX_BYTES) throw new AvatarImageFailure('size');
  return { blob, extension: blob.type === 'image/webp' ? 'webp' : 'png' };
}

/**
 * Kadr zapisany w bazie (okładka gry, `games.cover_crop`): przesunięcie jako ułamek boku kadru,
 * więc nie zależy od wielkości kadru na ekranie.
 */
export interface StoredCrop {
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
}

/** Kadr ekranu (px kadru o boku `view`) → postać zapisywana w bazie. */
export function toStoredCrop(state: CropState, view: number): StoredCrop {
  const round = (value: number) => Math.round(value * 10000) / 10000 + 0;
  return { zoom: round(state.zoom), x: round(state.x / view), y: round(state.y / view) };
}

/** Kadr z bazy (albo `null` / niepoprawny) → kadr ekranu, dopasowany do obrazu. */
export function fromStoredCrop(stored: unknown, image: ImageSize, view: number): CropState {
  const value = (stored ?? {}) as Partial<Record<keyof StoredCrop, unknown>>;
  const number = (raw: unknown, fallback: number) =>
    typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  return clampCrop(
    {
      zoom: number(value.zoom, 1),
      x: number(value.x, 0) * view,
      y: number(value.y, 0) * view,
    },
    image,
    view,
  );
}

/**
 * Rysuje wybrany kwadrat na płótnie o boku `side` (bez powiększania ponad rozdzielczość
 * źródła: bok wyniku to najwyżej bok wycinka w pikselach obrazu).
 */
export function renderCropCanvas(
  source: CanvasImageSource & ImageSize,
  state: CropState,
  view: number,
  side: number,
): HTMLCanvasElement {
  const rect = sourceRect(state, source, view);
  const out = Math.max(1, Math.round(Math.min(side, rect.side)));
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarImageFailure('decode');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, rect.sx, rect.sy, rect.side, rect.side, 0, 0, out, out);
  return canvas;
}
