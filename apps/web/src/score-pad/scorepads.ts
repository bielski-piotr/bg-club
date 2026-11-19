import { scorePadFileName, type ScorePadFile, type ScorePadTemplate } from '@bg-club/score-pad';
import type { ReadTemplateResult } from '@bg-club/score-pad/template';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { scaleImage } from '../club/image';
import { isUuid } from '../popups/routes';

/**
 * Notesy gry i ich wersje.
 *
 * - Każdy zapis (edytor albo import pliku `.json`) to nowa, niezmienna wersja w bazie: najpierw
 *   zdjęcie kartki trafia do Storage, potem RPC `save_scorepad` w jednej transakcji dodaje
 *   wersję i przestawia na nią notes. Gdy RPC się nie uda, wysłany plik jest usuwany, więc
 *   nieudany zapis nie zostawia ani wersji, ani pliku.
 * - Szablon w bazie jest bez zdjęcia (data URL). Aplikacja wstawia zdjęcie z powrotem przed
 *   osadzeniem w edytorze i przy eksporcie, więc plik `.json` z eksportu jest przenośny.
 * - Zmiana nazwy i usunięcie (miękkie) nie zmieniają wersji: rozegrane partie zachowują
 *   swoją wersję i obraz (Storage nie pozwala usunąć pliku wskazanego przez wersję).
 */

export const SCOREPADS_BUCKET = 'scorepads';

/** Limit bucketu `scorepads` (migracja access_control): zdjęcie kartki 1–3 MB. */
export const SCOREPAD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Najdłuższa nazwa notesu. Baza przyjmuje 80 znaków, ale format pliku notesu (i edytor) skraca
 * nazwę do 40, więc tyle pozwalamy wpisać, żeby edycja i eksport nie obcinały nazwy.
 */
export const SCOREPAD_NAME_MAX = 40;

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Aktualna wersja notesu (bez szablonu: lista go nie potrzebuje). */
export interface ScorepadVersion {
  readonly id: string;
  readonly version: number;
  readonly image_path: string | null;
  readonly player_slots: number;
  /** Notes z zespołami: kilku graczy na jednym miejscu kartki (`scorepad_versions.teams`). */
  readonly teams?: boolean | undefined;
  readonly created_at: string;
}

export interface Scorepad {
  readonly id: string;
  readonly game_id: string;
  readonly name: string;
  readonly created_at: string;
  /** `null` tylko przez chwilę przy tworzeniu notesu (przed pierwszą wersją). */
  readonly current: ScorepadVersion | null;
}

const SCOREPAD_COLUMNS =
  'id, game_id, name, created_at, current:scorepad_versions!scorepads_current_version_fkey(id, version, image_path, player_slots, teams, created_at)';

export const scorepadsKey = ['scorepads'] as const;
export const gameScorepadsKey = (gameId: string) => [...scorepadsKey, 'game', gameId] as const;
export const scorepadKey = (id: string) => [...scorepadsKey, 'byId', id] as const;
/**
 * Szablon wersji ze zdjęciem (kilka MB). Wersje są niezmienne, więc klucz jest poza `scorepadsKey`:
 * odświeżenie list po zapisie nie pobiera zdjęcia ponownie.
 */
export const versionTemplateKey = (versionId: string) => ['scorepad-template', versionId] as const;

