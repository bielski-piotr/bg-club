import type { ScorePadSheet } from '@bg-club/score-pad';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Szkic partii w toku (PRD PAD-4, PAD-8, RUN-3, migracja [028]): wpisy kartki trafiają do bazy
 * (`save_play_draft`) z opóźnieniem i od razu do `localStorage`. Odświeżenie strony, awaria
 * przeglądarki i utrata sieci nie gubią wpisów, a admin albo prowadzący może dokończyć partię
 * na innym urządzeniu (bez synchronizacji na żywo).
 *
 * Każdy zapis podaje wersję szkicu, od której zaczął. Baza odrzuca zapis, gdy w międzyczasie
 * ktoś zapisał nowszą wersję (drugie urządzenie, druga karta), i aplikacja pokazuje konflikt
 * zamiast cicho nadpisać cudze wpisy.
 */

/** Opóźnienie zapisu szkicu w bazie po ostatniej zmianie (PAD-4: 1–2 s). */
export const DRAFT_SAVE_DELAY_MS = 1500;
/** Ponowienie zapisu po błędzie sieci (oprócz zdarzenia `online`). */
export const DRAFT_RETRY_MS = 5000;

/** Szkic w bazie: wpisy kartki i wersja. Partia bez zapisanego szkicu ma wersję 0. */
export interface ServerDraft {
  readonly version: number;
  readonly sheet: ScorePadSheet | null;
  readonly savedAt: string | null;
  readonly savedBy: string | null;
}

/** Kopia szkicu w `localStorage` z kontem i partią, do której należy. */
export interface LocalDraft {
  readonly v: 1;
  readonly profileId: string;
  readonly playId: string;
  /** Wersja w bazie, od której zaczynają się wpisy kopii. */
  readonly baseVersion: number;
  readonly sheet: ScorePadSheet;
  /** Wpisy nie są jeszcze w bazie (zapis czeka albo się nie udał). */
  readonly dirty: boolean;
  readonly updatedAt: string;
}

const KEY_PREFIX = 'bg-club:play-draft';

