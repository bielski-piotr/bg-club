// Komponent <score-pad>: scena, interakcja, wybór liczby, odrywanie, historia, notesy własne.

import * as THREE from 'three';
import type { Spec } from './cloth';
import { makeSpec } from './cloth';
import type { PrintSet } from './print';
import { dropPrint, preparePrint, refreshBuiltinPrints } from './print';
import { DebugViz } from './viz';
import type { HostEvent, MenuItem, PadHost } from './plugins';
import { hostGone, hostReady } from './plugins';
import { Pad, Sfx, woodTexture } from './scene';
import type { TransLight } from './sheet';
import { PaperSheet } from './sheet';
import type { DeepPartial, PadConfig, Settings } from './settings';
import {
  DEFAULTS,
  cloneSettings,
  diffSettings,
  getPath,
  isConfig,
  mergeSettings,
  packSheet,
  setPath,
  unpackSheet,
} from './settings';
import type { PadState, Saved } from './storage';
import { TemplateStore, loadState, saveState } from './storage';
import { CSS } from './styles';
import type { HistoryEntry, PadTemplate, SheetData, Spot } from './templates';
import {
  BUILTINS,
  anyValue,
  blankSheet,
  canBeNegative,
  computePlayer,
  describeValues,
  cellOf,
  exampleGeneral,
  hitSpot,
  isAllowed,
  normalizeSheet,
  playerActive,
  playerCount,
  spots,
  stepValue,
  validateTemplate,
  valuesOf,
} from './templates';
import { clamp, el, esc, fmtDate, fmtTime, inkNow, lerp, plural, uid } from './util';

export interface ScorePadOptions {
  /** Szablony: obiekty, adres pliku JSON (tablica szablonów) albo identyfikatory wbudowanych ("general", "kolonie"). */
  templates?: (PadTemplate | string)[] | string;
  /** Notes pokazany na start. */
  template?: string;
  /** Edytor notesów ze zdjęć (domyślnie włączony). */
  editor?: boolean;
  /** Pasek z wyborem notesu i dźwiękiem (domyślnie widoczny). */
  controls?: boolean;
  /** Karta wskazówek (domyślnie widoczna na większych ekranach). */
  help?: boolean;
  /** Odchylenie kamery od pionu w stopniach (0 = dokładnie z góry). */
  tilt?: number;
  /** Przestrzeń nazw zapisu w przeglądarce (osobna dla każdego osadzenia). */
  storageKey?: string;
  sound?: boolean;
  /** Czy dołączyć wbudowane notesy Generał i Kolonie. */
  builtins?: boolean;
  /** Plik notesu (zapisany przyciskiem „Zapisz notes do pliku”): obiekt, JSON albo adres pliku. */
  config?: PadConfig | string;
  /** Ustawienia zachowania (fizyka, kamera, światło, pismo…), nakładane na domyślne. */
  settings?: DeepPartial<Settings>;
  /** Tryb debugowania: true pokazuje przycisk panelu, "open" otwiera panel od razu. */
  debug?: boolean | 'open';
  /**
   * Tryb klubowy BG Club (PAD-1): notesy przychodzą tylko z `templates` i `config` (z bazy aplikacji).
   * Notes nie czyta i nie zapisuje lokalnej biblioteki szablonów (IndexedDB) ani stanu i historii
   * (`localStorage`), nie pokazuje historii partii i domyślnie nie dołącza notesów wbudowanych.
   * Pliki notesu w formacie v2 nadal można wczytać, ale tylko do pamięci tego osadzenia.
   */
  club?: boolean;
  /** Motyw otoczenia notesu (stół i winieta); domyślnie ciemny. Nakładki notesu są zawsze ciemne. */
  theme?: PadTheme;
}

export type PadTheme = 'light' | 'dark';

/** Szczegóły zdarzenia `scorepad:save`: wpis partii i pełne wpisy z oderwanej kartki. */
export interface PadSaveDetail extends HistoryEntry {
  sheet: NonNullable<PadConfig['sheet']>;
}

/** Kolor stołu (tło sceny i mgła) w motywie jasnym i ciemnym. */
const ROOM: Record<PadTheme, number> = { dark: 0x120d0a, light: 0xd6cec2 };

/**
 * Three.js pochodzi z zależności npm (PRD §8.5) i trafia do tego samego leniwego chunka co notes,
 * więc nie trzeba go doczytywać z CDN. Funkcja zostaje dla zgodności z API POC (`ScorePad.ensureThree`).
 */
export function ensureThree(): Promise<void> {
  return Promise.resolve();
}

let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  // fonty notesu są dołączone z npm (`../fonts.ts`), bez Google Fonts
  const specs = [
    '600 48px Caveat',
    '700 48px Caveat',
    "700 80px 'Alegreya SC'",
    "600 27px 'Archivo Narrow'",
    "400 16px 'Archivo Narrow'",
    "700 16px 'Archivo Narrow'",
  ];
  fontsReady = Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, 'Generał Ąę łóś 0123456789'))).then(
      () => undefined,
    ),
    new Promise<void>((r) => setTimeout(r, 3500)),
  ]).catch(() => undefined);
  return fontsReady;
}

const ICON_SOUND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="waves" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="mute" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;
const ICON_CHEV = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;
const RING =
  '<svg class="ring" viewBox="0 0 96 52" aria-hidden="true"><path pathLength="1" d="M70 9C55 2 18 4 8 20c-8 13 8 27 36 28 26 1 47-8 46-22C89 12 70 5 46 6"/></svg>';

interface Hit {
  kind: 'edge' | 'cell' | 'name' | 'none';
  uv: THREE.Vector2;
  point: THREE.Vector3;
  spot?: Spot;
}

interface Drag {
  idx: number;
  pointerId: number;
  R: number;
  s0: number;
  z0: number;
  offX: number;
  raw: THREE.Vector3;
  clamped: THREE.Vector3;
  excess: number;
  loads: Float32Array;
  x: number;
  y: number;
  tearing: boolean;
}

export class ScorePad {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  private opts: ScorePadOptions & { storageKey: string; builtins: boolean; club: boolean };
  /** Ustawienia bieżące (obiekt jest stały — symulacja trzyma do niego odwołania). */
  readonly cfg: Settings;
  /** Ustawienia bez zmian z trybu debugowania (domyślne + opcje + plik notesu). */
  private baseCfg: Settings;
  private debugAvail = false;
  private hostApi: PadHost | null = null;
  private menuProviders: (() => MenuItem[])[] = [];
  private actions = new Map<string, (arg?: unknown) => void>();
  private listeners = new Map<HostEvent, ((...a: unknown[]) => void)[]>();
  private inset = 0;
  private suspended = false;
  private viz: DebugViz | null = null;
  private hemi!: THREE.HemisphereLight;
  private configActive: string | null = null;
  private frames = 0;
  private statT = 0;
  private stepsLast = 0;
  private fps = 0;
  private wrap!: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private key!: THREE.SpotLight;
  private back!: THREE.DirectionalLight;
  private trans: TransLight[] = [];
  private pad: Pad | null = null;
  private spec: Spec | null = null;
  private ps: PrintSet | null = null;
  private backTex = new Map<string, THREE.CanvasTexture>();
  private t: PadTemplate | null = null;
  private active: PaperSheet | null = null;
  private flyers: PaperSheet[] = [];
  private templates: PadTemplate[] = [];
  private custom = new Set<string>();
  private store: TemplateStore;
  private saved: Saved;
  private sfx = new Sfx();
  private aniso = 8;
  private zoom = 1;
  private autoZoom = 1;
  private dragCam: THREE.PerspectiveCamera | null = null;
  private pk: { spot: Spot; neg: boolean } | null = null;
  private raycaster!: THREE.Raycaster;
  private ndc!: THREE.Vector2;
  private drag: Drag | null = null;
  private press: { x: number; y: number; hit: Hit; held?: boolean } | null = null;
  /** Chmurka z opisem kategorii: pole, nad którym jest pokazana (albo zaplanowana). */
  private tipKey: string | null = null;
  private tipTimer = 0;
  private tipHiddenAt = -1e9;
  private holdTimer = 0;
  private pointerSpeed = 0;
  private lastMove = { x: 0, y: 0, t: 0 };
  private hoverQueued: { x: number; y: number } | null = null;
  private pickerOpen = false;
  private pickerShownAt = 0;
  private annotTimer = 0;
  private rafId = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private destroyed = false;
  private switching = false;
  private observers: { disconnect(): void }[] = [];
  private ui: Record<string, HTMLElement> = {};
  private syncSound: () => void = () => undefined;
  private uiSound: boolean | null = null;

  constructor(host: HTMLElement, options: ScorePadOptions = {}) {
    this.host = host;
    const club = !!options.club;
    this.opts = {
      ...options,
      club,
      storageKey: options.storageKey || 'score-pad',
      builtins: options.builtins ?? !club,
    };
    this.debugAvail = !!options.debug;
    // domyślne ← opcje osadzenia ← jawne ustawienia (← plik notesu, gdy się wczyta)
    const fromOpts: DeepPartial<Settings> = {
      view: options.tilt != null ? { tilt: options.tilt } : {},
      ui: {
        ...(options.controls != null ? { controls: options.controls } : {}),
        ...(options.help != null ? { help: options.help } : {}),
        ...(options.editor != null ? { editor: options.editor } : {}),
        ...(options.sound != null ? { sound: options.sound } : {}),
      },
    };
    this.baseCfg = mergeSettings(mergeSettings(DEFAULTS, fromOpts), options.settings);
    this.cfg = cloneSettings(this.baseCfg);
    this.root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    // tryb klubowy: szablony tylko w pamięci, bez odczytu stanu i historii z przeglądarki (PAD-1)
    this.store = new TemplateStore(this.opts.storageKey, !club);
    const st = club ? {} : (loadState(this.opts.storageKey) ?? {});
    this.saved = {
      v: 2,
      tpl: typeof st.tpl === 'string' ? st.tpl : '',
      sheets: st.sheets && typeof st.sheets === 'object' ? st.sheets : {},
      history: Array.isArray(st.history) ? st.history.slice(0, 40) : [],
      sound: st.sound !== undefined ? !!st.sound : this.cfg.ui.sound,
      help: st.help !== undefined ? !!st.help : true,
      recentNames: [],
      settings:
        this.debugAvail && st.settings && typeof st.settings === 'object' ? st.settings : undefined,
      debugOpen: !!st.debugOpen,
      prefs: st.prefs && typeof st.prefs === 'object' ? st.prefs : {},
    };
    if (this.saved.settings) this.replaceSettings(mergeSettings(this.baseCfg, this.saved.settings));
    this.sfx.on = this.saved.sound;
    this.buildDom();
    this.applyTheme();
    void this.init();
  }

  // ═════════════════════════════════════════════════════ API

  /** Lista dostępnych notesów. */
  getTemplates(): PadTemplate[] {
    return [...this.templates];
  }

  /** Przełącza notes. */
  async setTemplate(id: string): Promise<void> {
    if (this.t?.id === id) return;
    await this.useTemplate(id);
  }

  /** Dodaje notes (np. wczytany z JSON-a); `persist` zapisuje go w przeglądarce. */
  async addTemplate(raw: unknown, persist = false): Promise<PadTemplate> {
    const t = validateTemplate(raw);
    if (!t) throw new Error('Niepoprawna konfiguracja notesu.');
    this.upsert(t);
    if (persist) {
      await this.store.put(t);
      this.custom.add(t.id);
    }
    this.renderMenu();
    return t;
  }

  /** JSON notesu do osadzenia na innej stronie. */
  exportTemplate(id = this.t?.id ?? ''): string {
    const t = this.templates.find((x) => x.id === id);
    return t ? JSON.stringify(t) : '';
  }

