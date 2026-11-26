/**
 * Kadrowanie awatara w przeglądarce: użytkownik przesuwa i powiększa zdjęcie
 * w kwadratowym kadrze, a wynik to kwadrat 256×256 w WebP (ok. 10–30 KB). Do Storage trafia
 * tylko wynik, nigdy oryginalny plik.
 *
 * Model: obraz o wymiarach `width`×`height` jest wyświetlany w kwadratowym kadrze o boku `view`
 * px. Przy powiększeniu 1 krótszy bok obrazu wypełnia kadr („cover”), a środek obrazu jest
 * przesunięty o (`x`, `y`) px kadru względem środka kadru. Obraz zawsze pokrywa cały kadr.
 */

/** Bok zapisanego awatara. */
export const AVATAR_SIDE = 256;
/** Największe powiększenie względem „cover”. */
export const MAX_ZOOM = 4;
/** Limit bucketu `avatars` (migracja access_control). */
export const AVATAR_MAX_BYTES = 1024 * 1024;
/** Typy przyjmowane przez input pliku. */
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

/**
 * Jak bardzo można oddalić obraz: `cover` = obraz zawsze pokrywa cały kadr (awatar),
 * `contain` = można oddalić aż cały obraz zmieści się w kadrze, a odsłonięte tło wypełnia
 * kolor (okładka gry).
 */
export type CropFit = 'cover' | 'contain';

/** Najmniejsze powiększenie: 1 (krótszy bok wypełnia kadr) albo dłuższy bok równy kadrowi. */
export function minZoom(image: ImageSize, fit: CropFit = 'cover'): number {
  if (fit === 'cover') return 1;
  const short = Math.min(image.width, image.height);
  const long = Math.max(image.width, image.height);
  return long > 0 ? Math.min(1, short / long) : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Skala obrazu w kadrze (px kadru na px obrazu). */
export function displayScale(image: ImageSize, view: number, zoom: number): number {
  return (view / Math.min(image.width, image.height)) * zoom;
}

/**
 * Powiększenie w dozwolonym zakresie i przesunięcie: obraz większy od kadru zawsze go pokrywa,
 * a mniejszy (oddalony, `contain`) nie wychodzi poza kadr.
 */
export function clampCrop(
  state: CropState,
  image: ImageSize,
  view: number,
  fit: CropFit = 'cover',
): CropState {
  const zoom = clamp(Number.isFinite(state.zoom) ? state.zoom : 1, minZoom(image, fit), MAX_ZOOM);
  const scale = displayScale(image, view, zoom);
  const maxX = Math.abs(image.width * scale - view) / 2;
  const maxY = Math.abs(image.height * scale - view) / 2;
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
  fit: CropFit = 'cover',
): CropState {
  return clampCrop({ ...state, x: state.x + dx, y: state.y + dy }, image, view, fit);
}

/** Zmienia powiększenie, zachowując punkt obrazu w środku kadru. */
export function zoomCrop(
  state: CropState,
  zoom: number,
  image: ImageSize,
  view: number,
  fit: CropFit = 'cover',
): CropState {
  const next = clamp(zoom, minZoom(image, fit), MAX_ZOOM);
  const ratio = next / state.zoom;
  return clampCrop({ zoom: next, x: state.x * ratio, y: state.y * ratio }, image, view, fit);
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
export function fromStoredCrop(
  stored: unknown,
  image: ImageSize,
  view: number,
  fit: CropFit = 'cover',
): CropState {
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
    fit,
  );
}

/**
 * Kadr w pikselach obrazu: środek i bok kwadratu. Przy oddaleniu (`contain`) kwadrat może
 * wychodzić poza obraz.
 */
export function cropFrame(
  state: CropState,
  image: ImageSize,
  view: number,
  fit: CropFit = 'cover',
): { readonly cx: number; readonly cy: number; readonly side: number } {
  const { zoom, x, y } = clampCrop(state, image, view, fit);
  const scale = displayScale(image, view, zoom);
  return { cx: image.width / 2 - x / scale, cy: image.height / 2 - y / scale, side: view / scale };
}

/**
 * Rysuje wybrany kwadrat na płótnie o boku `side` (bez powiększania ponad rozdzielczość
 * źródła: bok wyniku to najwyżej bok wycinka w pikselach obrazu). Tło odsłonięte przy
 * oddaleniu wypełnia kolor `fill`.
 */
export function renderCropCanvas(
  source: CanvasImageSource & ImageSize,
  state: CropState,
  view: number,
  side: number,
  fit: CropFit = 'cover',
  fill = '#ffffff',
): HTMLCanvasElement {
  const frame = cropFrame(state, source, view, fit);
  const out = Math.max(1, Math.round(Math.min(side, frame.side)));
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarImageFailure('decode');
  context.imageSmoothingQuality = 'high';
  const k = out / frame.side;
  const left = (frame.side / 2 - frame.cx) * k;
  const top = (frame.side / 2 - frame.cy) * k;
  const width = source.width * k;
  const height = source.height * k;
  if (left > 0 || top > 0 || left + width < out || top + height < out) {
    context.fillStyle = fill;
    context.fillRect(0, 0, out, out);
  }
  context.drawImage(source, left, top, width, height);
  return canvas;
}
