// Wtyczki: notes (score-pad.js) działa sam, a pakiet edytora (score-pad-editor.js) dołącza się przez ten interfejs.

import type { PadConfig, Settings } from './settings';
import type { PadTemplate } from './templates';

export interface MenuItem {
  label: string;
  run(): void;
  danger?: boolean;
}

export type HostEvent = 'frame' | 'status' | 'settings' | 'template';

/** To, co notes udostępnia wtyczkom (edytorowi i panelowi debugowania). */
export interface PadHost {
  /** Element <score-pad> (albo kontener z ScorePad.mount). */
  readonly element: HTMLElement;
  readonly shadow: ShadowRoot;
  /** Ramka notesu — tu wtyczki dokładają swoje nakładki. */
  readonly frame: HTMLElement;
  /** Czy osadzenie włączyło tryb debugowania (true albo "open"). */
  readonly debug: boolean | 'open';
  /** Bieżące ustawienia (żywy obiekt — zmieniaj przez setSetting). */
  readonly settings: Settings;
  baseSettings(): Settings;
  setSetting(key: string, value: unknown): boolean;
  resetSetting(key: string): void;
  resetSettings(): void;

  templates(): PadTemplate[];
  current(): PadTemplate | null;
  isCustom(id: string): boolean;
  /** Zapisuje notes w przeglądarce i pokazuje go; `fresh` zaczyna nową kartkę. */
  saveTemplate(t: PadTemplate, fresh: boolean): Promise<void>;

  exportConfig(opt?: { sheet?: boolean }): PadConfig;
  /** Zapisuje plik notesu; zwraca komunikat dla użytkownika. */
  saveFile(withSheet: boolean): Promise<string>;
  copyConfig(withSheet: boolean): Promise<string>;
  /** Otwiera wybór pliku i wczytuje notes (wynik przychodzi zdarzeniem "status"). */
  pickFile(): void;

  tear(): void;
  blankSheet(): void;
  clearHistory(): void;
  stats(): [string, string][];
  /** Ile pikseli z prawej zasłania panel wtyczki (kamera centruje notes w reszcie). */
  setInset(px: number): void;
  /** Wstrzymuje symulację i rysowanie sceny, gdy notes jest całkowicie zasłonięty (np. przez edytor). */
  suspend(on: boolean): void;

  addMenu(provider: () => MenuItem[]): void;
  addTool(button: HTMLButtonElement): void;
  /** Rejestruje działanie wywoływane przez API notesu, np. "editor" (openEditor) i "debug" (toggleDebug). */
  provide(action: 'editor' | 'debug', fn: (arg?: unknown) => void): void;
  on(event: HostEvent, fn: (...args: unknown[]) => void): void;
  prefs: { get(key: string): unknown; set(key: string, value: unknown): void };
}

export interface ScorePadPlugin {
  name: string;
  attach(host: PadHost): void;
}

const registry: ScorePadPlugin[] = [];
const hosts = new Set<PadHost>();

export function registerPlugin(p: ScorePadPlugin): void {
  if (registry.some((x) => x.name === p.name)) return;
  registry.push(p);
  for (const h of hosts) p.attach(h);
}

export function hostReady(h: PadHost): void {
  hosts.add(h);
  for (const p of registry) p.attach(h);
}

export function hostGone(h: PadHost): void {
  hosts.delete(h);
}

export function hasPlugin(name: string): boolean {
  return registry.some((p) => p.name === name);
}
