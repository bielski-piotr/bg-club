// Ustawienia notesu: fizyka papieru, odrywanie, symulacja, kamera, światło, pismo, interfejs i diagnostyka.
// Każde pole ma opis i zakres — z nich powstaje panel trybu debugowania i walidacja wczytanego pliku.

import type { PadTemplate, SheetData } from './templates';
import { blankSheet, normalizeSheet } from './templates';
import { clamp, inkDone } from './util';

export interface Settings {
  physics: {
    gravity: number;
    air: number;
    damping: number;
    bend: number;
    bendLong: number;
    iterations: number;
    memory: number;
    memoryFlipped: number;
    wind: number;
  };
  tear: { threshold: number; rate: number; speed: number; spread: number; edgeGrab: number };
  sim: { rate: number; maxSteps: number; timeScale: number; paused: boolean };
  view: {
    tilt: number;
    fov: number;
    room: number;
    autoZoom: boolean;
    autoZoomMax: number;
    sheets: number;
    vignette: boolean;
  };
  light: {
    exposure: number;
    key: number;
    keyColor: string;
    back: number;
    ambient: number;
    transmission: number;
    shadows: boolean;
  };
  ink: { color: string; size: number; speed: number };
  ui: { controls: boolean; help: boolean; editor: boolean; sound: boolean };
  debug: { fields: boolean; particles: boolean; collider: boolean; stats: boolean };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const DEFAULTS: Settings = {
  physics: {
    gravity: 120,
    air: 4,
    damping: 0.994,
    bend: 0.92,
    bendLong: 0.42,
    iterations: 18,
    memory: 9,
    memoryFlipped: 26,
    wind: 24,
  },
  tear: { threshold: 0.36, rate: 14, speed: 1, spread: 30, edgeGrab: 0.17 },
  sim: { rate: 180, maxSteps: 9, timeScale: 1, paused: false },
  view: {
    tilt: 7,
    fov: 30,
    room: 0.3,
    autoZoom: true,
    autoZoomMax: 2.1,
    sheets: 48,
    vignette: true,
  },
  light: {
    exposure: 1.02,
    key: 1.7,
    keyColor: '#ffe0b5',
    back: 0.45,
    ambient: 0.36,
    transmission: 2.1,
    shadows: true,
  },
  ink: { color: '#182a80', size: 1, speed: 1 },
  ui: { controls: true, help: true, editor: false, sound: true },
  debug: { fields: false, particles: false, collider: false, stats: true },
};

export interface FieldDef {
  key: string;
  label: string;
  type: 'range' | 'bool' | 'color';
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  unit?: string;
}

export interface SectionDef {
  id: keyof Settings;
  title: string;
  fields: FieldDef[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'physics',
    title: 'Fizyka papieru',
    fields: [
      { key: 'physics.gravity', label: 'Grawitacja', type: 'range', min: 20, max: 300, step: 1 },
      { key: 'physics.air', label: 'Opór powietrza', type: 'range', min: 0, max: 15, step: 0.1 },
      {
        key: 'physics.damping',
        label: 'Tłumienie ruchu',
        type: 'range',
        min: 0.95,
        max: 1,
        step: 0.001,
        hint: '1 = bez tłumienia',
      },
      {
        key: 'physics.bend',
        label: 'Sztywność zginania',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'physics.bendLong',
        label: 'Sztywność łuku',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        hint: 'większa = kartka gnie się łukiem, nie w kant',
      },
      {
        key: 'physics.iterations',
        label: 'Iteracje solvera',
        type: 'range',
        min: 2,
        max: 40,
        step: 1,
      },
      {
        key: 'physics.memory',
        label: 'Powrót na bloczek',
        type: 'range',
        min: 0,
        max: 60,
        step: 0.5,
        hint: 'pamięć kształtu puszczonej kartki',
      },
      {
        key: 'physics.memoryFlipped',
        label: 'Powrót przewróconej kartki',
        type: 'range',
        min: 0,
        max: 80,
        step: 0.5,
      },
      {
        key: 'physics.wind',
        label: 'Wiatr po oderwaniu',
        type: 'range',
        min: 0,
        max: 60,
        step: 0.5,
      },
    ],
  },
  {
    id: 'tear',
    title: 'Odrywanie',
    fields: [
      {
        key: 'tear.threshold',
        label: 'Próg siły',
        type: 'range',
        min: 0.05,
        max: 1.5,
        step: 0.01,
        hint: 'o ile trzeba przeciągnąć kartkę ponad jej zasięg',
      },
      {
        key: 'tear.rate',
        label: 'Szybkość pękania kleju',
        type: 'range',
        min: 1,
        max: 40,
        step: 0.5,
      },
      {
        key: 'tear.speed',
        label: 'Wpływ szybkości szarpnięcia',
        type: 'range',
        min: 0,
        max: 3,
        step: 0.05,
      },
      {
        key: 'tear.spread',
        label: 'Rozchodzenie się rozdarcia',
        type: 'range',
        min: 0,
        max: 80,
        step: 1,
      },
      {
        key: 'tear.edgeGrab',
        label: 'Strefa chwytu przy krawędzi',
        type: 'range',
        min: 0.05,
        max: 0.5,
        step: 0.01,
      },
    ],
  },
  {
    id: 'sim',
    title: 'Symulacja',
    fields: [
      { key: 'sim.rate', label: 'Kroki na sekundę', type: 'range', min: 60, max: 360, step: 10 },
      {
        key: 'sim.maxSteps',
        label: 'Najwięcej kroków na klatkę',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
      },
      {
        key: 'sim.timeScale',
        label: 'Tempo czasu',
        type: 'range',
        min: 0.05,
        max: 2,
        step: 0.05,
        unit: '×',
      },
      { key: 'sim.paused', label: 'Zatrzymaj fizykę', type: 'bool' },
    ],
  },
  {
    id: 'view',
    title: 'Kamera i notes',
    fields: [
      {
        key: 'view.tilt',
        label: 'Odchylenie kamery',
        type: 'range',
        min: 0,
        max: 40,
        step: 1,
        unit: '°',
      },
      {
        key: 'view.fov',
        label: 'Kąt widzenia',
        type: 'range',
        min: 15,
        max: 60,
        step: 1,
        unit: '°',
      },
      { key: 'view.room', label: 'Miejsce nad notesem', type: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'view.autoZoom', label: 'Odsuwaj kamerę, gdy kartka wychodzi z kadru', type: 'bool' },
      {
        key: 'view.autoZoomMax',
        label: 'Najdalsze odsunięcie',
        type: 'range',
        min: 1,
        max: 3,
        step: 0.05,
        unit: '×',
      },
      { key: 'view.sheets', label: 'Kartek w notesie', type: 'range', min: 1, max: 200, step: 1 },
      { key: 'view.vignette', label: 'Winieta', type: 'bool' },
    ],
  },
  {
    id: 'light',
    title: 'Światło',
    fields: [
      { key: 'light.exposure', label: 'Ekspozycja', type: 'range', min: 0.3, max: 2, step: 0.01 },
      { key: 'light.key', label: 'Lampa', type: 'range', min: 0, max: 4, step: 0.05 },
      { key: 'light.keyColor', label: 'Barwa lampy', type: 'color' },
      { key: 'light.back', label: 'Światło zza notesu', type: 'range', min: 0, max: 2, step: 0.05 },
      {
        key: 'light.ambient',
        label: 'Światło otoczenia',
        type: 'range',
        min: 0,
        max: 1.5,
        step: 0.02,
      },
      {
        key: 'light.transmission',
        label: 'Prześwit papieru',
        type: 'range',
        min: 0,
        max: 5,
        step: 0.05,
      },
      { key: 'light.shadows', label: 'Cienie', type: 'bool' },
    ],
  },
  {
    id: 'ink',
    title: 'Pismo',
    fields: [
      { key: 'ink.color', label: 'Kolor długopisu', type: 'color' },
      {
        key: 'ink.size',
        label: 'Wielkość pisma',
        type: 'range',
        min: 0.5,
        max: 1.6,
        step: 0.01,
        unit: '×',
      },
      {
        key: 'ink.speed',
        label: 'Tempo pisania',
        type: 'range',
        min: 0.2,
        max: 4,
        step: 0.05,
        unit: '×',
      },
    ],
  },
  {
    id: 'ui',
    title: 'Interfejs',
    fields: [
      { key: 'ui.controls', label: 'Pasek z wyborem notesu', type: 'bool' },
      { key: 'ui.help', label: 'Wskazówki', type: 'bool' },
      { key: 'ui.editor', label: 'Edytor notesów w menu', type: 'bool' },
      { key: 'ui.sound', label: 'Dźwięki', type: 'bool' },
    ],
  },
  {
    id: 'debug',
    title: 'Diagnostyka',
    fields: [
      { key: 'debug.fields', label: 'Pokaż pola na kartce', type: 'bool' },
      { key: 'debug.particles', label: 'Pokaż siatkę fizyki', type: 'bool' },
      { key: 'debug.collider', label: 'Pokaż bryłę kolizji', type: 'bool' },
      { key: 'debug.stats', label: 'Pokaż statystyki', type: 'bool' },
    ],
  },
];

const FIELDS = new Map(SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f] as const)));