  /** Otwiera edytor (wymaga pakietu score-pad-editor.js). */
  openEditor(id?: string): void {
    const fn = this.actions.get('editor');
    if (!fn) {
      console.warn('score-pad: edytor nie jest wczytany — dołącz score-pad-editor.js.');
      return;
    }
    this.closeMenu();
    this.closePicker();
    fn(id);
  }

  /** Plik notesu: bieżący notes, ustawienia (tylko różnice od domyślnych) i opcjonalnie wpisy z kartki. */
  exportConfig(opt: { sheet?: boolean } = {}): PadConfig {
    const t = this.t;
    const out: PadConfig = { format: 'score-pad', version: 2 };
    if (t) {
      out.template = JSON.parse(JSON.stringify(t));
      out.active = t.id;
    }
    const diff = diffSettings(this.cfg);
    if (Object.keys(diff).length) out.settings = diff;
    if (opt.sheet && this.active) out.sheet = packSheet(this.active.data);
    return out;
  }

  /** Wczytuje plik notesu (albo sam szablon). `persist` zapisuje notes w przeglądarce. */
  async importConfig(raw: unknown, persist = true): Promise<string> {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const cfg: PadConfig | null = isConfig(data)
      ? data
      : validateTemplate(data)
        ? { format: 'score-pad', version: 2, template: data as PadTemplate }
        : null;
    if (!cfg) throw new Error('To nie jest plik notesu.');
    const list = [cfg.template, ...(cfg.templates ?? [])]
      .filter(Boolean)
      .map((x) => validateTemplate(x))
      .filter((x): x is PadTemplate => !!x);
    if (!list.length && !cfg.settings) throw new Error('Plik nie zawiera notesu ani ustawień.');
    for (const t of list) {
      dropPrint(t);
      this.upsert(t);
      if (persist) {
        await this.store.put(t);
        this.custom.add(t.id);
      }
    }
    if (cfg.settings) {
      this.replaceSettings(mergeSettings(this.baseCfg, cfg.settings));
      this.saveDebugSettings();
      this.applySettings();
    }
    const active = list.find((t) => t.id === cfg.active) ?? list[0];
    if (active) {
      if (cfg.sheet)
        this.saved.sheets[active.id] = {
          data: unpackSheet(cfg.sheet, active),
          left: this.saved.sheets[active.id]?.left ?? this.cfg.view.sheets,
        };
      await this.useTemplate(active.id);
    }
    this.renderMenu();
    this.emit('settings');
    this.persist();
    return active?.name ?? '';
  }

  /** Zmienia jedno ustawienie, np. `setSetting("physics.gravity", 90)`. */
  setSetting(key: string, value: unknown): boolean {
    const ok = setPath(this.cfg, key, value);
    if (ok) {
      this.saveDebugSettings();
      this.applySettings();
      this.emit('settings');
    }
    return ok;
  }

  getSettings(): Settings {
    return cloneSettings(this.cfg);
  }

  /** Otwiera albo zamyka panel trybu debugowania (wymaga atrybutu debug i pakietu score-pad-editor.js). */
  toggleDebug(on?: boolean): void {
    const fn = this.actions.get('debug');
    if (fn) fn(on);
    else if (this.debugAvail)
      console.warn('score-pad: panel debugowania jest w pakiecie score-pad-editor.js.');
  }

  /** Historia zapisanych partii. */
  getHistory(): HistoryEntry[] {
    return [...this.saved.history];
  }

  /** Motyw otoczenia notesu (atrybut `theme`). */
  setTheme(theme: PadTheme | undefined): void {
    this.opts.theme = theme;
    this.applyTheme();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    for (const o of this.observers) o.disconnect();
    if (this.hostApi) hostGone(this.hostApi);
    this.renderer?.dispose();
    this.root.innerHTML = '';
  }

  // ═════════════════════════════════════════════════════ budowa