export function localDraftKey(profileId: string, playId: string): string {
  return `${KEY_PREFIX}:${profileId}:${playId}`;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** `localStorage` albo `null`, gdy przeglądarka go nie udostępnia (tryb prywatny, blokada). */
export function draftStorage(): DraftStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Wpisy kartki w formacie pliku notesu (`game`, `names`, `cells`); inne dane odrzucamy. */
export function isSheet(value: unknown): value is ScorePadSheet {
  return (
    isRecord(value) &&
    typeof value.game === 'number' &&
    Array.isArray(value.names) &&
    isRecord(value.cells)
  );
}

export function readLocalDraft(
  storage: DraftStorage | null,
  profileId: string,
  playId: string,
): LocalDraft | null {
  try {
    const raw = storage?.getItem(localDraftKey(profileId, playId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.v !== 1 ||
      value.profileId !== profileId ||
      value.playId !== playId ||
      typeof value.baseVersion !== 'number' ||
      typeof value.dirty !== 'boolean' ||
      !isSheet(value.sheet)
    ) {
      return null;
    }
    return value as unknown as LocalDraft;
  } catch {
    return null;
  }
}

/** Zapisuje kopię; `false`, gdy się nie udało (brak miejsca, blokada). */
export function writeLocalDraft(storage: DraftStorage | null, draft: LocalDraft): boolean {
  try {
    if (!storage) return false;
    storage.setItem(localDraftKey(draft.profileId, draft.playId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Usuwa kopie szkicu partii ze wszystkich kont na tym urządzeniu (porzucenie, PAD-8). */
export function removeLocalDrafts(storage: DraftStorage | null, playId: string): void {
  try {
    if (!storage) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(`${KEY_PREFIX}:`) && key.endsWith(`:${playId}`)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Kopia zostanie, ale bez partii w bazie nikt jej nie wczyta.
  }
}

/**
 * Treść kartki do porównań: numer partii, imiona (bez pustych na końcu) i tylko wpisane pola
 * (`linia:miejsce` → wartość). Notes przy wczytaniu dopisuje puste kolumny wszystkich kategorii
 * i czas rozpoczęcia; to nie są zmiany wpisów i nie powinny wywoływać zapisu.
 */
function content(sheet: ScorePadSheet | null): string {
  if (!sheet) return 'null';
  const names = [...sheet.names];
  while (names.length > 0 && !names.at(-1)) names.pop();
  const entries: string[] = [];
  for (const [line, column] of Object.entries(sheet.cells)) {
    column.forEach((value, seat) => {
      if (value !== null && value !== undefined) entries.push(`${line}:${seat}=${String(value)}`);
    });
  }
  for (const [field, value] of Object.entries(sheet.free ?? {})) {
    if (value !== null && value !== undefined) entries.push(`free:${field}=${String(value)}`);
  }
  entries.sort();
  return JSON.stringify([sheet.game, names.map((name) => name || null), entries]);
}

/** Te same wpisy kartki (numer partii, imiona, wartości i skreślenia). */
export function sameSheet(a: ScorePadSheet | null, b: ScorePadSheet | null): boolean {
  return content(a) === content(b);
}

/** Czy na kartce jest jakikolwiek wpis (wartość albo skreślenie). */
export function hasEntries(sheet: ScorePadSheet | null): boolean {
  if (!sheet) return false;
  const cells = Object.values(sheet.cells).some((column) => column.some((v) => v !== null));
  const free = Object.values(sheet.free ?? {}).some((v) => v !== null);
  return cells || free;
}

/**
 * Kartka z imionami graczy na ich miejscach w notesie (PAD-2: gracze z wyboru, nie z klawiatury).
 * Wpisy szkicu zostają; bez szkicu: czysta kartka partii nr 1.
 */
export function sheetWithPlayers(
  sheet: ScorePadSheet | null,
  names: readonly (string | null)[],
): ScorePadSheet {
  const base: ScorePadSheet = sheet ?? { game: 1, names: [], cells: {} };
  return { ...base, names: [...names] };
}

/** Od czego zaczyna notes partii po otwarciu (wznowienie, PAD-4). */
export type DraftStart =
  /** Wpisy z bazy (brak kopii lokalnej albo kopia jest już w bazie). */
  | { readonly kind: 'server'; readonly sheet: ScorePadSheet | null; readonly version: number }
  /**
   * Kopia lokalna z wpisami, których nie ma w bazie (utrata sieci, zamknięta karta), na tej
   * samej wersji: można ją bezpiecznie wysłać.
   */
  | { readonly kind: 'local'; readonly sheet: ScorePadSheet; readonly version: number }
  /** Kopia lokalna i nowszy szkic z innego urządzenia: decyduje użytkownik. */
  | { readonly kind: 'conflict'; readonly local: LocalDraft; readonly server: ServerDraft };

export function resolveDraftStart(local: LocalDraft | null, server: ServerDraft): DraftStart {
  const fromServer = { kind: 'server', sheet: server.sheet, version: server.version } as const;
  if (!local?.dirty) return fromServer;
  if (sameSheet(local.sheet, server.sheet)) return fromServer;
  if (local.baseVersion === server.version) {
    return { kind: 'local', sheet: local.sheet, version: server.version };
  }
  // Pusta kopia nic nie wnosi (np. kartka po wyczyszczeniu na starym urządzeniu): wygrywa baza.
  if (!hasEntries(local.sheet) && local.baseVersion < server.version) return fromServer;
  return { kind: 'conflict', local, server };
}

/** Powód nieudanego zapisu albo porzucenia szkicu (komunikaty w `t.meetings.play.errors`). */
export type DraftFailure =
  /** W bazie jest nowszy szkic (inne urządzenie albo karta). */
  | 'conflict'
  /** Partii już nie ma (porzucona) albo nie jest szkicem (zapisana). */
  | 'gone'
  /** Spotkanie nie jest w trakcie. */
  | 'closed'
  | 'forbidden'
  /** Szkic odrzucony przez bazę (format, rozmiar); ponowienie nie pomoże. */
  | 'invalid'
  /** Brak połączenia: wpisy czekają w kopii lokalnej. */
  | 'network'
  /** Inny błąd serwera: ponowienie może pomóc. */
  | 'server';

export class DraftError extends Error {
  constructor(readonly reason: DraftFailure) {
    super(`play draft: ${reason}`);
    this.name = 'DraftError';
  }
}

interface PostgrestLikeError {
  readonly code?: string | undefined;
  readonly hint?: string | null | undefined;
}

const HINTS: Readonly<Record<string, DraftFailure>> = {
  plays_draft_conflict: 'conflict',
  plays_not_found: 'gone',
  plays_not_draft: 'gone',
  plays_meeting_in_progress: 'closed',
  plays_draft_invalid: 'invalid',
  plays_draft_too_large: 'invalid',
};

/** Błąd PostgREST → powód (HINT z migracji [028]); bez kodu to błąd sieci. */
export function draftFailure(error: PostgrestLikeError): DraftFailure {
  const byHint = error.hint ? HINTS[error.hint] : undefined;
  if (byHint) return byHint;
  if (error.code === '42501') return 'forbidden';
  if (!error.code) return 'network';
  return 'server';
}

/** Ponowienie zapisu może się udać (sieć, chwilowy błąd serwera). */
export function isRetryable(reason: DraftFailure): boolean {
  return reason === 'network' || reason === 'server';
}

export interface SavedDraft {
  readonly version: number;
  readonly savedAt: string | null;
}

export async function saveDraft(
  client: SupabaseClient,
  playId: string,
  sheet: ScorePadSheet,
  baseVersion: number,
): Promise<SavedDraft> {
  const { data, error } = await client
    .rpc('save_play_draft', { play_id: playId, sheet, base_version: baseVersion })
    .single<{ draft_version: number; draft_saved_at: string | null }>();
  if (error) throw new DraftError(draftFailure(error));
  return { version: data.draft_version, savedAt: data.draft_saved_at };
}

/** Porzuca partię w toku (PAD-8). Partii, której już nie ma, nie trzeba porzucać. */
export async function discardPlay(client: SupabaseClient, playId: string): Promise<void> {
  const { error } = await client.rpc('discard_play', { play_id: playId });
  if (!error) return;
  const reason = draftFailure(error);
  if (reason === 'gone' && error.hint === 'plays_not_found') return;
  throw new DraftError(reason);
}

/** Stan zapisu szkicu pokazywany przy notesie. */
export type DraftSaveState =
  /** Wszystkie wpisy są w bazie. */
  | 'saved'
  /** Zmiana czeka na zapis (opóźnienie). */
  | 'pending'
  | 'saving'
  /** Brak połączenia albo błąd serwera: wpisy są na tym urządzeniu, zapis będzie ponowiony. */
  | 'offline'
  /** Nowszy szkic w bazie: zapis wstrzymany do decyzji użytkownika. */
  | 'conflict'
  /** Zapisu nie da się dokończyć (partia porzucona, zapisana, spotkanie zakończone…). */
  | 'failed';

export interface DraftStatus {
  readonly state: DraftSaveState;
  /** Wersja w bazie, od której zaczynają się bieżące wpisy. */
  readonly version: number;
  /** Powód stanu `offline` i `failed`. */
  readonly reason?: DraftFailure | undefined;
  /** Kopia lokalna się nie zapisała (brak `localStorage`). */
  readonly localFailed?: boolean | undefined;
}

export interface DraftSaverOptions {
  readonly profileId: string;
  readonly playId: string;
  /** Wersja i wpisy, od których zaczyna notes (po `resolveDraftStart`). */
  readonly version: number;
  readonly sheet: ScorePadSheet | null;
  /** Wpisy jeszcze nie są w bazie (wznowienie z kopii lokalnej). */
  readonly dirty?: boolean | undefined;
  readonly save: (sheet: ScorePadSheet, baseVersion: number) => Promise<SavedDraft>;
  readonly storage: DraftStorage | null;
  readonly onStatus: (status: DraftStatus) => void;
  readonly delayMs?: number | undefined;
  readonly retryMs?: number | undefined;
  readonly now?: (() => Date) | undefined;
}

/**
 * Zapis szkicu: każda zmiana od razu do `localStorage`, do bazy po `delayMs` od ostatniej
 * zmiany. Jeden zapis naraz; zmiany w trakcie zapisu idą w kolejnym, od nowej wersji. Błąd
 * sieci zostawia wpisy w kopii lokalnej i ponawia zapis (co `retryMs` i po `online`).
 */
export class DraftSaver {
  private readonly opts: DraftSaverOptions;
  private version: number;
  private sheet: ScorePadSheet | null;
  /** Wpisy ostatnio potwierdzone przez bazę. */
  private savedSheet: ScorePadSheet | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private stopped: DraftSaveState | null = null;
  private status: DraftStatus;
  /** Notes zamknięty: bez stanu i timerów; kończy tylko zapis (`dispose(true)`). */
  private closed = false;
  private flushOnClose = false;
  private readonly onOnline = () => this.flush();

  constructor(options: DraftSaverOptions) {
    this.opts = options;
    this.version = options.version;
    this.sheet = options.sheet;
    this.savedSheet = options.dirty ? null : options.sheet;
    this.status = { state: 'saved', version: options.version };
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
    // Kopia lokalna od razu odpowiada stanowi notesu (także czysta: stara, niezapisana kopia
    // sprzed wyboru „wczytaj z bazy” nie może wrócić przy kolejnym otwarciu).
    if (options.sheet) this.storeLocal();
    if (options.dirty && options.sheet) this.schedule(0);
  }

  /** Bieżący stan zapisu. */
  get current(): DraftStatus {
    return this.status;
  }

  /** Wpisy notesu po zmianie. Te same wpisy co ostatnio nie zapisują się ponownie. */
  change(sheet: ScorePadSheet): void {
    if (this.closed || sameSheet(sheet, this.sheet)) return;
    this.sheet = sheet;
    this.storeLocal();
    if (this.stopped) {
      this.emit({ state: this.stopped, reason: this.status.reason });
      return;
    }
    this.emit({ state: this.inFlight ? 'saving' : 'pending' });
    this.schedule(this.opts.delayMs ?? DRAFT_SAVE_DELAY_MS);
  }

  /** Zapis od razu (`online`, przed porzuceniem), bez czekania na opóźnienie. */
  flush(): void {
    if (this.closed || this.stopped) return;
    if (this.isDirty()) this.schedule(0);
  }

  /**
   * Po rozstrzygnięciu konfliktu: notes zaczyna od wersji `version` z wpisami `sheet`.
   * `dirty`: wpisy trzeba zapisać (świadome nadpisanie szkicu z bazy).
   */
  reset(version: number, sheet: ScorePadSheet | null, dirty: boolean): void {
    if (this.closed) return;
    this.version = version;
    this.sheet = sheet;
    this.savedSheet = dirty ? null : sheet;
    this.stopped = null;
    if (sheet) this.storeLocal();
    this.emit({ state: dirty ? 'pending' : 'saved' });
    if (dirty) this.schedule(0);
  }

  /**
   * Koniec pracy (zamknięcie notesu): bez stanu, timerów i ponowień po błędzie. `flush`:
   * niezapisane wpisy idą do bazy od razu, także te zmienione w trakcie trwającego zapisu;
   * kopia lokalna zapamiętuje wynik, więc kolejne otwarcie nie widzi fałszywego konfliktu.
   */
  dispose(flush = false): void {
    if (this.closed) return;
    this.closed = true;
    this.flushOnClose = flush;
    this.clearTimer();
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
    if (flush) void this.run();
  }

  private isDirty(): boolean {
    return this.sheet !== null && !sameSheet(this.sheet, this.savedSheet);
  }

  private storeLocal(): void {
    if (!this.sheet) return;
    const ok = writeLocalDraft(this.opts.storage, {
      v: 1,
      profileId: this.opts.profileId,
      playId: this.opts.playId,
      baseVersion: this.version,
      sheet: this.sheet,
      dirty: this.isDirty(),
      updatedAt: (this.opts.now?.() ?? new Date()).toISOString(),
    });
    this.status = { ...this.status, localFailed: !ok };
  }

  private emit(next: Omit<DraftStatus, 'version' | 'localFailed'>): void {
    this.status = { ...next, version: this.version, localFailed: this.status.localFailed };
    if (!this.closed) this.opts.onStatus(this.status);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number): void {
    if (this.closed) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private async run(): Promise<void> {
    // Zapis w toku: kolejny ruszy po nim (od nowej wersji).
    if (this.stopped || this.inFlight || !this.isDirty()) return;
    if (this.closed && !this.flushOnClose) return;
    const sheet = this.sheet as ScorePadSheet;
    this.inFlight = true;
    this.emit({ state: 'saving' });
    try {
      const saved = await this.opts.save(sheet, this.version);
      this.version = saved.version;
      this.savedSheet = sheet;
      this.inFlight = false;
      this.storeLocal();
      if (!this.isDirty()) {
        this.emit({ state: 'saved' });
      } else if (this.closed) {
        // Zmiany z czasu trwania zapisu, a notes już zamknięty: wysyłamy je od razu.
        void this.run();
      } else {
        this.emit({ state: 'pending' });
        this.schedule(this.opts.delayMs ?? DRAFT_SAVE_DELAY_MS);
      }
    } catch (error) {
      this.inFlight = false;
      // Po zamknięciu wpisy zostają w kopii lokalnej; kolejne otwarcie je wznowi.
      if (this.closed) return;
      const reason = error instanceof DraftError ? error.reason : 'network';
      if (isRetryable(reason)) {
        this.emit({ state: 'offline', reason });
        this.schedule(this.opts.retryMs ?? DRAFT_RETRY_MS);
        return;
      }
      this.stopped = reason === 'conflict' ? 'conflict' : 'failed';
      this.emit({ state: this.stopped, reason });
    }
  }
}
