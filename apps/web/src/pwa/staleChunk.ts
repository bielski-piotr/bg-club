import { pwa, type PwaStore } from './updates';

/*
 * Leniwe fragmenty pakietu po wdrożeniu (NFR-3). Karta otwarta przed wdrożeniem ma stary
 * `index.html` i prosi o pliki `/assets/…` ze starym hashem. Nowe wdrożenie ich już nie ma,
 * a hosting SPA odpowiada na brakujący plik stroną HTML, więc `import()` kończy się błędem
 * „Failed to fetch dynamically imported module”. Przeglądarka i `React.lazy` zapamiętują
 * nieudany import, więc ponowna próba w tej karcie nic nie da: pomaga tylko przeładowanie,
 * które pobiera aktualny `index.html`.
 */

/** Klucz w `sessionStorage`: czas ostatniego przeładowania z powodu brakującego fragmentu. */
export const STALE_RELOAD_KEY = 'bg-club:stale-chunk-reload';
/** Drugie przeładowanie w tym czasie oznacza inny problem: zamiast pętli pokazujemy błąd. */
export const STALE_RELOAD_WINDOW_MS = 30_000;

export interface StaleChunkOptions {
  readonly store?: PwaStore | undefined;
  readonly reload?: (() => void) | undefined;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  readonly now?: (() => number) | undefined;
  readonly online?: (() => boolean) | undefined;
}

/**
 * Czy po nieudanym imporcie przeładować kartę. Nie przeładowujemy bez sieci (to nie stary
 * pakiet), przy niezapisanym szkicu partii (PAD-4) ani drugi raz w krótkim czasie.
 */
export function shouldReloadForStaleChunk(options: StaleChunkOptions = {}): boolean {
  const store = options.store ?? pwa;
  const online = options.online ?? (() => navigator.onLine);
  const now = (options.now ?? Date.now)();
  if (!online() || store.getSnapshot().draftBusy) return false;
  let storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  try {
    storage = options.storage ?? window.sessionStorage;
    const last = Number(storage.getItem(STALE_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < STALE_RELOAD_WINDOW_MS) return false;
    storage.setItem(STALE_RELOAD_KEY, String(now));
  } catch {
    // Bez `sessionStorage` nie wykryjemy pętli: lepiej pokazać błąd niż przeładowywać bez końca.
    return false;
  }
  return true;
}

/**
 * Opakowanie leniwego importu: gdy fragment nie dotrze, przeładowuje kartę (raz) i zostawia
 * obietnicę nierozstrzygniętą, żeby do przeładowania został widoczny stan wczytywania.
 * W pozostałych przypadkach przekazuje błąd dalej (granica błędu popupu).
 */
export function importOrReload<T>(
  importer: () => Promise<T>,
  options: StaleChunkOptions = {},
): () => Promise<T> {
  return () =>
    importer().catch((error: unknown) => {
      if (!shouldReloadForStaleChunk(options)) throw error;
      (options.reload ?? (() => window.location.reload()))();
      return new Promise<T>(() => {});
    });
}
