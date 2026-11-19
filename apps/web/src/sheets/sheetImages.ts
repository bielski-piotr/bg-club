import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Obraz oderwanej karteczki. Notes robi obraz kartki
 * z pismem w chwili oderwania; aplikacja wgrywa go do bucketu `sheets` od razu, gdy
 * użytkownik ogląda podsumowanie, a po zapisie partii (`save_play`) dołącza go RPC
 * `attach_play_sheet_image`.
 *
 * Obraz jest tylko podglądem w historii: partia ma pełne wpisy kartki i wersję szablonu, więc
 * nieudany upload (przed zapisem) albo nieudane dołączenie (po zapisie) nie psują historii ani
 * nie blokują zapisu wyników. Plik, którego nie wskazuje żadna partia, aplikacja usuwa sama
 * (anulowane podsumowanie, zbędne ponowne wgranie), a pozostałe po przerwanych zapisach
 * sprząta po kolejnym zapisie partii w tym spotkaniu (`orphan_sheet_images`).
 */

export const SHEETS_BUCKET = 'sheets';

/** Dłuższy bok i rozmiar obrazu karteczki (karteczka ≈ 150 KB). */
export const SHEET_IMAGE_MAX_SIDE = 1200;
export const SHEET_IMAGE_MAX_BYTES = 150 * 1024;

/** Opóźnienia ponowień uploadu i dołączenia po błędzie sieci (ms). */
export const SHEET_IMAGE_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

export interface SheetImageOptions {
  readonly retryDelays?: readonly number[] | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  /** Losowy sufiks nazwy (testy). */
  readonly suffix?: (() => string) | undefined;
  /** Jak długo zapis partii czeka na trwający upload (ms). */
  readonly uploadWaitMs?: number | undefined;
}

/**
 * Po tylu ms zapis partii przestaje czekać na upload obrazu: partia zostaje bez obrazu, a plik
 * wgrany później posprząta `orphan_sheet_images`.
 */
