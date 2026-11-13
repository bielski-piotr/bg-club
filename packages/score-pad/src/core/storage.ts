// Zapis: własne notesy w IndexedDB (zdjęcia są duże), stan kartek w localStorage.

import type { DeepPartial, Settings } from './settings';
import type { HistoryEntry, PadTemplate, SheetData } from './templates';
import { validateTemplate } from './templates';

export interface PadState {
  data: SheetData;
  left: number;
}

export interface Saved {
  v: 2;
  tpl: string;
  sheets: Record<string, PadState>;
  history: HistoryEntry[];
  sound: boolean;
  help: boolean;
  recentNames: string[];
  /** Ustawienia zmienione w trybie debugowania (tylko różnice od bazowych). */
  settings?: DeepPartial<Settings>;
  debugOpen?: boolean;
  /** Drobne ustawienia wtyczek (np. czy panel debugowania jest otwarty). */
  prefs?: Record<string, unknown>;
}

export function loadState(key: string): Partial<Saved> | null {
  try {
    const s = localStorage.getItem(`${key}:state:v2`);
    if (!s) return null;
    const o = JSON.parse(s) as Partial<Saved>;
    return o && o.v === 2 ? o : null;
  } catch {
    return null;
  }
}

const timers = new Map<string, number>();
export function saveState(key: string, s: Saved): void {
  window.clearTimeout(timers.get(key));
  timers.set(
    key,
    window.setTimeout(() => {
      try {
        localStorage.setItem(`${key}:state:v2`, JSON.stringify(s));
      } catch {
        /* zapis lokalny niedostępny — notes działa dalej bez niego */
      }
    }, 250),
  );
}

const DB = 'score-pad';
const STORE = 'templates';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE))
          r.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) {
      rej(e);
    }
  });
}

export class TemplateStore {
  private mem = new Map<string, PadTemplate>();
  private db: Promise<IDBDatabase | null>;

  /** `persistent: false` (tryb klubowy) trzyma notesy tylko w pamięci i nie otwiera IndexedDB. */
  constructor(
    private ns: string,
    persistent = true,
  ) {
    this.db = persistent ? openDb().catch(() => null) : Promise.resolve(null);
  }

  async list(): Promise<PadTemplate[]> {
    const db = await this.db;
    if (!db) return [...this.mem.values()];
    return new Promise((res) => {
      try {
        const rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        rq.onsuccess = () => {
          const rows = (rq.result as { key: string; ns: string; t: unknown; at: number }[])
            .filter((r) => r.ns === this.ns)
            .sort((a, b) => a.at - b.at);
          res(rows.map((r) => validateTemplate(r.t)).filter((t): t is PadTemplate => !!t));
        };
        rq.onerror = () => res([...this.mem.values()]);
      } catch {
        res([...this.mem.values()]);
      }
    });
  }

  async put(t: PadTemplate): Promise<void> {
    this.mem.set(t.id, t);
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((res, rej) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ key: `${this.ns}:${t.id}`, ns: this.ns, t, at: Date.now() });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(new Error('Brak miejsca na zapis notesu w przeglądarce.'));
      } catch {
        res();
      }
    });
  }

  async remove(id: string): Promise<void> {
    this.mem.delete(id);
    const db = await this.db;
    if (!db) return;
    await new Promise<void>((res) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(`${this.ns}:${id}`);
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      } catch {
        res();
      }
    });
  }
}
