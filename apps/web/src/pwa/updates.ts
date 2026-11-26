import { createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';

/*
 * Aktualizacje aplikacji. Nowy service worker instaluje się w tle i czeka;
 * aplikacja pokazuje „Dostępna nowa wersja” i przełącza się dopiero po kliknięciu „Odśwież”.
 * Póki otwarty notes ma wpisy, których nie ma jeszcze w bazie (zapis czeka, trwa, brak sieci,
 * konflikt), odświeżenie jest wstrzymane: aktualizacja nie przerywa szkicu partii.
 */

/** Co 30 minut sprawdzamy, czy jest nowa wersja (oprócz powrotu do karty). */
export const UPDATE_CHECK_MS = 30 * 60 * 1000;

export type UpdateState =
  /** Brak nowej wersji. */
  | 'none'
  /** Nowa wersja czeka na zgodę użytkownika. */
  | 'available'
  /** Użytkownik kliknął „Odśwież”: czekamy na przełączenie i przeładowujemy. */
  | 'applying'
  /** Inna karta przełączyła aplikację na nową wersję: ta karta powinna się odświeżyć. */
  | 'activated';

export interface PwaSnapshot {
  readonly update: UpdateState;
  /** Otwarty notes ma niezapisane w bazie wpisy (odświeżenie wstrzymane). */
  readonly draftBusy: boolean;
}

export interface PwaStoreOptions {
  readonly reload?: (() => void) | undefined;
}

/** Stan aktualizacji i niezapisanych szkiców; jeden na kartę (`pwa`). */
export class PwaStore {
  private snapshot: PwaSnapshot = { update: 'none', draftBusy: false };
  private readonly listeners = new Set<() => void>();
  private readonly busyDrafts = new Set<string>();
  private waiting: ServiceWorker | null = null;
  private readonly reload: () => void;

  constructor(options: PwaStoreOptions = {}) {
    this.reload = options.reload ?? (() => window.location.reload());
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;

  private set(next: Partial<PwaSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  /** Nowa wersja zainstalowana i czeka (`registration.waiting`). */
  setWaiting(worker: ServiceWorker): void {
    if (this.waiting === worker) return;
    this.waiting = worker;
    if (this.snapshot.update === 'none') this.set({ update: 'available' });
    // Nowsza wersja zastąpiła tę, którą użytkownik już zatwierdził: aktywujemy nowszą.
    else if (this.snapshot.update === 'applying') worker.postMessage({ type: 'SKIP_WAITING' });
  }

  /** Czekająca wersja przepadła (`redundant`, np. nieudana aktywacja) bez nowszej. */
  workerGone(worker: ServiceWorker): void {
    if (this.waiting !== worker) return;
    this.waiting = null;
    const { update } = this.snapshot;
    if (update === 'available' || update === 'applying') this.set({ update: 'none' });
  }

  /**
   * Stan zapisu szkicu otwartego notesu. `busy`: wpisów nie ma jeszcze w bazie. Partia
   * zgłasza `busy = false` także przy zamknięciu notesu.
   */
  setDraft(playId: string, busy: boolean): void {
    if (busy) this.busyDrafts.add(playId);
    else this.busyDrafts.delete(playId);
    const draftBusy = this.busyDrafts.size > 0;
    if (draftBusy !== this.snapshot.draftBusy) this.set({ draftBusy });
  }

  /**
   * „Odśwież”: aktywuje czekającą wersję, a po przełączeniu przeładowuje kartę. Zwraca `false`,
   * gdy odświeżenie jest wstrzymane przez niezapisany szkic.
   */
  apply(): boolean {
    if (this.snapshot.draftBusy) return false;
    if (this.snapshot.update === 'activated' || !this.waiting) {
      this.reload();
      return true;
    }
    if (this.snapshot.update !== 'applying') this.set({ update: 'applying' });
    this.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  /** Strona przeszła pod nowy service worker (`controllerchange`). */
  controllerChanged(): void {
    if (this.snapshot.update === 'applying') {
      this.reload();
      return;
    }
    // Przełączenie zlecone w innej karcie: ta karta działa na starym kodzie.
    this.waiting = null;
    this.set({ update: 'activated' });
  }
}

export const pwa = new PwaStore();

/** Stan aktualizacji jako akcesor; `store` domyślnie sklep karty (`pwa`). */
export function createPwa(store: Accessor<PwaStore> = () => pwa): Accessor<PwaSnapshot> {
  const [version, setVersion] = createSignal(0);
  const current = createMemo(() => {
    const value = store();
    onCleanup(value.subscribe(() => setVersion((n) => n + 1)));
    return value;
  });
  return createMemo(() => {
    version();
    return current().getSnapshot();
  });
}

export interface RegisterOptions {
  readonly container?: ServiceWorkerContainer | undefined;
  readonly url?: string | undefined;
  readonly checkMs?: number | undefined;
}

/**
 * Rejestruje `/sw.js` i śledzi nowe wersje. Pierwsza instalacja (strona bez kontrolera) nie
 * jest aktualizacją: nie pokazuje komunikatu ani nie przeładowuje strony.
 */
export async function registerServiceWorker(
  store: PwaStore = pwa,
  options: RegisterOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  const container = options.container ?? navigator.serviceWorker;
  // Strona jest już obsługiwana przez service worker: kolejne przełączenie to aktualizacja.
  // Pierwsze przejęcie strony po instalacji (`clients.claim`) aktualizacją nie jest.
  let controlled = Boolean(container.controller);
  const registration = await container.register(options.url ?? '/sw.js', { scope: '/' });

  const track = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const check = () => {
      if (worker.state === 'installed' && container.controller) store.setWaiting(worker);
      if (worker.state === 'redundant') store.workerGone(worker);
    };
    check();
    worker.addEventListener('statechange', check);
  };
  if (registration.waiting && container.controller) track(registration.waiting);
  track(registration.installing);
  registration.addEventListener('updatefound', () => track(registration.installing));

  container.addEventListener('controllerchange', () => {
    if (controlled || store.getSnapshot().update === 'applying') store.controllerChanged();
    controlled = true;
  });

  const update = () => {
    registration.update().catch(() => {
      // Brak sieci: sprawdzimy przy kolejnej okazji.
    });
  };
  setInterval(update, options.checkMs ?? UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update();
  });
  return registration;
}

/** Stan połączenia przeglądarki (`navigator.onLine`, zdarzenia `online`/`offline`). */
export function createOnline(): Accessor<boolean> {
  const [online, setOnline] = createSignal(navigator.onLine);
  const listener = () => setOnline(navigator.onLine);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  onCleanup(() => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  });
  return online;
}