export function getPath(s: Settings, key: string): unknown {
  const [a, b] = key.split('.');
  return (s as unknown as Record<string, Record<string, unknown>>)[a]?.[b];
}

function coerce(def: FieldDef, v: unknown): unknown {
  if (def.type === 'bool')
    return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined;
  if (def.type === 'color')
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return clamp(n, def.min ?? -Infinity, def.max ?? Infinity);
}

export function setPath(s: Settings, key: string, v: unknown): boolean {
  const def = FIELDS.get(key);
  if (!def) return false;
  const val = coerce(def, v);
  if (val === undefined) return false;
  const [a, b] = key.split('.');
  (s as unknown as Record<string, Record<string, unknown>>)[a][b] = val;
  return true;
}

export function cloneSettings(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s));
}

/** Nakłada częściowe ustawienia (np. z pliku) na pełne; nieznane i błędne wartości są pomijane. */
export function mergeSettings(base: Settings, patch: unknown): Settings {
  const out = cloneSettings(base);
  if (!patch || typeof patch !== 'object') return out;
  for (const [sec, obj] of Object.entries(patch as Record<string, unknown>)) {
    if (!obj || typeof obj !== 'object') continue;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>))
      setPath(out, `${sec}.${k}`, v);
  }
  return out;
}

/** Tylko to, czym ustawienia różnią się od domyślnych (zwięzły zapis do pliku). */
export function diffSettings(s: Settings, base: Settings = DEFAULTS): DeepPartial<Settings> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of FIELDS.keys()) {
    const v = getPath(s, key);
    if (v !== getPath(base, key)) {
      const [a, b] = key.split('.');
      (out[a] ??= {})[b] = v;
    }
  }
  return out as DeepPartial<Settings>;
}