export const SHEET_IMAGE_UPLOAD_WAIT_MS = 20_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function randomSuffix(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Nazwa pliku obrazu: `<meeting_id>/<play_id>-<losowy sufiks>.<webp|png>`. Każda próba ma
 * nową nazwę (bucket nie pozwala nadpisywać), więc ponowienie nie trafia na istniejący plik.
 */
export function newSheetImagePath(
  meetingId: string,
  playId: string,
  type: string,
  suffix: () => string = randomSuffix,
): string {
  const extension = type === 'image/png' ? 'png' : 'webp';
  return `${meetingId.toLowerCase()}/${playId.toLowerCase()}-${suffix()}.${extension}`;
}

/** Wynik operacji z ponowieniami: `retry` = błąd sieci albo serwera, `stop` = ostateczny. */
type Attempt<T> = { readonly ok: T } | { readonly fail: 'retry' | 'stop' };

async function withRetries<T>(
  run: () => Promise<Attempt<T>>,
  options: SheetImageOptions,
): Promise<T | null> {
  const delays = options.retryDelays ?? SHEET_IMAGE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? wait;
  for (let attempt = 0; ; attempt++) {
    let result: Attempt<T>;
    try {
      result = await run();
    } catch {
      result = { fail: 'retry' };
    }
    if ('ok' in result) return result.ok;
    const delay = delays[attempt];
    if (result.fail === 'stop' || delay === undefined) return null;
    await sleep(delay);
  }
}

interface StorageLikeError {
  readonly statusCode?: string | number | undefined;
  readonly status?: number | undefined;
}

/** Błąd Storage, którego ponowienie nie naprawi (uprawnienia, typ, rozmiar, zła nazwa). */
function isFinalStorageError(error: StorageLikeError): boolean {
  const status = Number(error.statusCode ?? error.status ?? 0);
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Wgrywa obraz karteczki partii. Zwraca ścieżkę w buckecie albo `null`, gdy obrazu nie ma
 * albo nie udało się go wysłać (partia i tak zapisze się z wpisami kartki).
 */
export async function uploadSheetImage(
  client: SupabaseClient,
  play: { readonly id: string; readonly meeting_id: string },
  image: Blob | null,
  options: SheetImageOptions = {},
): Promise<string | null> {
  if (!image || image.size === 0) return null;
  const type = image.type === 'image/png' ? 'image/png' : 'image/webp';
  return withRetries(async () => {
    // Nowa nazwa przy każdej próbie: przerwany upload mógł jednak zapisać plik.
    const path = newSheetImagePath(play.meeting_id, play.id, type, options.suffix);
    const { error } = await client.storage
      .from(SHEETS_BUCKET)
      .upload(path, image, { contentType: type, upsert: false, cacheControl: '31536000' });
    if (!error) return { ok: path };
    return { fail: isFinalStorageError(error as StorageLikeError) ? 'stop' : 'retry' };
  }, options);
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
}

/**
 * Dołącza wgrany obraz do zapisanej partii. Zwraca ścieżkę obrazu, który partia wskazuje po
 * wywołaniu (inną, gdy obraz był już dołączony), albo `null`, gdy się nie udało.
 */
export async function attachSheetImage(
  client: SupabaseClient,
  playId: string,
  path: string,
  options: SheetImageOptions = {},
): Promise<string | null> {
  return withRetries(async () => {
    const { data, error } = await client
      .rpc('attach_play_sheet_image', { play_id: playId, image_path: path })
      .select('sheet_image_path')
      .single<{ sheet_image_path: string | null }>();
    if (!error) return { ok: data.sheet_image_path ?? '' };
    const code = (error as PostgrestLikeError).code;
    // Naruszenie reguły (zła ścieżka, brak pliku, partia niezapisana) albo brak uprawnień.
    return { fail: code && /^(22|23|P0|42)/.test(code) ? 'stop' : 'retry' };
  }, options);
}

/**
 * Usuwa pliki obrazów. Nie rzuca (plik bez partii posprząta też `orphan_sheet_images`);
 * `false` = błąd Storage albo sieci, pliki mogą zostać.
 */
export async function removeSheetImages(
  client: SupabaseClient,
  paths: readonly string[],
): Promise<boolean> {
  if (paths.length === 0) return true;
  try {
    const { error } = await client.storage.from(SHEETS_BUCKET).remove([...paths]);
    return !error;
  } catch {
    // Usunięcie jest tylko sprzątaniem.
    return false;
  }
}

/** Spotkania, w których ta karta już sprzątała obrazy karteczek przy otwarciu. */
const sweptMeetings = new Set<string>();

/**
 * Sprzątanie przy otwarciu spotkania, raz na spotkanie w tej karcie. `false` = już było
 * (ponownie dopiero po `allowOrphanSweep`).
 */
export function claimOrphanSweep(meetingId: string): boolean {
  if (sweptMeetings.has(meetingId)) return false;
  sweptMeetings.add(meetingId);
  return true;
}

/** Kolejne otwarcie spotkania znów sprząta (np. obraz usuniętej partii został po błędzie). */
export function allowOrphanSweep(meetingId: string): void {
  sweptMeetings.delete(meetingId);
}

/** Usuwa osierocone obrazy spotkania (przerwane zapisy sprzed co najmniej 15 minut). */
export async function sweepOrphanSheetImages(
  client: SupabaseClient,
  meetingId: string,
): Promise<void> {
  try {
    const { data, error } = await client.rpc('orphan_sheet_images', { meeting_id: meetingId });
    if (error || !Array.isArray(data)) return;
    await removeSheetImages(
      client,
      (data as unknown[]).filter((name): name is string => typeof name === 'string'),
    );
  } catch {
    // Sprzątanie nie wpływa na zapis partii.
  }
}

/** Upload rozpoczęty przy oderwaniu karteczki, zanim użytkownik potwierdzi zapis. */
export type PendingSheetImage = Promise<string | null>;

/**
 * Po zapisie partii: dołącza obraz wgrany przy oderwaniu, usuwa zbędny plik (inny obraz był
 * już dołączony albo dołączenie się nie udało) i sprząta osierocone pliki spotkania.
 * Nie rzuca: obraz nie decyduje o zapisie wyników.
 */
export async function finishSheetImage(
  client: SupabaseClient,
  play: { readonly id: string; readonly meeting_id: string },
  pending: PendingSheetImage,
  options: SheetImageOptions = {},
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const path = await Promise.race([
    pending.catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), options.uploadWaitMs ?? SHEET_IMAGE_UPLOAD_WAIT_MS);
    }),
  ]);
  clearTimeout(timer);
  let attached: string | null = null;
  if (path) {
    attached = await attachSheetImage(client, play.id, path, options);
    if (attached !== path) await removeSheetImages(client, [path]);
  }
  await sweepOrphanSheetImages(client, play.meeting_id);
  return attached;
}

/** Anulowane podsumowanie: obraz z oderwania nie trafi do partii, więc plik jest zbędny. */
export async function discardSheetImage(
  client: SupabaseClient,
  pending: PendingSheetImage,
): Promise<void> {
  const path = await pending.catch(() => null);
  if (path) await removeSheetImages(client, [path]);
}