/** Aktywne notesy gry w kolejności dodania. */
export function useGameScorepads(client: SupabaseClient, gameId: string) {
  return useQuery({
    queryKey: gameScorepadsKey(gameId),
    queryFn: async (): Promise<Scorepad[]> => {
      if (!isUuid(gameId)) return [];
      const { data, error } = await client
        .from('scorepads')
        .select(SCOREPAD_COLUMNS)
        .eq('game_id', gameId)
        .is('deleted_at', null)
        .order('created_at')
        .order('id')
        .returns<Scorepad[]>();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Aktywne notesy wszystkich gier w kolejności dodania: kreator nowej partii pokazuje
 * przy każdej grze liczbę notesów i wyłącza gry bez pasującego notesu.
 */
export function useActiveScorepads(client: SupabaseClient) {
  return useQuery({
    queryKey: [...scorepadsKey, 'active'] as const,
    queryFn: async (): Promise<Scorepad[]> => {
      const { data, error } = await client
        .from('scorepads')
        .select(SCOREPAD_COLUMNS)
        .is('deleted_at', null)
        .order('created_at')
        .order('id')
        .returns<Scorepad[]>();
      if (error) throw error;
      return data;
    },
  });
}

/** Aktywny notes; `null` = nie ma go albo został usunięty. */
export function useScorepad(client: SupabaseClient, id: string) {
  return useQuery({
    queryKey: scorepadKey(id),
    queryFn: async (): Promise<Scorepad | null> => {
      if (!isUuid(id)) return null;
      const { data, error } = await client
        .from('scorepads')
        .select(SCOREPAD_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle<Scorepad>();
      if (error) throw error;
      return data;
    },
  });
}

/** Odczyt pliku jako data URL (zdjęcie kartki w szablonie dla edytora i eksportu). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/** Zdjęcie z data URL; `null`, gdy to nie jest data URL obrazu przyjmowanego przez bucket. */
export function dataUrlToBlob(url: string): Blob | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!match) return null;
  const [, type = '', base64, payload = ''] = match;
  if (!(type in IMAGE_TYPES)) return null;
  try {
    // Bez base64 dane są zakodowane procentowo bajt po bajcie (np. `%89PNG`), nie jako UTF-8.
    const binary = base64
      ? atob(payload)
      : payload.replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

/**
 * Szablon wersji ze zdjęciem kartki jako data URL i nazwą notesu (nazwę można zmienić bez
 * nowej wersji, więc ważniejsza jest ta z notesu).
 */
export async function loadVersionTemplate(
  client: SupabaseClient,
  versionId: string,
  name: string,
): Promise<ScorePadTemplate> {
  const { data, error } = await client
    .from('scorepad_versions')
    .select('template, image_path')
    .eq('id', versionId)
    .single<{ template: ScorePadTemplate; image_path: string | null }>();
  if (error) throw error;
  let image: string | undefined;
  if (data.image_path) {
    const file = await client.storage.from(SCOREPADS_BUCKET).download(data.image_path);
    if (file.error) throw file.error;
    image = await blobToDataUrl(file.data);
  }
  return { ...data.template, name, ...(image ? { image } : {}) };
}

/**
 * Szablon aktualnej wersji notesu do edycji (ze zdjęciem). Klucz to sama wersja: zmiana nazwy
 * w innym oknie nie wczytuje szablonu od nowa (i nie czyści edytora).
 */
export function useScorepadTemplate(client: SupabaseClient, pad: Scorepad | null | undefined) {
  const versionId = pad?.current?.id ?? '';
  const name = pad?.name ?? '';
  return useQuery({
    queryKey: versionTemplateKey(versionId),
    enabled: versionId !== '',
    staleTime: Infinity,
    // Zdjęcie ma kilka MB: po zamknięciu edytora nie trzymamy go w pamięci.
    gcTime: 0,
    queryFn: () => loadVersionTemplate(client, versionId, name),
  });
}

/** Powód nieudanego zapisu, importu albo zmiany notesu (komunikaty w `t.scorepads.errors`). */
export type ScorepadFailure =
  /** Plik nie jest poprawnym JSON-em. */
  | 'json'
  /** To nie jest plik notesu v2 albo ma kilka notesów bez wskazania. */
  | 'format'
  /** Notes bez pól, siatki albo miejsc dla graczy. */
  | 'shape'
  /** Błędne kategorie, sumy albo reguła miejsc. */
  | 'scoring'
  /** Zdjęcie kartki nie jest obrazem WebP, JPEG ani PNG zapisanym w pliku. */
  | 'image'
  /** Zdjęcie kartki przekracza limit bucketu. */
  | 'imageSize'
  /** Edytor nie ma jeszcze gotowego notesu (zdjęcie i pola). */
  | 'incomplete'
  | 'forbidden'
  | 'upload'
  /** Gra albo notes zostały usunięte. */
  | 'gone'
  | 'save';

export class ScorepadError extends Error {
  constructor(readonly reason: ScorepadFailure) {
    super(`scorepad: ${reason}`);
    this.name = 'ScorepadError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly message?: string | undefined;
}

function failureFor(error: PostgrestLikeError): ScorepadFailure {
  if (error.code === '42501') return 'forbidden';
  if (error.code === 'PGRST116') return 'gone';
  if (error.code === '23514' && error.message?.includes('is deleted')) return 'gone';
  return 'save';
}

/** Leniwie ładowane narzędzia szablonu (kod modelu notesu, osobny chunk). */
async function templateTools() {
  return import('@bg-club/score-pad/template');
}

function checked(result: ReadTemplateResult): { template: ScorePadTemplate; playerSlots: number } {
  if (!result.ok) throw new ScorepadError(result.reason === 'many' ? 'format' : result.reason);
  return result;
}

/** Dłuższy bok miniatury kartki: galeria 36×46 przy `devicePixelRatio` do 3. */
export const SCOREPAD_THUMB_MAX_SIDE = 160;
/** Docelowy rozmiar miniatury: kilka KB zamiast 1–3 MB zdjęcia szablonu. */
export const SCOREPAD_THUMB_TARGET_BYTES = 12 * 1024;

/**
 * Ścieżka miniatury zdjęcia wersji: obok zdjęcia, bez rozszerzenia (typ niesie `contentType`).
 * Galeria notesów (ScorepadsPopup) pokazuje ją zamiast pełnego zdjęcia; starsze wersje bez
 * miniatury wracają do pełnego zdjęcia.
 */
export function thumbPath(imagePath: string): string {
  return `${imagePath.replace(/\.[^./]+$/, '')}-thumb`;
}

/**
 * Wgrywa miniaturę zdjęcia kartki. Najlepszy wysiłek: bez miniatury galeria pokaże pełne
 * zdjęcie, więc błąd skalowania albo wysyłki nie przerywa zapisu notesu.
 */
async function uploadThumb(
  storage: ReturnType<SupabaseClient['storage']['from']>,
  imagePath: string,
  image: Blob,
): Promise<string | null> {
  try {
    const { blob } = await scaleImage(image, {
      maxSide: SCOREPAD_THUMB_MAX_SIDE,
      targetBytes: SCOREPAD_THUMB_TARGET_BYTES,
    });
    const path = thumbPath(imagePath);
    const { error } = await storage.upload(path, blob, { contentType: blob.type, upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

/** Nazwa pliku zdjęcia: zawsze nowa, bo pliki wersji są niezmienne. */
export function newImagePath(gameId: string, scorepadId: string, extension: string): string {
  return `${gameId}/${scorepadId}-${crypto.randomUUID()}.${extension}`;
}

export interface ScorepadDraft {
  readonly gameId: string;
  /** Id notesu: istniejącego (nowa wersja) albo nowego (nadaje klient). */
  readonly scorepadId: string;
  /** Szablon z edytora albo pliku, ze zdjęciem kartki jako data URL. */
  readonly template: unknown;
  /** Nazwa notesu; domyślnie nazwa z szablonu. */
  readonly name?: string | undefined;
  /**
   * Zdjęcie wersji, od której zaczęła się edycja (data URL podany edytorowi i jego plik).
   * Gdy edytor oddaje to samo zdjęcie, nowa wersja wskazuje ten sam plik: bez ponownego
   * wysyłania kilku MB i bez kolejnej kompresji JPEG.
   */
  readonly previousImage?: { readonly url: string; readonly path: string } | undefined;
}

export interface SavedScorepad {
  readonly name: string;
  readonly version: number;
  readonly playerSlots: number;
}

/** Nazwa notesu po przycięciu; pusta daje „Notes”. */
export function scorepadName(name: string): string {
  return name.trim().slice(0, SCOREPAD_NAME_MAX).trim() || 'Notes';
}

/**
 * Zapisuje nową wersję notesu. Szablon jest sprawdzany jak plik
 * notesu v2 (kształt, kategorie, reguła miejsc i liczba miejsc), zdjęcie kartki
 * idzie do Storage, a w bazie zostaje szablon bez zdjęcia.
 */
export async function saveScorepad(
  client: SupabaseClient,
  draft: ScorepadDraft,
): Promise<SavedScorepad> {
  const { readTemplate } = await templateTools();
  const { template, playerSlots } = checked(readTemplate(draft.template));
  const name = scorepadName(draft.name ?? template.name);
  const { image, ...rest } = template;

  // Edytor otwiera tylko notes ze zdjęciem kartki, więc bez zdjęcia nie zapisujemy.
  if (image === undefined) throw new ScorepadError('image');
  const storage = client.storage.from(SCOREPADS_BUCKET);
  let imagePath: string;
  let uploaded: string | null = null;
  let thumb: string | null = null;
  if (draft.previousImage && image === draft.previousImage.url) {
    imagePath = draft.previousImage.path;
  } else {
    const blob = dataUrlToBlob(image);
    if (!blob) throw new ScorepadError('image');
    if (blob.size > SCOREPAD_IMAGE_MAX_BYTES) throw new ScorepadError('imageSize');
    const path = newImagePath(draft.gameId, draft.scorepadId, IMAGE_TYPES[blob.type] ?? 'jpg');
    // Miniatura skaluje się i wysyła równolegle ze zdjęciem: zapis nie czeka dłużej.
    const [{ error }, thumbUploaded] = await Promise.all([
      storage.upload(path, blob, { contentType: blob.type, upsert: false }),
      uploadThumb(storage, path, blob),
    ]);
    if (error) {
      if (thumbUploaded) await storage.remove([thumbUploaded]).catch(() => undefined);
      throw new ScorepadError('upload');
    }
    imagePath = uploaded = path;
    thumb = thumbUploaded;
  }

  // Id szablonu = id notesu: kolejne wersje są tym samym notesem także dla `<score-pad>`.
  const row: ScorePadTemplate = { ...rest, id: draft.scorepadId, name };
  const { data, error } = await client
    .rpc('save_scorepad', {
      game_id: draft.gameId,
      scorepad_id: draft.scorepadId,
      name,
      template: row,
      image_path: imagePath,
      player_slots: playerSlots,
    })
    .single<{ version: number }>();
  if (error) {
    // Plik usuwamy tylko po odpowiedzi bazy (kod błędu): wtedy wersji na pewno nie ma, więc
    // Storage pozwala go usunąć. Po błędzie sieci transakcja mogła się jeszcze zatwierdzić,
    // a usunięty plik zostawiłby wersję bez zdjęcia; osierocony plik jest mniejszym złem.
    if (uploaded && error.code) {
      await storage.remove(thumb ? [uploaded, thumb] : [uploaded]).catch(() => undefined);
    }
    throw new ScorepadError(failureFor(error));
  }
  return { name, version: data.version, playerSlots };
}

/** Szablon z pliku `.json`: format v2, reguła miejsc i liczba miejsc. */
export async function readImportFile(file: Blob): Promise<unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new ScorepadError('json');
  }
  const { readScorePadFile } = await templateTools();
  return checked(readScorePadFile(raw)).template;
}

/** Importuje plik notesu jako nowy notes gry. */
export async function importScorepad(
  client: SupabaseClient,
  gameId: string,
  file: Blob,
): Promise<SavedScorepad> {
  const template = await readImportFile(file);
  return saveScorepad(client, { gameId, scorepadId: crypto.randomUUID(), template });
}

/** Zmienia nazwę notesu (bez nowej wersji: partie zachowują swój szablon). */
export async function renameScorepad(
  client: SupabaseClient,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await client
    .from('scorepads')
    .update({ name: scorepadName(name) })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .single();
  if (error) throw new ScorepadError(failureFor(error));
}

/**
 * Usuwa notes (miękko): znika z listy i z wyboru przy nowej partii, a jego wersje, obrazy
 * i rozegrane partie zostają w historii. Ponowne usunięcie niczego nie zmienia.
 */
export async function deleteScorepad(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client
    .from('scorepads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  if (error) throw new ScorepadError(error.code === '42501' ? 'forbidden' : 'save');
}

/** Plik notesu v2 ze zdjęciem w data URL: przenośny, wczytuje go edytor i notes. */
export function scorepadFile(template: ScorePadTemplate): ScorePadFile {
  return { format: 'score-pad', version: 2, template, active: template.id };
}

/** Eksport aktualnej wersji notesu do pliku `.json` (pobranie w przeglądarce). */
export async function exportScorepad(client: SupabaseClient, pad: Scorepad): Promise<void> {
  if (!pad.current) throw new ScorepadError('gone');
  const template = await loadVersionTemplate(client, pad.current.id, pad.name);
  const blob = new Blob([JSON.stringify(scorepadFile(template), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = scorePadFileName(pad.name);
  document.body.append(link);
  link.click();
  link.remove();
  // Pobieranie startuje synchronicznie po kliknięciu; adres zwalniamy po chwili.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