// ─────────────────────────────────────────────────────────── plik notesu

export interface PadConfig {
  format: 'score-pad';
  version: 2;
  /** Notes (szablon: wygląd, rozmiar, siatka pól, reguły liczenia). */
  template?: PadTemplate;
  /** Kilka notesów naraz. */
  templates?: PadTemplate[];
  /** Notes pokazywany na start. */
  active?: string;
  /** Ustawienia zachowania (tylko różnice od domyślnych). */
  settings?: DeepPartial<Settings>;
  /** Wpisy na bieżącej kartce: imiona i wartości (liczba, "x" = skreślone, null = puste). */
  sheet?: {
    game: number;
    started?: string | null;
    names: (string | null)[];
    cells: Record<string, (number | 'x' | null)[]>;
    free?: Record<string, number | 'x' | null>;
  };
}

export function isConfig(o: unknown): o is PadConfig {
  return (
    !!o &&
    typeof o === 'object' &&
    ((o as PadConfig).format === 'score-pad' ||
      'template' in (o as object) ||
      'templates' in (o as object) ||
      'settings' in (o as object))
  );
}

export function packSheet(d: SheetData): NonNullable<PadConfig['sheet']> {
  const cells: Record<string, (number | 'x' | null)[]> = {};
  const val = (c: { cur: { scratch: boolean; value: number } | null }): number | 'x' | null =>
    c.cur ? (c.cur.scratch ? 'x' : c.cur.value) : null;
  for (const id in d.cells) cells[id] = d.cells[id].map(val);
  const free: Record<string, number | 'x' | null> = {};
  for (const id in d.free) if (d.free[id].cur) free[id] = val(d.free[id]);
  return {
    game: d.game,
    started: d.started,
    names: d.names.map((n) => n?.text ?? null),
    cells,
    ...(Object.keys(free).length ? { free } : {}),
  };
}

export function unpackSheet(raw: PadConfig['sheet'], t: PadTemplate): SheetData {
  if (!raw || typeof raw !== 'object') return blankSheet(t, 1);
  const d = normalizeSheet({ game: raw.game, started: raw.started ?? null }, t);
  d.names = d.names.map((_, p) => {
    const n = raw.names?.[p];
    return typeof n === 'string' && n.trim()
      ? { text: n.trim().slice(0, 14), ink: inkDone() }
      : null;
  });
  for (const id in d.cells) {
    const row = raw.cells?.[id];
    if (!Array.isArray(row)) continue;
    d.cells[id] = d.cells[id].map((c, p) => {
      const v = row[p];
      if (v === 'x')
        return { cur: { value: 0, scratch: true, ink: inkDone() }, old: null, strike: null };
      if (typeof v === 'number' && Number.isFinite(v))
        return {
          cur: { value: Math.round(v), scratch: false, ink: inkDone() },
          old: null,
          strike: null,
        };
      return c;
    });
  }
  const entry = (
    v: unknown,
  ): {
    cur: { value: number; scratch: boolean; ink: ReturnType<typeof inkDone> };
    old: null;
    strike: null;
  } | null =>
    v === 'x'
      ? { cur: { value: 0, scratch: true, ink: inkDone() }, old: null, strike: null }
      : typeof v === 'number' && Number.isFinite(v)
        ? { cur: { value: Math.round(v), scratch: false, ink: inkDone() }, old: null, strike: null }
        : null;
  for (const id in d.free) {
    const e = entry(raw.free?.[id]);
    if (e) d.free[id] = e;
  }
  return d;
}