  private buildDom(): void {
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="sp" part="frame">
        <div class="stage"></div>
        <div class="vignette" aria-hidden="true"></div>
        <header class="bar" ${this.cfg.ui.controls ? '' : 'hidden'}>
          <button type="button" class="tpl-btn" aria-haspopup="true" aria-expanded="false">
            <span class="tpl-name">Notes</span><span class="tpl-sub"></span>${ICON_CHEV}
          </button>
          <button type="button" class="icon-btn" data-ui="sound" aria-pressed="true" aria-label="Dźwięki">${ICON_SOUND}</button>
          <div class="menu" hidden></div>
        </header>
        <section class="help" aria-label="Jak używać notesu" hidden>
          <ol>
            <li><span><b>Kliknij pole</b> i wpisz punkty z klawiatury. Sumy liczą się same.</span></li>
            <li><span><b>Chwyć <span data-edge>dolną</span> krawędź</b> i przeciągnij w stronę grzbietu — kartka uniesie się i przewróci pod światło lampy.</span></li>
            <li><span><b>Szarpnij mocno</b> <span data-pull>w dół albo w bok</span>, a kartka oderwie się i wynik zostanie zapisany.</span></li>
          </ol>
          <button type="button" class="help-close" aria-label="Ukryj wskazówki">×</button>
        </section>
        <button type="button" class="help-btn" aria-label="Pokaż wskazówki" hidden>?</button>
        <div class="tip" role="tooltip" hidden><b class="tip-t"></b><span class="tip-x"></span></div>
        <div class="picker" role="dialog" aria-label="Wybór punktów" hidden>
          <div class="pk-head"><span class="pk-title"></span><span class="pk-who"></span></div>
          <button type="button" class="pk-close" aria-label="Zamknij">×</button>
          <p class="pk-hint"></p>
          <form class="pk-type" novalidate>
            <button type="button" class="pk-sign" aria-label="Zmień znak na przeciwny" title="Zmień znak">±</button>
            <input class="pk-in" type="text" inputmode="numeric" pattern="-?[0-9]*" enterkeyhint="done" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="6" placeholder="0" aria-label="Punkty" aria-describedby="pk-err">
            <button type="submit" class="pk-ok" disabled>Wpisz</button>
          </form>
          <p class="pk-err" id="pk-err" aria-live="polite"></p>
          <form class="pk-name" hidden>
            <input maxlength="14" autocomplete="off" spellcheck="false" placeholder="Imię" aria-label="Imię gracza">
            <button type="submit">Wpisz</button>
          </form>
          <div class="pk-actions"></div>
        </div>
        <div class="tension" hidden aria-hidden="true">
          <svg viewBox="0 0 40 40"><circle class="t-trk" cx="20" cy="20" r="16"/><circle class="t-val" cx="20" cy="20" r="16" pathLength="100"/></svg>
          <span>Ciągnij mocniej</span>
        </div>
        <div class="annot" aria-live="polite" hidden></div>
        <button type="button" class="chip" hidden></button>
        <div class="tools"></div>
        <input type="file" class="file-in" accept=".json,application/json" hidden>
        <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t" hidden>
          <div class="dlg-card">
            <h2 id="dlg-t">Plik notesu</h2>
            <p class="dlg-msg"></p>
            <textarea readonly spellcheck="false" aria-label="Zawartość pliku notesu"></textarea>
            <div class="dlg-acts"><button type="button" data-d="copy">Kopiuj</button><button type="button" data-d="close">Zamknij</button></div>
          </div>
        </div>
        <div class="loading">Rozkładam notes…</div>
      </div>`;
    const q = <T extends HTMLElement>(s: string): T => this.root.querySelector(s) as T;
    this.wrap = q('.sp');
    this.ui = {
      stage: q('.stage'),
      tplBtn: q('.tpl-btn'),
      tplName: q('.tpl-name'),
      tplSub: q('.tpl-sub'),
      menu: q('.menu'),
      sound: q('[data-ui="sound"]'),
      help: q('.help'),
      helpBtn: q('.help-btn'),
      picker: q('.picker'),
      tip: q('.tip'),
      tipT: q('.tip-t'),
      tipX: q('.tip-x'),
      pkTitle: q('.pk-title'),
      pkWho: q('.pk-who'),
      pkHint: q('.pk-hint'),
      pkName: q('.pk-name'),
      pkInput: q('.pk-name input'),
      pkType: q('.pk-type'),
      pkIn: q('.pk-in'),
      pkSign: q('.pk-sign'),
      pkOk: q('.pk-ok'),
      pkErr: q('.pk-err'),
      pkActions: q('.pk-actions'),
      tension: q('.tension'),
      tensionLabel: q('.tension span'),
      annot: q('.annot'),
      chip: q('.chip'),
      loading: q('.loading'),
      tools: q('.tools'),
      fileIn: q('.file-in'),
      dlg: q('.dlg'),
      vignette: q('.vignette'),
    };
  }

  private async init(): Promise<void> {
    try {
      await Promise.all([ensureThree(), ensureFonts()]);
    } catch (e) {
      this.ui.loading.textContent = (e as Error).message;
      return;
    }
    if (this.destroyed) return;
    // kolory w hex traktujemy jako sRGB
    (THREE.ColorManagement as unknown as { legacyMode: boolean }).legacyMode = false;
    const conf = await this.loadConfig();
    if (conf?.settings) {
      this.baseCfg = mergeSettings(this.baseCfg, conf.settings);
      this.replaceSettings(
        this.saved.settings ? mergeSettings(this.baseCfg, this.saved.settings) : this.baseCfg,
      );
    }
    this.setupScene();
    this.bindUi();
    await this.loadTemplates(conf);
    this.viz = new DebugViz();
    this.scene.add(this.viz.group);
    const want = [
      this.opts.template,
      this.configActive,
      this.saved.tpl,
      this.templates[0]?.id,
    ].find((id) => id && this.templates.some((t) => t.id === id)) as string | undefined;
    if (!want) {
      this.ui.loading.textContent =
        'Brak notesów do pokazania. Dodaj szablon albo włącz wbudowane notesy.';
      return;
    }
    await this.useTemplate(want);
    this.applySettings();
    this.wrap.classList.add('ready');
    this.hostApi = this.makeHost();
    hostReady(this.hostApi);
    this.updateChip(false);
    this.host.dispatchEvent(new CustomEvent('scorepad:ready', { bubbles: true, composed: true }));
    document.fonts?.addEventListener?.('loadingdone', () => {
      refreshBuiltinPrints();
      if (this.pad) this.pad.topTex.needsUpdate = true;
      if (this.active) this.active.dirty = true;
    });
  }

  /** Plik notesu podany w atrybucie `config` (adres, JSON albo obiekt). */
  private async loadConfig(): Promise<PadConfig | null> {
    const c = this.opts.config;
    if (!c) return null;
    try {
      const data =
        typeof c === 'string'
          ? /^\s*[[{]/.test(c)
            ? JSON.parse(c)
            : await (await fetch(c)).json()
          : c;
      if (isConfig(data)) return data;
      if (validateTemplate(data))
        return { format: 'score-pad', version: 2, template: data as PadTemplate };
    } catch {
      /* zły plik — notes działa na ustawieniach domyślnych */
    }
    console.warn('score-pad: nie udało się wczytać pliku notesu z atrybutu config.');
    return null;
  }

  private async loadTemplates(conf: PadConfig | null = null): Promise<void> {
    if (this.opts.builtins) for (const b of BUILTINS) this.upsert(b);
    const src = this.opts.templates;
    const items: (PadTemplate | string)[] =
      typeof src === 'string' ? [src] : Array.isArray(src) ? src : [];
    for (const it of items) {
      try {
        if (typeof it === 'string') {
          const b = BUILTINS.find((x) => x.id === it);
          if (b) {
            this.upsert(b);
            continue;
          }
          const trimmed = it.trim();
          const data =
            trimmed.startsWith('[') || trimmed.startsWith('{')
              ? JSON.parse(trimmed)
              : await (await fetch(it)).json();
          for (const raw of Array.isArray(data) ? data : [data]) {
            const t = validateTemplate(raw);
            if (t) this.upsert(t);
          }
        } else {
          const t = validateTemplate(it);
          if (t) this.upsert(t);
        }
      } catch {
        /* pominięty szablon — pozostałe działają */
      }
    }
    for (const t of await this.store.list()) {
      this.upsert(t);
      this.custom.add(t.id);
    }
    if (conf) {
      const list = [conf.template, ...(conf.templates ?? [])]
        .filter(Boolean)
        .map((x) => validateTemplate(x))
        .filter((x): x is PadTemplate => !!x);
      for (const t of list) this.upsert(t);
      const active = list.find((t) => t.id === conf.active) ?? list[0];
      if (active) {
        this.configActive = active.id;
        // wpisy z pliku trafiają na kartkę tylko wtedy, gdy nie ma jeszcze lokalnych
        if (conf.sheet && !this.saved.sheets[active.id])
          this.saved.sheets[active.id] = {
            data: unpackSheet(conf.sheet, active),
            left: this.cfg.view.sheets,
          };
      }
    }
  }

  private upsert(t: PadTemplate): void {
    const i = this.templates.findIndex((x) => x.id === t.id);
    if (i >= 0) this.templates[i] = t;
    else this.templates.push(t);
  }

  private setupScene(): void {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.02;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.tabIndex = 0;
    r.domElement.setAttribute(
      'aria-label',
      'Notes 3D. Kliknij pole, aby wybrać punkty; przeciągnij dolną krawędź, aby przewrócić kartkę; szarpnij, aby ją oderwać.',
    );
    this.ui.stage.appendChild(r.domElement);
    this.renderer = r;
    this.aniso = r.capabilities.getMaxAnisotropy();
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ROOM.dark);
    scene.fog = new THREE.Fog(ROOM.dark, 18, 40);
    this.scene = scene;
    this.applyTheme();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

    // lampa stoi za notesem: przewracana kartka trafia między nią a oko patrzącego z góry
    const key = new THREE.SpotLight(0xffe0b5, 1.7, 0, 0.62, 0.75, 1);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.015;
    key.shadow.camera.near = 3;
    key.shadow.camera.far = 26;
    scene.add(key, key.target);
    this.key = key;
    const back = new THREE.DirectionalLight(0xffb878, 0.45);
    scene.add(back, back.target);
    this.back = back;
    this.hemi = new THREE.HemisphereLight(0xb9c3d6, 0x3a281b, 0.36);
    scene.add(this.hemi);
    const fill = new THREE.DirectionalLight(0xcdd8ff, 0.12);
    fill.position.set(0.5, 9, 6);
    scene.add(fill);
    this.trans = [
      { dir: new THREE.Vector3(), color: new THREE.Color() },
      { dir: new THREE.Vector3(), color: new THREE.Color() },
    ];

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ map: woodTexture(this.aniso), roughness: 0.62 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);

    const ro = new ResizeObserver(() => this.layoutCamera());
    ro.observe(this.host);
    this.observers.push(ro);
    const io = new IntersectionObserver((es) => {
      this.visible = es.some((e) => e.isIntersecting);
      if (this.visible) this.loop();
    });
    io.observe(this.host);
    this.observers.push(io);
  }

  private placeLights(): void {
    if (!this.spec) return;
    const { W, H } = this.spec;
    this.key.position.set(-W * 0.45 - 1.0, 8.6, -H / 2 - 5.4);
    this.key.target.position.set(0, 0, H * 0.12);
    this.back.position.set(1.4, 2.0, -12);
    this.back.target.position.set(0, 0, 0);
    this.key.updateMatrixWorld();
    this.trans[0].dir.copy(this.key.position).sub(this.key.target.position).normalize();
    this.trans[0].color.copy(this.key.color).multiplyScalar(this.key.intensity * 0.62);
    this.trans[1].dir.copy(this.back.position).sub(this.back.target.position).normalize();
    this.trans[1].color.copy(this.back.color).multiplyScalar(this.back.intensity * 1.6);
  }

  private layoutCamera(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.wrap.clientWidth);
    const h = Math.max(1, this.wrap.clientHeight);
    this.renderer.setSize(w, h);
    this.wrap.classList.toggle('narrow', w < 560);
    this.camera.aspect = w / h;
    this.poseCamera();
    if (this.pickerOpen) this.closePicker();
  }

  /** Ustawia kamerę nad notesem; `autoZoom` odsuwa ją, gdy podniesiona kartka wychodzi poza kadr. */
  private poseCamera(): void {
    const cam = this.camera;
    if (!this.spec || !this.pad) {
      cam.updateProjectionMatrix();
      return;
    }
    const { W, H, rot } = this.spec;
    const room = H * this.cfg.view.room;
    const mb = H * 0.07 + 0.08;
    const ms = Math.max(W * 0.08, 0.2);
    // notes klejony z lewej: kamera obrócona o 90° (taśma po lewej stronie kadru)
    const regionH = rot ? W + 2 * ms : H + room + mb;
    const regionW = rot ? H + room + mb : W + 2 * ms;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // otwarty panel debugowania zasłania prawą część — notes mieści się i centruje w pozostałej
    const fw = Math.max(1, this.wrap.clientWidth);
    const fh = Math.max(1, this.wrap.clientHeight);
    const pw = fw > 700 ? Math.min(this.inset, fw) : 0;
    const aspect = (fw - pw) / fh;
    if (pw) cam.setViewOffset(fw, fh, pw / 2, 0, fw, fh);
    else cam.clearViewOffset();
    this.wrap.style.setProperty('--inset', `${pw}px`);
    const d =
      Math.max(regionH / 2 / tanV, regionW / 2 / (tanV * aspect)) * this.zoom * this.autoZoom;
    const cz = (mb - room) / 2 - (this.autoZoom - 1) * H * 0.35;
    const tilt = THREE.MathUtils.degToRad(this.cfg.view.tilt);
    const top = this.pad.top;
    if (rot) {
      cam.position.set(-d * Math.sin(tilt), top + d * Math.cos(tilt), cz);
      cam.up.set(1, 0, 0);
    } else {
      cam.position.set(0, top + d * Math.cos(tilt), cz + d * Math.sin(tilt));
      cam.up.set(0, 0, -1);
    }
    cam.lookAt(0, top, cz);
    cam.far = d * 3 + 20;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Jak daleko (w kadrze) sięga kartka; > 1 znaczy, że wychodzi poza obraz. */
  private sheetExtent(a: PaperSheet): number {
    const P = a.cloth.pos;
    const v = new THREE.Vector3();
    let e = 0;
    for (let i = 0; i < a.cloth.n; i += 2) {
      v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).project(this.camera);
      // podniesiona kartka przechodzi nad taśmą: u góry kadru (albo z lewej, gdy notes klejony z boku)
      e = this.spec?.rot
        ? Math.max(e, Math.abs(v.y) / 0.94, v.x < 0 ? -v.x / 0.8 : v.x / 0.94)
        : Math.max(e, Math.abs(v.x) / 0.94, v.y > 0 ? v.y / 0.8 : -v.y / 0.94);
    }
    return e;
  }

  // ═════════════════════════════════════════════════════ notesy

  private async useTemplate(id: string, fresh = false): Promise<void> {
    const t = this.templates.find((x) => x.id === id);
    if (!t || this.switching) return;
    this.switching = true;
    try {
      this.closePicker();
      this.endDrag(true);
      const spec = makeSpec(t);
      const ps = await preparePrint(t, spec.glue);
      if (this.destroyed) return;
      if (this.active) {
        this.scene.remove(this.active.mesh);
        this.active.dispose();
        this.active = null;
      }
      if (this.pad) {
        this.scene.remove(this.pad.group);
        this.pad.dispose();
      }
      this.hideTip();
      this.t = t;
      this.spec = spec;
      this.ps = ps;
      // wskazówki zależne od tego, z której strony notes jest klejony
      this.wrap
        .querySelectorAll('[data-edge]')
        .forEach((x) => (x.textContent = spec.rot ? 'prawą' : 'dolną'));
      this.wrap
        .querySelectorAll('[data-pull]')
        .forEach((x) => (x.textContent = spec.rot ? 'w prawo albo w bok' : 'w dół albo w bok'));
      this.pad = new Pad(spec, ps, t, this.aniso);
      this.scene.add(this.pad.group);
      const st = this.stateFor(t, fresh);
      this.pad.setLeft(st.left);
      this.placeLights();
      this.active = this.makeSheet(st.data);
      this.scene.add(this.active.mesh);
      this.saved.tpl = t.id;
      this.wrap.style.setProperty('--accent', t.accent ?? t.tape);
      this.host.style.setProperty('--accent', t.accent ?? t.tape);
      this.layoutCamera();
      this.updatePadInfo();
      this.renderMenu();
      this.persist();
      this.host.dispatchEvent(
        new CustomEvent('scorepad:template', {
          detail: { id: t.id, name: t.name },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (e) {
      this.say((e as Error).message);
    } finally {
      this.switching = false;
    }
  }

  private stateFor(t: PadTemplate, fresh: boolean): PadState {
    const ex = this.saved.sheets[t.id];
    if (ex && !fresh) {
      const st = {
        data: normalizeSheet(ex.data, t),
        left: clamp(Number(ex.left) || this.cfg.view.sheets, 1, this.cfg.view.sheets),
      };
      this.saved.sheets[t.id] = st;
      return st;
    }
    const prevGame = ex?.data?.game ?? 0;
    const data =
      t.id === 'general' && !ex
        ? exampleGeneral(t)
        : blankSheet(t, fresh ? Math.max(1, prevGame) : 1);
    const st = { data, left: ex?.left ?? this.cfg.view.sheets };
    this.saved.sheets[t.id] = st;
    return st;
  }

  private makeSheet(data: SheetData): PaperSheet {
    const t = this.t as PadTemplate;
    const ps = this.ps as PrintSet;
    let bt = this.backTex.get(ps.key);
    if (!bt) {
      bt = new THREE.CanvasTexture(ps.back);
      bt.encoding = THREE.sRGBEncoding;
      bt.anisotropy = this.aniso;
      this.backTex.set(ps.key, bt);
    }
    const sheet = new PaperSheet(
      t,
      data,
      ps,
      this.spec as Spec,
      (this.pad as Pad).top,
      bt,
      this.trans,
      this.aniso,
      this.cfg,
    );
    this.viz?.setCloth(sheet.cloth);
    return sheet;
  }

  private persist(): void {
    if (this.opts.club) return;
    saveState(this.opts.storageKey, this.saved);
  }

  private applyTheme(): void {
    const theme: PadTheme = this.opts.theme === 'light' ? 'light' : 'dark';
    this.wrap.dataset.theme = theme;
    if (!this.scene) return;
    (this.scene.background as THREE.Color).setHex(ROOM[theme]);
    this.scene.fog?.color.setHex(ROOM[theme]);
  }

  private updatePadInfo(): void {
    if (!this.t || !this.active) return;
    const left = this.saved.sheets[this.t.id]?.left ?? this.cfg.view.sheets;
    this.ui.tplName.textContent = this.t.name;
    this.ui.tplSub.textContent = `partia nr ${this.active.data.game} · ${left} ${plural(left, 'kartka', 'kartki', 'kartek')}`;
  }

  private say(msg: string): void {
    this.ui.loading.textContent = msg;
  }

  // ═════════════════════════════════════════════════════ menu notesów

  private renderMenu(): void {
    const m = this.ui.menu;
    const cur = this.t?.id;
    const items = this.templates
      .map((t) => {
        const thumb = t.image
          ? `style="--c:${t.tape};background-image:url('${t.image}')"`
          : `style="--c:${t.tape}"`;
        return `<li><button type="button" class="menu-item" role="menuitemradio" data-id="${esc(t.id)}" aria-checked="${t.id === cur}">
          <span class="sw" ${thumb}>${t.image ? '' : esc(t.name.slice(0, 1))}</span>
          <span><b>${esc(t.name)}</b><small>${fmtSize(t)} · ${playerCount(t)} ${plural(playerCount(t), 'gracz', 'graczy', 'graczy')}</small></span></button></li>`;
      })
      .join('');
    const canDel = !this.opts.club && !!this.t && this.custom.has(this.t.id);
    // pozycje wtyczek (edytor w notesie) tylko przy atrybucie `editor`; plik notesu działa zawsze
    const extra = this.cfg.ui.editor ? this.menuProviders.flatMap((f) => f()) : [];
    m.innerHTML = `<ul role="menu">${items}</ul>
      <div class="menu-acts">
        ${extra.map((it, i) => `<button type="button" class="menu-act${it.danger ? ' danger' : ''}" data-x="${i}">${esc(it.label)}</button>`).join('')}
        <button type="button" class="menu-act" data-m="save">Zapisz notes do pliku…</button>
        <button type="button" class="menu-act" data-m="load">Wczytaj notes z pliku…</button>
        ${canDel ? `<button type="button" class="menu-act danger" data-m="del">Usuń ten notes</button>` : ''}
      </div>`;
    m.querySelectorAll<HTMLButtonElement>('[data-x]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeMenu();
        extra[Number(b.dataset.x)]?.run();
      }),
    );
    m.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeMenu();
        void this.setTemplate(b.dataset.id as string);
      }),
    );
    m.querySelector('[data-m="save"]')?.addEventListener('click', () => {
      this.closeMenu();
      void this.saveConfigFile(false).then((msg) => msg && this.emit('status', msg, 'ok'));
    });
    m.querySelector('[data-m="load"]')?.addEventListener('click', () => {
      this.closeMenu();
      (this.ui.fileIn as HTMLInputElement).click();
    });
    m.querySelector('[data-m="del"]')?.addEventListener('click', () => {
      const acts = m.querySelector('.menu-acts') as HTMLElement;
      acts.innerHTML = `<div class="menu-confirm">Usunąć notes „${esc(this.t?.name ?? '')}” razem z bieżącą kartką?
        <div><button type="button" class="danger" data-c="yes">Usuń</button><button type="button" data-c="no">Zostaw</button></div></div>`;
      acts.querySelector('[data-c="no"]')?.addEventListener('click', () => this.renderMenu());
      acts
        .querySelector('[data-c="yes"]')
        ?.addEventListener('click', () => void this.deleteCurrent());
    });
  }

  private async deleteCurrent(): Promise<void> {
    const t = this.t;
    if (!t || !this.custom.has(t.id)) return;
    await this.store.remove(t.id);
    this.custom.delete(t.id);
    this.templates = this.templates.filter((x) => x.id !== t.id);
    delete this.saved.sheets[t.id];
    dropPrint(t);
    this.closeMenu();
    const next = this.templates[0];
    if (next) await this.useTemplate(next.id);
    this.renderMenu();
    this.persist();
  }

  private toggleMenu(): void {
    const open = this.ui.menu.hidden;
    if (open) this.renderMenu();
    this.ui.menu.hidden = !open;
    this.ui.tplBtn.setAttribute('aria-expanded', String(open));
    if (open) (this.ui.menu.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
  }

  private closeMenu(): void {
    this.ui.menu.hidden = true;
    this.ui.tplBtn.setAttribute('aria-expanded', 'false');
  }

  // ═════════════════════════════════════════════════════ zdarzenia

  private bindUi(): void {
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('contextmenu', (e) => {
      // przytrzymanie pola na dotyku pokazuje opis, nie menu przeglądarki
      if (this.press?.held || this.tipKey) e.preventDefault();
    });
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hideTip();
      if (!this.drag && this.active) {
        this.active.cloth.hoverWant = 0;
        c.style.cursor = '';
      }
    });
    c.addEventListener(
      'touchend',
      (e) => {
        if (e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    c.addEventListener(
      'wheel',
      (e) => {
        if (!(e.ctrlKey || e.metaKey) || this.drag) return;
        e.preventDefault();
        this.zoom = clamp(this.zoom * Math.exp(e.deltaY * 0.004), 0.55, 1.35);
        this.layoutCamera();
      },
      { passive: false },
    );

    this.ui.tplBtn.addEventListener('click', () => this.toggleMenu());
    this.wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePicker();
        this.closeMenu();
      }
    });
    this.wrap.addEventListener('pointerdown', (e) => {
      if (!this.ui.menu.hidden && !(e.target as HTMLElement).closest('.bar')) this.closeMenu();
    });

    const syncSound = (this.syncSound = (): void => {
      this.ui.sound.setAttribute('aria-pressed', String(this.sfx.on));
      this.ui.sound.title = this.sfx.on ? 'Wycisz dźwięki' : 'Włącz dźwięki';
    });
    syncSound();
    this.ui.sound.addEventListener('click', () => {
      this.sfx.on = !this.sfx.on;
      this.saved.sound = this.sfx.on;
      if (this.sfx.on) this.sfx.unlock();
      syncSound();
      this.persist();
    });

    this.syncHelp();
    new ResizeObserver(() => this.syncHelp()).observe(this.wrap);
    (this.root.querySelector('.help-close') as HTMLElement).addEventListener('click', () => {
      this.saved.help = false;
      this.syncHelp();
      this.persist();
    });
    this.ui.helpBtn.addEventListener('click', () => {
      this.saved.help = true;
      if (this.wrap.clientWidth < 720 || this.wrap.clientHeight < 520) {
        this.ui.help.hidden = !this.ui.help.hidden;
      } else this.syncHelp();
      this.persist();
    });
    const fileIn = this.ui.fileIn as HTMLInputElement;
    fileIn.addEventListener('change', () => {
      const f = fileIn.files?.[0];
      fileIn.value = '';
      if (f) void this.importFile(f);
    });
    this.ui.dlg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-d]') as HTMLElement | null;
      if (!b && e.target !== this.ui.dlg) return;
      if (b?.dataset.d === 'copy') {
        const ta = this.ui.dlg.querySelector('textarea') as HTMLTextAreaElement;
        ta.select();
        navigator.clipboard?.writeText(ta.value).then(
          () =>
            ((this.ui.dlg.querySelector('.dlg-msg') as HTMLElement).textContent =
              'Skopiowano do schowka.'),
          () =>
            ((this.ui.dlg.querySelector('.dlg-msg') as HTMLElement).textContent =
              'Zaznaczyłem tekst — skopiuj go skrótem klawiszowym.'),
        );
        return;
      }
      this.ui.dlg.hidden = true;
    });

    (this.ui.pkName as HTMLFormElement).addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = this.ui.pkInput as HTMLInputElement;
      this.setName(Number(inp.dataset.p), inp.value);
      this.closePicker();
    });
    (this.root.querySelector('.pk-close') as HTMLElement).addEventListener('click', () =>
      this.closePicker(),
    );
    const num = this.ui.pkIn as HTMLInputElement;
    // litery nie pojawiają się w polu wcale: blokujemy je, zanim trafią do pola
    num.addEventListener('beforeinput', (e) => {
      const ie = e as InputEvent;
      if (ie.inputType !== 'insertText' || !ie.data) return;
      if (/^[-\u2212+]$/.test(ie.data)) {
        e.preventDefault();
        this.flipSign(ie.data === '+' ? false : num.value.startsWith('-') ? undefined : true);
        return;
      }
      if (/\D/.test(ie.data)) e.preventDefault();
    });
    num.addEventListener('input', () => {
      const clean = this.cleanNumber(num.value);
      if (clean !== num.value) {
        num.value = clean;
        num.setSelectionRange(clean.length, clean.length);
      }
      this.validateTyped();
    });
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.commitTyped(e.shiftKey ? -1 : 1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // strzałki przechodzą po dozwolonych wartościach
        const line = this.pk && this.t ? this.t.lines[this.pk.spot.li] : null;
        if (!line) return;
        e.preventDefault();
        const cur = parseInt(num.value, 10);
        num.value = String(
          stepValue(line, Number.isFinite(cur) ? cur : null, e.key === 'ArrowUp' ? 1 : -1),
        );
        this.validateTyped();
      }
    });
    (this.ui.pkType as HTMLFormElement).addEventListener('submit', (e) => {
      e.preventDefault();
      this.commitTyped(0);
    });
    this.ui.pkSign.addEventListener('click', () => {
      this.flipSign();
      num.focus({ preventScroll: true });
    });
    // cyfra wciśnięta, gdy fokus jest na przycisku listy, trafia do pola
    this.ui.picker.addEventListener('keydown', (e) => {
      if (e.target === num || this.ui.pkType.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        num.focus({ preventScroll: true });
        num.value = this.cleanNumber(num.value + e.key);
        this.validateTyped();
      }
    });
    this.ui.chip.addEventListener('click', () => this.showHistory());
  }

  private setRay(cx: number, cy: number, cam: THREE.Camera = this.camera): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, cam);
  }

  private hitTest(cx: number, cy: number): Hit | null {
    const a = this.active;
    const t = this.t;
    const s = this.spec;
    if (!a || !t || !s) return null;
    this.setRay(cx, cy);
    const area = s.area;
    // przy kartce o niestandardowym kształcie liczy się tylko trafienie w papier (wycięcia przepuszczają)
    const h = this.raycaster
      .intersectObject(a.mesh, false)
      .find((x) => x.uv && (!area || area.inside(x.uv.x, 1 - x.uv.y)));
    if (!h) return null;
    const uv = (h.uv as THREE.Vector2).clone();
    const point = h.point.clone();
    const back = !!h.face && this.raycaster.ray.direction.dot(h.face.normal) > 0;
    if (!a.resting || back) return { kind: 'edge', uv, point };
    const sx = uv.x * s.W;
    const sy = (1 - uv.y) * s.H;
    const edge = area ? area.edgeDist(uv.x, 1 - uv.y) * s.W : Math.min(sx, s.W - sx, s.H - sy);
    if (edge < this.cfg.tear.edgeGrab) return { kind: 'edge', uv, point };
    // uv siatki to układ fizyczny; pola leżą we współrzędnych treści
    const c = s.rot ? { u: 1 - uv.y, v: 1 - uv.x } : { u: uv.x, v: 1 - uv.y };
    const sp = hitSpot(t, c.u, c.v);
    if (sp) {
      const kind = t.lines[sp.li].kind;
      if (kind === 'input') return { kind: 'cell', uv, point, spot: sp };
      if (kind === 'names') return { kind: 'name', uv, point, spot: sp };
    }
    return { kind: 'none', uv, point, spot: sp ?? undefined };
  }

  /** Najbliższy węzeł papieru (z pominięciem dwóch wierszy pod taśmą). */
  private nearestParticle(uv: THREE.Vector2): number {
    const s = this.spec as Spec;
    const real = this.active?.cloth.real;
    const x = uv.x * s.W;
    const z = (1 - uv.y) * s.H;
    let idx = 2 * s.NX + clamp(Math.round(uv.x * (s.NX - 1)), 0, s.NX - 1);
    let best = Infinity;
    for (let j = 2; j < s.NY; j++) {
      for (let i = 0; i < s.NX; i++) {
        const id = j * s.NX + i;
        if (real && !real[id]) continue;
        const d = (i * s.DX - x) ** 2 + (s.zr[j] - z) ** 2;
        if (d < best) {
          best = d;
          idx = id;
        }
      }
    }
    return idx;
  }

  private edgeParticle(uv: THREE.Vector2): number {
    const s = this.spec as Spec;
    const cl = this.active?.cloth;
    if (s.area && cl) {
      // węzeł papieru leżący na brzegu kształtu (obok węzła spoza kartki albo na skraju siatki)
      const x = uv.x * s.W;
      const z = (1 - uv.y) * s.H;
      let idx = this.nearestParticle(uv);
      let best = Infinity;
      for (let j = 3; j < s.NY; j++) {
        for (let i = 0; i < s.NX; i++) {
          const id = j * s.NX + i;
          if (!cl.real[id]) continue;
          const rim =
            i === 0 ||
            i === s.NX - 1 ||
            j === s.NY - 1 ||
            !cl.real[id - 1] ||
            !cl.real[id + 1] ||
            !cl.real[id + s.NX] ||
            !cl.real[id - s.NX];
          if (!rim) continue;
          const d = (i * s.DX - x) ** 2 + (s.zr[j] - z) ** 2;
          if (d < best) {
            best = d;
            idx = id;
          }
        }
      }
      return idx;
    }
    const fi = uv.x * (s.NX - 1);
    const z = (1 - uv.y) * s.H;
    const dl = uv.x * s.W;
    const dr = (1 - uv.x) * s.W;
    const db = s.H - z;
    if (db <= Math.min(dl, dr)) return (s.NY - 1) * s.NX + clamp(Math.round(fi), 0, s.NX - 1);
    const j = (this.nearestParticle(uv) / s.NX) | 0;
    return Math.max(3, j) * s.NX + (dl < dr ? 0 : s.NX - 1);
  }

  private onDown(e: PointerEvent): void {
    this.sfx.unlock();
    this.closeMenu();
    if (!e.isPrimary || this.switching) return;
    if (this.pickerOpen) {
      this.closePicker();
      return;
    }
    this.hideTip();
    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === 'edge') {
      e.preventDefault();
      this.beginDrag(e, hit);
      return;
    }
    const sp = hit.spot;
    if (hit.kind === 'cell' || hit.kind === 'name' || (sp && this.hintOf(sp))) {
      const press = { x: e.clientX, y: e.clientY, hit, held: false };
      this.press = press;
      // dotyk: przytrzymanie pokazuje opis kategorii (i wtedy nie otwiera wpisywania)
      if (e.pointerType !== 'mouse' && sp && this.hintOf(sp)) {
        clearTimeout(this.holdTimer);
        this.holdTimer = window.setTimeout(() => {
          if (this.press !== press) return;
          press.held = true;
          this.showTip(sp, 4200);
          try {
            navigator.vibrate?.(8);
          } catch {
            /* bez wibracji */
          }
        }, 450);
      }
    }
  }

  private onMove(e: PointerEvent): void {
    const now = performance.now();
    if (this.lastMove.t) {
      const v =
        (Math.hypot(e.clientX - this.lastMove.x, e.clientY - this.lastMove.y) /
          Math.max(1, now - this.lastMove.t)) *
        1000;
      this.pointerSpeed = lerp(this.pointerSpeed, v, 0.35);
    }
    this.lastMove = { x: e.clientX, y: e.clientY, t: now };
    if (this.drag) {
      if (e.pointerId === this.drag.pointerId) this.updateDragRaw(this.drag, e.clientX, e.clientY);
      return;
    }
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 10)
      clearTimeout(this.holdTimer);
    if (e.pointerType === 'mouse') this.hoverQueued = { x: e.clientX, y: e.clientY };
  }

  private onUp(e: PointerEvent): void {
    if (this.drag && e.pointerId === this.drag.pointerId) {
      this.endDrag(false);
      return;
    }
    clearTimeout(this.holdTimer);
    const pr = this.press;
    this.press = null;
    if (!pr || !this.active || pr.held) return;
    if (
      Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 10 &&
      e.type === 'pointerup' &&
      this.active.resting
    ) {
      if (pr.hit.kind === 'cell' && pr.hit.spot) this.openCellPicker(pr.hit.spot);
      else if (pr.hit.kind === 'name' && pr.hit.spot) this.openNamePicker(pr.hit.spot);
    }
  }

  private processHover(): void {
    if (!this.hoverQueued || this.drag || !this.active) return;
    const { x, y } = this.hoverQueued;
    this.hoverQueued = null;
    const hit = this.hitTest(x, y);
    const cl = this.active.cloth;
    const c = this.renderer.domElement;
    if (hit && hit.kind === 'edge' && this.active.resting) {
      c.style.cursor = 'grab';
      cl.hover = this.edgeParticle(hit.uv);
      cl.hoverWant = 1;
      cl.wake();
    } else {
      cl.hoverWant = 0;
      c.style.cursor =
        hit && (hit.kind === 'cell' || hit.kind === 'name')
          ? 'pointer'
          : hit && hit.kind === 'edge'
            ? 'grab'
            : '';
    }
    // chmurka z opisem kategorii nad polem pod kursorem
    const sp =
      hit && hit.kind !== 'edge' && this.active.resting && !this.pickerOpen ? hit.spot : undefined;
    this.hoverTip(sp && this.hintOf(sp) ? sp : null);
  }

  // ═════════════════════════════════════════════════════ chmurka z opisem kategorii

  private hintOf(sp: Spot): string {
    return (this.t?.lines[sp.li]?.hint ?? '').trim();
  }

  private hoverTip(sp: Spot | null): void {
    if ((sp?.key ?? null) === this.tipKey) return;
    clearTimeout(this.tipTimer);
    if (!sp) {
      this.hideTip();
      return;
    }
    // przy przejściu między polami chmurka zmienia się od razu (także tuż po zniknięciu), pierwsza — po chwili
    const warm =
      (!this.ui.tip.hidden && this.ui.tip.classList.contains('on')) ||
      performance.now() - this.tipHiddenAt < 600;
    this.tipKey = sp.key;
    if (warm) this.showTip(sp);
    else this.tipTimer = window.setTimeout(() => this.showTip(sp), 320);
  }

  private showTip(sp: Spot, autoHide = 0): void {
    const t = this.t;
    const tip = this.ui.tip as HTMLElement;
    if (!t || !this.active) return;
    const line = t.lines[sp.li];
    const text = this.hintOf(sp);
    if (!line || !text) return;
    clearTimeout(this.tipTimer);
    this.tipKey = sp.key;
    (this.ui.tipT as HTMLElement).textContent = line.label;
    (this.ui.tipX as HTMLElement).textContent = text;
    tip.hidden = false;
    tip.classList.remove('up', 'down');
    // punkt zaczepienia: środek górnej (albo dolnej) krawędzi pola na ekranie
    const r = sp.rect;
    const a = this.screenOf(r.x + r.w / 2, 1 - r.y);
    const b = this.screenOf(r.x + r.w / 2, 1 - (r.y + r.h));
    const cx = (a.x + b.x) / 2;
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const W = this.wrap.clientWidth;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const x = clamp(cx - w / 2, 8, Math.max(8, W - w - 8));
    const up = top - h - 10 >= 8;
    tip.classList.add(up ? 'up' : 'down');
    tip.style.left = `${x}px`;
    tip.style.top = `${up ? top - h - 10 : bottom + 10}px`;
    tip.style.setProperty('--ax', `${clamp(cx - x, 14, w - 14)}px`);
    tip.classList.remove('on');
    void tip.offsetWidth;
    tip.classList.add('on');
    if (autoHide) this.tipTimer = window.setTimeout(() => this.hideTip(), autoHide);
  }

  private hideTip(): void {
    clearTimeout(this.tipTimer);
    this.tipKey = null;
    const tip = this.ui.tip as HTMLElement | undefined;
    if (!tip || tip.hidden) return;
    if (tip.classList.contains('on')) this.tipHiddenAt = performance.now();
    tip.classList.remove('on');
    this.tipTimer = window.setTimeout(() => {
      if (!this.tipKey) tip.hidden = true;
    }, 160);
  }

  // ═════════════════════════════════════════════════════ przewracanie i odrywanie

  private floorPoint(cx: number, cy: number, y: number, out: THREE.Vector3): boolean {
    this.setRay(cx, cy, this.dragCam ?? this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    return !!this.raycaster.ray.intersectPlane(plane, out);
  }

  private beginDrag(e: PointerEvent, hit: Hit): void {
    this.hideTip();
    const a = this.active as PaperSheet;
    const cl = a.cloth;
    this.closePicker();
    const idx = this.nearestParticle(hit.uv);
    const o = idx * 3;
    const p = new THREE.Vector3(cl.pos[o], cl.pos[o + 1], cl.pos[o + 2]);
    const R = Math.max(0.2, cl.rest[o + 2] - cl.hingeZ);
    const theta = Math.atan2(Math.max(0, p.y - cl.floorY), p.z - cl.hingeZ);
    this.dragCam = this.camera.clone();
    this.dragCam.updateMatrixWorld();
    const f = new THREE.Vector3();
    if (!this.floorPoint(e.clientX, e.clientY, cl.floorY, f)) return;
    this.drag = {
      idx,
      pointerId: e.pointerId,
      R,
      s0: clamp(theta / (Math.PI / 2), 0, 2),
      z0: f.z,
      offX: p.x - f.x,
      raw: p.clone(),
      clamped: p.clone(),
      excess: 0,
      loads: new Float32Array(this.spec!.NX),
      x: e.clientX,
      y: e.clientY,
      tearing: false,
    };
    cl.hoverWant = 0;
    cl.startGrab(idx, p);
    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* przeciąganie działa i bez przechwycenia */
    }
    this.renderer.domElement.style.cursor = 'grabbing';
    this.sfx.rustle();
  }

  /**
   * Widok z góry: przesunięcie kursora w stronę grzbietu obraca kartkę wokół zawiasu
   * (od leżącej, przez pionową, do przewróconej za grzbiet). Ruch dalej niż pozwala kartka
   * staje się ciągnięciem, które przy dużej sile odrywa ją od kleju.
   */
  private updateDragRaw(d: Drag, cx: number, cy: number): void {
    const cl = (this.active as PaperSheet).cloth;
    const f = new THREE.Vector3();
    if (!this.floorPoint(cx, cy, cl.floorY, f)) return;
    const k = 0.62;
    const s = d.s0 + (d.z0 - f.z) / (d.R * k);
    const zh = cl.hingeZ;
    const yf = cl.floorY;
    const x = f.x + d.offX;
    if (s < 0) d.raw.set(x, yf, zh + d.R - s * d.R * k);
    else if (s > 2) d.raw.set(x, yf, zh - d.R - (s - 2) * d.R * k);
    else {
      const th = (s * Math.PI) / 2;
      d.raw.set(x, yf + d.R * Math.sin(th), zh + d.R * Math.cos(th));
    }
    d.x = cx;
    d.y = cy;
  }

  private evaluatePull(d: Drag): void {
    const cl = (this.active as PaperSheet).cloth;
    const NX = cl.s.NX;
    const R = cl.rest;
    const g = d.idx * 3;
    const out = d.clamped.copy(d.raw);
    const reach = (i: number): number => {
      const o = (NX + i) * 3;
      return Math.hypot(R[g] - R[o], R[g + 2] - R[o + 2]) + 0.01;
    };
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < NX; i++) {
        if (!cl.glued[i]) continue;
        const o = (NX + i) * 3;
        const dx = out.x - R[o];
        const dy = out.y - R[o + 1];
        const dz = out.z - R[o + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const r = reach(i);
        if (L > r) {
          const kk = r / L;
          out.set(R[o] + dx * kk, R[o + 1] + dy * kk, R[o + 2] + dz * kk);
        }
      }
      cl.clampPoint(out);
    }
    d.excess = d.raw.distanceTo(out);
    for (let i = 0; i < NX; i++) {
      const o = (NX + i) * 3;
      d.loads[i] = cl.glued[i]
        ? Math.max(0, Math.hypot(d.raw.x - R[o], d.raw.y - R[o + 1], d.raw.z - R[o + 2]) - reach(i))
        : 0;
    }
  }

  private updateTear(d: Drag, dt: number): void {
    const cl = (this.active as PaperSheet).cloth;
    const NX = cl.s.NX;
    const T = this.cfg.tear;
    // szybkie szarpnięcie przyspiesza pękanie kleju (siła wpływu: tear.speed)
    const speedF = Math.max(
      0.05,
      1 + (clamp((this.pointerSpeed - 150) / 800, 0.18, 2.6) - 1) * T.speed,
    );
    let released = cl.releasedCount();
    for (let i = 0; i < NX; i++) {
      if (!cl.glued[i]) continue;
      // klej puszcza wyłącznie pod naciągiem — bez ciągnięcia rozdarcie się nie posuwa
      let rate = 0;
      if (d.loads[i] > T.threshold) rate += (d.loads[i] - T.threshold) * T.rate * speedF;
      const nb = cl.neighbourReleased(i);
      if (nb && d.excess > T.threshold * 0.4) rate += T.spread * d.excess * Math.max(speedF, 0.6);
      cl.damage[i] += rate * dt;
      if (cl.damage[i] >= 1) {
        cl.release(i);
        released++;
        d.tearing = true;
        this.sfx.crackle();
      }
    }
    if (released >= cl.glueCols) this.completeTear();
  }

  private endDrag(silent: boolean): void {
    const d = this.drag;
    if (!d || !this.active) return;
    // puszczona w połowie odrywania kartka zostaje przy bloczku (częściowo oderwana)
    void silent;
    this.active.cloth.endGrab();
    try {
      this.renderer.domElement.releasePointerCapture(d.pointerId);
    } catch {
      /* już zwolniony */
    }
    this.drag = null;
    this.dragCam = null;
    this.ui.tension.hidden = true;
    this.renderer.domElement.style.cursor = '';
  }

  private completeTear(): void {
    const sheet = this.active;
    const t = this.t;
    if (!sheet || !t || !this.pad) return;
    const cl = sheet.cloth;
    for (let i = 0; i < cl.s.NX; i++) cl.release(i);
    cl.endGrab();
    cl.flying = true;
    cl.flyT = 0;
    cl.wake();
    sheet.uni.uTorn.value = 1;
    sheet.focus = null;
    sheet.dirty = true;
    if (this.drag) {
      try {
        this.renderer.domElement.releasePointerCapture(this.drag.pointerId);
      } catch {
        /* już zwolniony */
      }
    }
    this.drag = null;
    this.dragCam = null;
    this.ui.tension.hidden = true;
    this.renderer.domElement.style.cursor = '';
    this.flyers.push(sheet);

    const entry = this.recordSheet(sheet.data, t);
    // tryb klubowy: partie zapisuje aplikacja, notes nie prowadzi własnej historii
    if (entry && !this.opts.club) {
      this.saved.history.unshift(entry);
      this.saved.history = this.saved.history.slice(0, 40);
    }
    const st = this.saved.sheets[t.id];
    st.left = st.left > 1 ? st.left - 1 : this.cfg.view.sheets;
    this.pad.setLeft(st.left);
    st.data = blankSheet(t, sheet.data.game + 1);
    this.active = this.makeSheet(st.data);
    this.scene.add(this.active.mesh);
    this.updatePadInfo();
    this.persist();
    this.sfx.whoosh();
    const data = sheet.data;
    window.setTimeout(() => this.showSaved(entry, data, t), 700);
    if (entry) {
      const detail: PadSaveDetail = { ...entry, sheet: packSheet(data) };
      this.host.dispatchEvent(
        new CustomEvent('scorepad:save', { detail, bubbles: true, composed: true }),
      );
    }
  }

  private recordSheet(d: SheetData, t: PadTemplate): HistoryEntry | null {
    if (!anyValue(d)) return null;
    const players: { name: string; total: number }[] = [];
    for (let p = 0; p < playerCount(t); p++) {
      if (!playerActive(t, d, p)) continue;
      players.push({
        name: d.names[p]?.text || `Gracz ${p + 1}`,
        total: computePlayer(t, valuesOf(t, d, p)).__total ?? 0,
      });
    }
    if (!players.length) return null;
    const best = Math.max(...players.map((p) => p.total));
    return {
      id: uid(),
      tpl: t.id,
      tplName: t.name,
      game: d.game,
      at: new Date().toISOString(),
      players,
      winners: players.filter((p) => p.total === best).map((p) => p.name),
    };
  }

  // ═════════════════════════════════════════════════════ wybór liczby

  /** Punkt kartki na ekranie; (u, v) we współrzędnych tekstury treści (v = 1 u góry). */
  private screenOf(u: number, v: number): { x: number; y: number } {
    // notes klejony z lewej: punkt treści (u, y = 1 − v) leży w punkcie fizycznym (1 − y, u), czyli w uv (v, 1 − u)
    const [pu, pv] = this.spec?.rot ? [v, 1 - u] : [u, v];
    const p = (this.active as PaperSheet).cloth
      .pointAt(pu, pv, new THREE.Vector3())
      .project(this.camera);
    const r = this.wrap.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height };
  }

  private anchors(sp: Spot): [{ x: number; y: number }, { x: number; y: number }] {
    const r = sp.rect;
    const v = 1 - (r.y + r.h / 2);
    return [this.screenOf(r.x, v), this.screenOf(r.x + r.w, v)];
  }

  private placePicker(l: { x: number; y: number }, r: { x: number; y: number }): void {
    const pk = this.ui.picker;
    pk.hidden = false;
    const W = this.wrap.clientWidth;
    const H = this.wrap.clientHeight;
    if (W < 560 || H < 360) {
      pk.classList.add('as-sheet');
      pk.style.left = '';
      pk.style.top = '';
    } else {
      pk.classList.remove('as-sheet');
      const b = pk.getBoundingClientRect();
      let x = r.x + 16;
      if (x + b.width > W - 12) x = l.x - 16 - b.width;
      x = clamp(x, 12, W - b.width - 12);
      const y = clamp((l.y + r.y) / 2 - b.height / 2, 12, H - b.height - 12);
      pk.style.left = `${x}px`;
      pk.style.top = `${y}px`;
    }
    requestAnimationFrame(() => pk.classList.add('open'));
    this.hideTip();
    this.pickerOpen = true;
    this.pickerShownAt = performance.now();
  }

  private closePicker(): void {
    if (!this.pickerOpen) return;
    this.pickerOpen = false;
    this.pk = null;
    this.ui.picker.hidden = true;
    this.ui.picker.classList.remove('open');
    if (this.active) {
      this.active.focus = null;
      this.active.dirty = true;
    }
  }

  private button(
    label: string,
    cls: string,
    onClick: () => void,
    aria?: string,
  ): HTMLButtonElement {
    const b = el('button', cls);
    b.type = 'button';
    b.textContent = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => {
      if (performance.now() - this.pickerShownAt < 380) return;
      onClick();
    });
    return b;
  }

  private openCellPicker(sp: Spot): void {
    const a = this.active as PaperSheet;
    const t = this.t as PadTemplate;
    const line = t.lines[sp.li];
    const p = sp.p;
    const cell = cellOf(a.data, t, sp);
    if (!cell) return;
    const neg = canBeNegative(line);
    this.pk = { spot: sp, neg };
    this.ui.pkTitle.textContent = line.label;
    this.ui.pkWho.textContent = a.data.names[p]?.text || `Gracz ${p + 1}`;
    // kilka pól tej samej kategorii u gracza: które to pole
    const same = spots(t).filter((x) => x.field && x.li === sp.li && x.p === p);
    const which =
      sp.field && same.length > 1
        ? `pole ${same.findIndex((x) => x.key === sp.key) + 1} z ${same.length}, sumowane`
        : '';
    this.ui.pkHint.textContent = [which, line.hint, `dozwolone: ${describeValues(line)}`]
      .filter(Boolean)
      .join(' · ');
    this.ui.pkName.hidden = true;
    this.ui.pkType.hidden = false;
    this.ui.pkSign.hidden = !neg;
    this.ui.pkType.classList.toggle('nosign', !neg);
    const inp = this.ui.pkIn as HTMLInputElement;
    inp.value = cell.cur && !cell.cur.scratch ? String(cell.cur.value) : '';
    inp.placeholder = 'punkty';
    this.ui.pkErr.textContent = '';
    const acts = this.ui.pkActions;
    acts.replaceChildren();
    if (line.scratch) {
      const b = this.button('Skreśl (0 pkt)', 'pk-act', () => {
        this.setValue(sp, 0, true);
        this.closePicker();
      });
      if (cell.cur?.scratch) b.setAttribute('aria-pressed', 'true');
      acts.appendChild(b);
    }
    if (cell.cur) {
      acts.appendChild(
        this.button('Wykreśl wpis', 'pk-act subtle', () => {
          this.setValue(sp, null, false);
          this.closePicker();
        }),
      );
    }
    a.focus = sp;
    a.dirty = true;
    const [l, r] = this.anchors(sp);
    this.placePicker(l, r);
    this.validateTyped();
    // od razu można pisać; na telefonie wyskakuje klawiatura numeryczna
    inp.focus({ preventScroll: true });
    inp.select();
  }

  /** Zostawia w polu tylko cyfry i ewentualny minus na początku. */
  private cleanNumber(raw: string): string {
    const t = raw.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-');
    // nieparzysta liczba minusów = liczba ujemna (minus wpisany w dowolnym miejscu zmienia znak)
    const neg = !!this.pk?.neg && (t.match(/-/g)?.length ?? 0) % 2 === 1;
    const digits = t
      .replace(/\D+/g, '')
      .replace(/^0+(?=\d)/, '')
      .slice(0, 5);
    return (neg ? '-' : '') + digits;
  }

  private flipSign(force?: boolean): void {
    const inp = this.ui.pkIn as HTMLInputElement;
    if (!this.pk?.neg) {
      if (force !== false)
        this.ui.pkErr.textContent = 'Ta kategoria nie przyjmuje ujemnych punktów.';
      return;
    }
    const isNeg = inp.value.startsWith('-');
    const want = force ?? !isNeg;
    const body = inp.value.replace(/^-/, '');
    inp.value = (want ? '-' : '') + body;
    inp.setSelectionRange(inp.value.length, inp.value.length);
    this.validateTyped();
  }

  /** Sprawdza wpisaną liczbę; zwraca ją, gdy pasuje do kategorii. */
  private validateTyped(): number | null {
    const inp = this.ui.pkIn as HTMLInputElement;
    const ok = this.ui.pkOk as HTMLButtonElement;
    const err = this.ui.pkErr;
    const pk = this.pk;
    const line = pk && this.t ? this.t.lines[pk.spot.li] : null;
    const v = inp.value;
    if (!line || !v || v === '-') {
      ok.disabled = true;
      inp.removeAttribute('aria-invalid');
      if (err.textContent && !err.textContent.startsWith('Ta kategoria nie')) err.textContent = '';
      return null;
    }
    const n = parseInt(v, 10);
    if (isAllowed(line, n)) {
      ok.disabled = false;
      inp.removeAttribute('aria-invalid');
      err.textContent = '';
      return n;
    }
    ok.disabled = true;
    inp.setAttribute('aria-invalid', 'true');
    err.textContent = `Ta kategoria przyjmuje: ${describeValues(line)}.`;
    return null;
  }

  /** Następne (dir = 1) albo poprzednie pole punktów u tego samego gracza; po ostatnim — następny gracz. */
  private nextField(sp: Spot, dir: 1 | -1): Spot | null {
    const t = this.t as PadTemplate;
    const n = playerCount(t);
    const ins = spots(t).filter((x) => t.lines[x.li].kind === 'input');
    if (!ins.length || !n) return null;
    const by = (p: number): Spot[] => ins.filter((x) => x.p === p);
    let p = sp.p;
    let list = by(p);
    let k = list.findIndex((x) => x.key === sp.key) + dir;
    for (let guard = 0; guard <= n && (k < 0 || k >= list.length); guard++) {
      p = (p + dir + n) % n;
      list = by(p);
      k = dir > 0 ? 0 : list.length - 1;
    }
    return list[k] ?? null;
  }

  private commitTyped(move: 0 | 1 | -1): void {
    const pk = this.pk;
    if (!pk || !this.t) return;
    const inp = this.ui.pkIn as HTMLInputElement;
    if (inp.value && inp.value !== '-') {
      const n = this.validateTyped();
      if (n === null) {
        inp.focus();
        return;
      }
      this.setValue(pk.spot, n, false);
    }
    if (move === 0) {
      this.closePicker();
      return;
    }
    const next = this.nextField(pk.spot, move);
    this.closePicker();
    if (next) {
      this.pickerShownAt = 0;
      this.openCellPicker(next);
    }
  }

  private openNamePicker(sp: Spot): void {
    const a = this.active as PaperSheet;
    const p = sp.p;
    this.pk = null;
    this.ui.pkTitle.textContent = 'Imię gracza';
    this.ui.pkWho.textContent = `gracz ${p + 1}`;
    this.ui.pkHint.textContent = '';
    this.ui.pkErr.textContent = '';
    this.ui.pkType.hidden = true;
    this.ui.pkName.hidden = false;
    const inp = this.ui.pkInput as HTMLInputElement;
    inp.value = a.data.names[p]?.text ?? '';
    inp.dataset.p = String(p);
    const acts = this.ui.pkActions;
    acts.replaceChildren();
    if (a.data.names[p]) {
      acts.appendChild(
        this.button('Usuń imię', 'pk-act subtle', () => {
          this.setName(p, '');
          this.closePicker();
        }),
      );
    }
    a.focus = sp;
    a.dirty = true;
    const [l, r] = this.anchors(sp);
    this.placePicker(l, r);
    inp.focus({ preventScroll: true });
    inp.select();
  }

  private writeStart(d: SheetData): void {
    if (!d.started) {
      d.started = fmtDate(new Date());
      d.startInk = inkNow(450);
    }
  }

  private setValue(sp: Spot, value: number | null, scratch: boolean): void {
    const a = this.active as PaperSheet;
    const cell = cellOf(a.data, this.t as PadTemplate, sp);
    if (!cell) return;
    const cur = cell.cur;
    if (value === null) {
      if (!cur) return;
      cell.old = cur;
      cell.strike = inkNow();
      cell.cur = null;
    } else {
      if (cur && cur.value === value && cur.scratch === scratch) return;
      if (cur) {
        cell.old = cur;
        cell.strike = inkNow();
      }
      cell.cur = { value, scratch, ink: inkNow(cur ? 300 : 0) };
      this.writeStart(a.data);
    }
    this.sfx.scratch(scratch ? 380 : 140 + 100 * String(value ?? '').length);
    a.dirty = true;
    this.persist();
  }

  private setName(p: number, text: string): void {
    const a = this.active as PaperSheet;
    const tt = text.trim().slice(0, 14);
    if ((a.data.names[p]?.text ?? '') === tt) return;
    a.data.names[p] = tt ? { text: tt, ink: inkNow() } : null;
    if (tt) {
      this.writeStart(a.data);
      this.sfx.scratch(120 + 70 * tt.length);
    }
    a.dirty = true;
    this.persist();
  }

  // ═════════════════════════════════════════════════════ adnotacja i historia

  private showTension(frac: number, tearing: boolean): void {
    const d = this.drag;
    if (!d) return;
    const r = this.wrap.getBoundingClientRect();
    const el2 = this.ui.tension;
    el2.hidden = false;
    el2.style.transform = `translate(${d.x - r.left + 18}px, ${d.y - r.top + 14}px)`;
    (el2.querySelector('.t-val') as SVGElement).style.strokeDashoffset = String(
      100 - clamp(frac, 0, 1) * 100,
    );
    el2.classList.toggle('tearing', tearing);
    this.ui.tensionLabel.textContent = tearing
      ? 'Odrywam…'
      : frac > 0.85
        ? 'Szarpnij mocno!'
        : 'Ciągnij mocniej, by oderwać';
  }

  private showSaved(entry: HistoryEntry | null, data: SheetData, t: PadTemplate): void {
    if (this.destroyed) return;
    window.clearTimeout(this.annotTimer);
    this.ui.chip.hidden = true;
    const card = el('article', 'note');
    if (!entry) {
      card.innerHTML = `<span class="note-tape" aria-hidden="true"></span>
        <div class="note-top">
          <svg class="note-check" viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M9 10c7 6 15 13 22 21M31 9C24 16 16 24 9 31"/></svg>
          <div><h2 class="note-title"><span>Kartka oderwana</span></h2>
          <p class="note-meta">${esc(t.name)} · partia nr ${data.game}</p></div>
        </div>
        <p class="note-foot">Kartka była pusta, więc nic nie zapisano.</p>`;
    } else {
      const max = Math.max(1, ...entry.players.map((p) => Math.max(0, p.total)));
      const rows = [...entry.players]
        .sort((a, b) => b.total - a.total)
        .map((p, i) => {
          const win = entry.winners.includes(p.name);
          return `<li class="${win ? 'win' : ''}" style="--i:${i};--w:${Math.max(0.03, Math.max(0, p.total) / max).toFixed(3)}">
            <span class="nm">${esc(p.name)}</span><span class="meter"><i></i></span>
            <span class="sc"><b data-to="${p.total}">0</b>${win ? RING : ''}</span></li>`;
        })
        .join('');
      const foot =
        entry.players.length === 1
          ? `Wynik: <b>${esc(entry.players[0].name)}</b>`
          : entry.winners.length === 1
            ? `Wygrywa <b>${esc(entry.winners[0])}</b>`
            : `Remis: <b>${entry.winners.map(esc).join('</b> i <b>')}</b>`;
      card.innerHTML = `<span class="note-tape" aria-hidden="true"></span>
        <div class="note-top">
          <svg class="note-check" viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M7 21.5c3.2 2.4 6 5.6 8.6 9.4C20 21.2 26 13.4 34 7"/></svg>
          <div><h2 class="note-title"><span>Wynik zapisany</span></h2>
          <p class="note-meta">${esc(t.name)} · partia nr ${entry.game} · ${fmtTime(new Date(entry.at))}</p></div>
        </div>
        <ol class="note-rows">${rows}</ol>
        <p class="note-foot">${foot}</p>`;
    }
    this.ui.annot.replaceChildren(card);
    this.ui.annot.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.querySelectorAll<HTMLElement>('b[data-to]').forEach((b, i) => {
      const to = Number(b.dataset.to);
      if (reduce) {
        b.textContent = String(to);
        return;
      }
      const t0 = performance.now() + 620 + i * 90;
      const tick = (now: number): void => {
        const k = clamp((now - t0) / 750, 0, 1);
        b.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    this.annotTimer = window.setTimeout(() => this.collapseNote(card), 9000);
  }

  private collapseNote(card: HTMLElement): void {
    card.classList.add('out');
    window.setTimeout(() => {
      this.ui.annot.hidden = true;
      this.ui.annot.replaceChildren();
      this.updateChip(true);
    }, 480);
  }

  private updateChip(pop: boolean): void {
    const n = this.saved.history.length;
    const chip = this.ui.chip;
    chip.hidden = n === 0;
    chip.innerHTML = `<span class="chip-n">${n}</span> ${plural(n, 'zapisana partia', 'zapisane partie', 'zapisanych partii')}`;
    chip.classList.remove('pop');
    if (pop) {
      void chip.offsetWidth;
      chip.classList.add('pop');
    }
  }

  private showHistory(): void {
    window.clearTimeout(this.annotTimer);
    this.ui.chip.hidden = true;
    const card = el('article', 'note in still');
    const items = this.saved.history
      .slice(0, 10)
      .map((h) => {
        const d = new Date(h.at);
        const res = [...h.players]
          .sort((a, b) => b.total - a.total)
          .map(
            (p) =>
              `<span class="${h.winners.includes(p.name) ? 'w' : ''}">${esc(p.name)} <b>${p.total}</b></span>`,
          )
          .join('');
        return `<li><span class="h-meta">${esc(h.tplName ?? '')} · nr ${h.game} · ${fmtDate(d)}, ${fmtTime(d)}</span><span class="h-res">${res}</span></li>`;
      })
      .join('');
    card.innerHTML = `<span class="note-tape" aria-hidden="true"></span>
      <div class="note-top hist-top"><h2 class="note-title"><span>Zapisane partie</span></h2>
      <button type="button" class="note-close" aria-label="Zamknij listę">×</button></div>
      <ol class="hist">${items}</ol>`;
    (card.querySelector('.note-close') as HTMLButtonElement).addEventListener('click', () =>
      this.collapseNote(card),
    );
    this.ui.annot.replaceChildren(card);
    this.ui.annot.hidden = false;
  }

  // ═════════════════════════════════════════════════════ ustawienia i tryb debugowania

  /** Podmienia wartości ustawień w miejscu (obiekty sekcji zostają te same). */
  private replaceSettings(next: Settings): void {
    for (const sec of Object.keys(next) as (keyof Settings)[])
      Object.assign(this.cfg[sec], next[sec]);
  }

  private saveDebugSettings(): void {
    if (!this.debugAvail) return;
    const diff = diffSettings(this.cfg, this.baseCfg);
    this.saved.settings = Object.keys(diff).length ? diff : undefined;
    this.persist();
  }

  private syncHelp(): void {
    const roomy = this.wrap.clientWidth >= 720 && this.wrap.clientHeight >= 520;
    const show = this.cfg.ui.help && this.saved.help && roomy;
    this.ui.help.hidden = !show;
    this.ui.helpBtn.hidden = show || !this.cfg.ui.help;
  }

  /** Przenosi ustawienia na scenę, kartki, kamerę i interfejs. */
  private applySettings(): void {
    const c = this.cfg;
    if (!this.renderer) return;
    this.renderer.toneMappingExposure = c.light.exposure;
    this.key.intensity = c.light.key;
    this.key.color.set(c.light.keyColor);
    this.key.castShadow = c.light.shadows;
    this.back.intensity = c.light.back;
    this.hemi.intensity = c.light.ambient;
    this.placeLights();
    for (const sh of [this.active, ...this.flyers]) {
      if (!sh) continue;
      sh.cloth.applyStiffness();
      sh.uni.uTrans.value = c.light.transmission;
      sh.dirty = true;
    }
    if (this.camera.fov !== c.view.fov) this.camera.fov = c.view.fov;
    if (!c.view.autoZoom) this.autoZoom = 1;
    this.autoZoom = Math.min(this.autoZoom, c.view.autoZoomMax);
    this.poseCamera();
    this.ui.vignette.hidden = !c.view.vignette;
    (this.root.querySelector('.bar') as HTMLElement).hidden = !c.ui.controls;
    this.syncHelp();
    // dźwięk z ustawień; przełącznik na pasku działa niezależnie, dopóki ustawienie się nie zmieni
    if (this.uiSound !== null && this.uiSound !== c.ui.sound) {
      this.sfx.on = this.saved.sound = c.ui.sound;
      this.syncSound();
    }
    this.uiSound = c.ui.sound;
    if (this.t) {
      const st = this.saved.sheets[this.t.id];
      if (st && st.left > c.view.sheets) {
        st.left = c.view.sheets;
        this.pad?.setLeft(st.left);
        this.viz?.rebuildCollider();
      }
      this.updatePadInfo();
    }
    if (!this.ui.menu.hidden) this.renderMenu();
    this.viz?.show(c.debug.particles, c.debug.collider);
    this.emit('settings');
  }

  /** Stan symulacji do panelu debugowania. */
  private statsRows(): [string, string][] {
    const a = this.active;
    if (!a) return [];
    const cl = a.cloth;
    const state = cl.flying
      ? 'w locie'
      : this.drag
        ? this.drag.tearing
          ? 'odrywana'
          : 'trzymana'
        : cl.flipped
          ? 'przewrócona'
          : a.resting
            ? 'leży'
            : 'w ruchu';
    return [
      ['Klatki na sekundę', this.fps.toFixed(0)],
      ['Kroków fizyki na klatkę', String(this.stepsLast)],
      ['Węzły × więzy', `${cl.n} × ${cl.kind.length}`],
      ['Kartka', state + (cl.sleeping ? ' (uśpiona)' : '')],
      ['Uniesienie', cl.maxLift.toFixed(3)],
      ['Klej trzyma', `${cl.glueCols - cl.releasedCount()} z ${cl.glueCols} kolumn`],
      ['Naciąg ponad zasięg', this.drag ? this.drag.excess.toFixed(3) : '—'],
      ['Odsunięcie kamery', `${this.autoZoom.toFixed(2)}×`],
      ['Notes', this.t ? `${this.t.name} · ${fmtSize(this.t)}` : '—'],
      [
        'Pola',
        this.t ? `${spots(this.t).length} (${(this.t.fields ?? []).length} dowolnych)` : '—',
      ],
      [
        'Kształt kartki',
        this.t?.shape
          ? `własny · ${this.t.shape.outline.length} pkt${this.t.shape.holes?.length ? ` · otwory ${this.t.shape.holes.length}` : ''}`
          : 'prostokąt',
      ],
      ['Węzły papieru', cl ? `${cl.real.reduce((n, r) => n + r, 0)} z ${cl.n}` : '—'],
    ];
  }

  private blankSheetNow(): void {
    if (!this.t) return;
    const st = this.saved.sheets[this.t.id];
    st.data = blankSheet(this.t, st.data.game);
    if (this.active) {
      this.scene.remove(this.active.mesh);
      this.active.dispose();
    }
    this.active = this.makeSheet(st.data);
    this.scene.add(this.active.mesh);
    this.persist();
  }

  private emit(type: HostEvent, ...args: unknown[]): void {
    for (const fn of this.listeners.get(type) ?? []) fn(...args);
  }

  /** Interfejs dla wtyczek (pakiet edytora). */
  private makeHost(): PadHost {
    const self = this;
    return {
      element: this.host,
      shadow: this.root,
      frame: this.wrap,
      debug: this.opts.debug ?? false,
      settings: this.cfg,
      baseSettings: () => this.baseCfg,
      setSetting: (k, v) => this.setSetting(k, v),
      resetSetting: (k) => {
        setPath(this.cfg, k, getPath(this.baseCfg, k));
        this.saveDebugSettings();
        this.applySettings();
      },
      resetSettings: () => {
        this.replaceSettings(this.baseCfg);
        this.saveDebugSettings();
        this.applySettings();
      },
      templates: () => [...this.templates],
      current: () => this.t,
      isCustom: (id) => this.custom.has(id),
      saveTemplate: async (t, fresh) => {
        await this.store.put(t);
        this.custom.add(t.id);
        dropPrint(t);
        this.upsert(t);
        await this.useTemplate(t.id, fresh);
        this.renderMenu();
      },
      exportConfig: (o) => this.exportConfig(o),
      saveFile: (w) => this.saveConfigFile(w),
      copyConfig: async (w) => {
        const json = JSON.stringify(this.exportConfig({ sheet: w }), null, 2);
        try {
          await navigator.clipboard.writeText(json);
          return `Skopiowano plik notesu (${Math.max(1, Math.round(json.length / 1024))} KB).`;
        } catch {
          this.showDialog('Schowek jest tu niedostępny. Zaznacz tekst i skopiuj go ręcznie.', json);
          return '';
        }
      },
      pickFile: () => (this.ui.fileIn as HTMLInputElement).click(),
      tear: () => this.completeTear(),
      blankSheet: () => this.blankSheetNow(),
      clearHistory: () => {
        this.saved.history = [];
        this.updateChip(false);
        this.persist();
      },
      stats: () => this.statsRows(),
      suspend: (on) => {
        this.suspended = on;
      },
      setInset: (px) => {
        this.inset = Math.max(0, px);
        this.poseCamera();
      },
      addMenu: (f) => this.menuProviders.push(f),
      addTool: (b) => {
        b.classList.add('tool-btn');
        this.ui.tools.appendChild(b);
      },
      provide: (name, fn) => this.actions.set(name, fn),
      on: (type, fn) => {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
      },
      prefs: {
        get: (k) => self.saved.prefs?.[k],
        set: (k, v) => {
          self.saved.prefs = { ...(self.saved.prefs ?? {}), [k]: v };
          self.persist();
        },
      },
    };
  }

  private async importFile(f: File): Promise<void> {
    try {
      const name = await this.importConfig(await f.text(), true);
      this.emit('status', name ? `Wczytano notes „${name}”.` : 'Wczytano ustawienia.', 'ok');
    } catch (e) {
      const msg = (e as Error).message || 'Nie udało się wczytać pliku.';
      if (this.listeners.get('status')?.length) this.emit('status', msg, 'err');
      else this.showDialog(msg, '');
    }
  }

  /** Zapisuje plik notesu. W podglądzie Claude prosi o zgodę na pobranie; na zwykłej stronie pobiera od razu. */
  private async saveConfigFile(withSheet: boolean): Promise<string> {
    const json = JSON.stringify(this.exportConfig({ sheet: withSheet }), null, 2);
    const slug =
      (this.t?.name ?? 'notes')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'notes';
    const filename = `notes-${slug}.json`;
    const hostApi = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } })
      .claude;
    if (hostApi && typeof hostApi.use === 'function') {
      try {
        const dl = (await hostApi.use('downloads')) as {
          save(r: { filename: string; data: string }): Promise<unknown>;
        } | null;
        if (dl) {
          await dl.save({ filename, data: json });
          return `Zapisano ${filename}.`;
        }
      } catch (e) {
        if ((e as { code?: string }).code === 'declined') return 'Zapis anulowany.';
      }
      // podgląd bez pobierania plików: pokaż treść do skopiowania
      this.showDialog(
        `Pobieranie plików jest tu niedostępne. Skopiuj zawartość i zapisz ją jako ${filename}.`,
        json,
      );
      return '';
    }
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return `Zapisano ${filename}.`;
    } catch {
      this.showDialog(
        `Nie udało się pobrać pliku. Skopiuj zawartość i zapisz ją jako ${filename}.`,
        json,
      );
      return '';
    }
  }

  private showDialog(msg: string, text: string): void {
    const d = this.ui.dlg;
    (d.querySelector('.dlg-msg') as HTMLElement).textContent = msg;
    const ta = d.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = text;
    ta.hidden = !text;
    (d.querySelector('[data-d="copy"]') as HTMLElement).hidden = !text;
    d.hidden = false;
    (d.querySelector('[data-d="close"]') as HTMLElement).focus();
  }

  // ═════════════════════════════════════════════════════ pętla

  private loop(): void {
    cancelAnimationFrame(this.rafId);
    this.last = performance.now();
    const frame = (now: number): void => {
      if (this.destroyed || !this.visible) return;
      this.rafId = requestAnimationFrame(frame);
      this.tick(now);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.suspended) return;
    this.pointerSpeed *= Math.pow(0.04, dt);
    const a = this.active;
    if (!a || !this.renderer) {
      this.renderer?.render(this.scene, this.camera);
      return;
    }
    this.processHover();
    const cl = a.cloth;
    cl.hoverAmt += (cl.hoverWant - cl.hoverAmt) * Math.min(1, dt * 9);
    if (cl.hoverAmt > 0.001) cl.wake();

    const d = this.drag;
    if (d) {
      this.evaluatePull(d);
      cl.setTarget(d.clamped);
      this.updateTear(d, dt);
      if (this.drag) {
        const frac = d.tearing
          ? cl.releasedCount() / cl.glueCols
          : d.excess / this.cfg.tear.threshold;
        if (d.tearing || d.excess > 0.07) this.showTension(frac, d.tearing);
        else this.ui.tension.hidden = true;
      }
    }

    // kamera odsuwa się, gdy podniesiona kartka wychodzi poza kadr, i wraca, gdy kartka leży
    let want = 1;
    if (this.cfg.view.autoZoom && !a.resting && (a.cloth.maxLift > 0.04 || a.cloth.flipped))
      want = clamp(this.autoZoom * this.sheetExtent(a), 1, this.cfg.view.autoZoomMax);
    if (Math.abs(want - this.autoZoom) > 0.002) {
      const rate = want > this.autoZoom ? 2.6 : 1.1;
      this.autoZoom += (want - this.autoZoom) * Math.min(1, dt * rate);
      this.poseCamera();
    }

    const sim = this.cfg.sim;
    const subDt = 1 / sim.rate;
    if (!sim.paused) this.acc += dt * sim.timeScale;
    let steps = Math.floor(this.acc / subDt);
    if (steps > sim.maxSteps) {
      steps = sim.maxSteps;
      this.acc = 0;
    } else this.acc -= steps * subDt;
    this.stepsLast = steps;
    const act = this.active as PaperSheet;
    for (let s = 0; s < steps; s++) {
      const al = (s + 1) / steps;
      act.cloth.step(subDt, al);
      for (const f of this.flyers) f.cloth.step(subDt, al);
    }
    if (steps > 0) act.cloth.gFrom.copy(act.cloth.gTo);

    for (const s of [act, ...this.flyers]) {
      if (s.dirty || s.animating) s.paint(now);
      if (s.cloth.moved) s.sync();
    }

    const fr = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    );
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.offscreen = fr.intersectsObject(f.mesh) ? 0 : f.offscreen + 1;
      if ((f.cloth.flyT > 0.6 && f.offscreen > 20) || f.cloth.flyT > 7) {
        this.scene.remove(f.mesh);
        f.dispose();
        this.flyers.splice(i, 1);
      }
    }
    if (this.viz) this.viz.update();
    this.frames++;
    if (now - this.statT > 300) {
      this.fps = (this.frames * 1000) / Math.max(1, now - this.statT);
      this.frames = 0;
      this.statT = now;
      this.emit('frame', now);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Do testów: wymusza oderwanie bieżącej kartki. */
  tearNow(): void {
    this.completeTear();
  }

  /** Do testów: stan kartki i przeciągania. */
  debug(): Record<string, unknown> {
    const a = this.active;
    return {
      game: a?.data.game,
      resting: a?.resting,
      flipped: a?.cloth.flipped,
      lift: a?.cloth.maxLift,
      released: a?.cloth.releasedCount(),
      excess: this.drag?.excess ?? null,
      flyers: this.flyers.length,
      tpl: this.t?.id,
    };
  }

  /** Do testów: punkt kartki na ekranie (współrzędne klienta). */
  pointOnSheet(u: number, v: number): { x: number; y: number } {
    const s = this.screenOf(u, v);
    const r = this.wrap.getBoundingClientRect();
    return { x: s.x + r.left, y: s.y + r.top };
  }
}

function fmtSize(t: PadTemplate): string {
  const f = (v: number): string => (Math.round(v * 10) / 10).toString().replace('.', ',');
  return `${f(t.size.w)} × ${f(t.size.h)} cm`;
}
